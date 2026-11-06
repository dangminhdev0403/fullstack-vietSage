import { Injectable } from "@nestjs/common";
import { Prisma, type KbttStayOperationStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { toYmd, VIETNAM_TIME_ZONE } from "../../../common/time/vietnam-temporal";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class KbttStayRepository {
  constructor(private readonly prisma: PrismaService) {}

  pendingEvents(take = 100) {
    return this.prisma.domainEvent.findMany({
      where: {
        eventType: { in: ["GUEST_STAY_DEPARTURE_CHANGED", "GUEST_CHECKED_OUT"] },
        aggregateType: "GuestStay",
        hotel: { kbttConnection: { isNot: null } },
        kbttStayReceipt: null,
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take,
    });
  }

  stay(hotelId: string, stayId: string) {
    return this.prisma.guestStay.findFirst({
      where: { hotelId, id: stayId },
      include: {
        room: { select: { roomNumber: true } },
        occupants: {
          include: {
            kbttGuestDeclarations: { orderBy: [{ revision: "desc" }, { createdAt: "desc" }] },
          },
        },
      },
    });
  }

  initialDeclaration(id: string, hotelId: string) {
    return this.prisma.kbttGuestDeclaration.findFirst({
      where: { id, hotelId }, include: { stay: true },
    });
  }

  async materialize(
    eventId: string,
    operations: Prisma.KbttStayOperationCreateManyInput[],
    summary: Prisma.InputJsonValue,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`kbtt-event:${eventId}`}, 0))::text`;
      if (await tx.kbttStayEventReceipt.findUnique({ where: { eventId } })) return;
      if (operations.length) {
        await tx.kbttStayOperation.createMany({ data: operations, skipDuplicates: true });
      }
      await tx.kbttStayEventReceipt.create({ data: { eventId, summaryJson: summary } });
    });
  }

  runnable(take = 100) {
    return this.prisma.kbttStayOperation.findMany({
      where: { status: { in: ["PENDING", "BLOCKED"] }, attemptedAt: null },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take,
    });
  }

  acknowledgedOperations(hotelId: string, occupantId: string, declarationId: string, identityKey: string) {
    return this.prisma.kbttStayOperation.findMany({
      where: { hotelId, occupantId, declarationId, identityKey, status: "SUCCEEDED" },
      orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
    });
  }

  async update(
    id: string,
    expected: KbttStayOperationStatus[],
    data: Prisma.KbttStayOperationUpdateManyMutationInput,
    claimToken?: string,
  ) {
    const result = await this.prisma.kbttStayOperation.updateMany({
      where: { id, status: { in: expected }, ...(claimToken ? { claimToken } : {}) },
      data,
    });
    return result.count === 1;
  }

  async acquire(csltId: string) {
    const token = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60_000);
    // No external calls inside a transaction. The lease outlives the provider timeout.
    const count = await this.prisma.$executeRaw`
      INSERT INTO "KbttDeliveryLease" ("csltId", "ownerToken", "expiresAt")
      VALUES (${csltId}, ${token}, ${expiresAt})
      ON CONFLICT ("csltId") DO UPDATE
      SET "ownerToken" = EXCLUDED."ownerToken", "expiresAt" = EXCLUDED."expiresAt"
      WHERE "KbttDeliveryLease"."expiresAt" <= ${now}`;
    return count === 1 ? token : null;
  }

  async release(csltId: string, token: string) {
    await this.prisma.kbttDeliveryLease.deleteMany({ where: { csltId, ownerToken: token } });
  }

  async renew(csltId: string, token: string) {
    const now = new Date();
    const result = await this.prisma.kbttDeliveryLease.updateMany({
      where: { csltId, ownerToken: token, expiresAt: { gt: now } },
      data: { expiresAt: new Date(now.getTime() + 5 * 60_000) },
    });
    return result.count === 1;
  }

  async claim(operation: { id: string; hotelId: string; stayId: string; csltId: string; kind: string; desiredDepartureAt: Date | null }, token: string, payload: Prisma.InputJsonValue, fingerprint: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "GuestStay" WHERE "id" = ${operation.stayId} AND "hotelId" = ${operation.hotelId} FOR UPDATE`;
      const stay = await tx.guestStay.findFirst({ where: { id: operation.stayId, hotelId: operation.hotelId } });
      if (!stay) return false;
      const active = ["ACTIVE", "CHECKED_IN", "CHECKOUT_PENDING"].includes(stay.status) && !stay.checkedOutAt;
      if (operation.kind === "CHECKOUT" ? !stay.checkedOutAt || active :
          !active || !operation.desiredDepartureAt ||
          toYmd(stay.plannedCheckOutAt, VIETNAM_TIME_ZONE) !== toYmd(operation.desiredDepartureAt, VIETNAM_TIME_ZONE)) return false;
      const now = new Date();
      if (operation.kind !== "CHECKOUT" && (!operation.desiredDepartureAt || toYmd(operation.desiredDepartureAt, VIETNAM_TIME_ZONE) < toYmd(now, VIETNAM_TIME_ZONE))) return false;
      const lease = await tx.kbttDeliveryLease.updateMany({
        where: { csltId: operation.csltId, ownerToken: token, expiresAt: { gt: now } },
        data: { expiresAt: new Date(now.getTime() + 5 * 60_000) },
      });
      if (lease.count !== 1) return false;
      const result = await tx.kbttStayOperation.updateMany({
        where: { id: operation.id, status: { in: ["PENDING", "BLOCKED"] }, attemptedAt: null },
        data: { status: "SENDING", claimToken: token, attemptedAt: now,
          payloadJson: payload, payloadFingerprint: fingerprint, providerCode: null, providerMessage: null },
      });
      return result.count === 1;
    });
  }

  async finish(id: string, token: string, result: Prisma.KbttStayOperationUpdateManyMutationInput, recovery?: Prisma.KbttStayOperationCreateManyInput) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.kbttStayOperation.updateMany({
        where: { id, status: "SENDING", claimToken: token }, data: result,
      });
      if (updated.count !== 1) return false;
      if (recovery) await tx.kbttStayOperation.createMany({ data: [recovery], skipDuplicates: true });
      return true;
    });
  }

  async recoverInterrupted() {
    const cutoff = new Date(Date.now() - 5 * 60_000);
    await this.prisma.kbttStayOperation.updateMany({
      where: { status: "SENDING", updatedAt: { lt: cutoff } },
      data: {
        status: "UNKNOWN",
        providerCode: "INTERRUPTED_DELIVERY",
        providerMessage: "Lần gửi bị gián đoạn; cần đối soát trước khi thực hiện tiếp.",
      },
    });
  }

  uncertainOperations(csltId: string, identityKey: string, excludeId?: string) {
    return this.prisma.kbttStayOperation.findMany({
      where: {
        csltId,
        identityKey,
        status: { in: ["SENDING", "UNKNOWN"] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      take: 1,
    });
  }

  async declarationsForIdentity(csltId: string, kind: "VIETNAMESE" | "FOREIGN", number: string) {
    const field = kind === "VIETNAMESE" ? "soGiayTo" : "soHoChieu";
    const qualifier = kind === "VIETNAMESE" ? "loaiGiayTo" : "quocTich";
    // Current occupant details must not change which prior deliveries are found.
    // Legacy uncertain deliveries retain their draft fallback and unknown-identity barrier.
    const matches = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT d."id"
      FROM "KbttGuestDeclaration" d
      CROSS JOIN LATERAL (
        SELECT
          CASE
            WHEN jsonb_typeof(d."submittedPayloadJson" -> 0) = 'object' THEN d."submittedPayloadJson" -> 0
            WHEN jsonb_typeof(d."submittedPayloadJson") = 'object' THEN d."submittedPayloadJson"
          END AS submitted_guest,
          CASE
            WHEN jsonb_typeof(d."draftPayloadJson" -> 0) = 'object' THEN d."draftPayloadJson" -> 0
            WHEN jsonb_typeof(d."draftPayloadJson") = 'object' THEN d."draftPayloadJson"
          END AS draft_guest
      ) snapshots
      CROSS JOIN LATERAL (
        SELECT COALESCE(snapshots.submitted_guest,
          CASE WHEN d."status" IN ('SENDING', 'UNKNOWN') THEN snapshots.draft_guest END
        ) AS guest
      ) snapshot
      WHERE d."declarationKind" = ${kind}::"CitizenshipKind"
        AND d."status" IN ('SUBMITTED', 'SENDING', 'UNKNOWN')
        AND (d."submittedCsltId" = ${csltId} OR
          (d."submittedCsltId" IS NULL AND EXISTS (
            SELECT 1 FROM "KbttHotelConnection" c
            WHERE c."hotelId" = d."hotelId" AND c."csltId" = ${csltId}
          )))
        AND (upper(btrim(snapshot.guest ->> ${field})) = ${number.trim().toUpperCase()}
          OR (d."status" IN ('SENDING', 'UNKNOWN') AND (
            jsonb_typeof(snapshot.guest -> ${field}) IS DISTINCT FROM 'string'
            OR btrim(snapshot.guest ->> ${field}) = ''
            OR snapshot.guest -> ${qualifier} IS NULL
            OR snapshot.guest -> ${qualifier} = 'null'::jsonb
          )))
      ORDER BY d."createdAt" DESC, d."id" DESC
      LIMIT 101`;
    return this.prisma.kbttGuestDeclaration.findMany({
      where: { id: { in: matches.map((row) => row.id) } },
      include: { stay: { select: { checkedInAt: true, checkedOutAt: true, status: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // Bounded after identity filtering; callers fail closed at this ceiling.
      take: 101,
    });
  }

  closedOperation(declarationId: string) {
    return this.prisma.kbttStayOperation.findFirst({
      where: { declarationId, kind: "CHECKOUT", status: "SUCCEEDED" },
      select: { id: true },
    });
  }

}
