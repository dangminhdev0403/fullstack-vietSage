import { Injectable, Logger } from "@nestjs/common";
import { Prisma, type DomainEvent, type KbttHotelConnection, type KbttStayOperation } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { addDaysYmd, formatLocalDateTime, toYmd, VIETNAM_TIME_ZONE } from "../../../common/time/vietnam-temporal";
import { departurePayload, providerDate, providerDay, providerIdentity, sanitizedStayResult, submittedGuest, type DeclarationKind } from "../domain/kbtt-stay-sync";
import { kbttForeignReadySchema, kbttVietnameseReadySchema, type KbttSession } from "../domain/schemas/kbtt.schema";
import { KbttProviderClient, type KbttSubmitOutcome } from "../infrastructure/kbtt-provider.client";
import { KbttRepository } from "../infrastructure/kbtt.repository";
import { KbttStayRepository } from "../infrastructure/kbtt-stay.repository";

const eventPayload = z.object({
  stayId: z.string().min(1),
  version: z.literal(1).optional(),
  wasOverdue: z.boolean().optional(),
}).passthrough();
const ACTIVE_STAYS = new Set(["ACTIVE", "CHECKED_IN", "CHECKOUT_PENDING"]);
type SessionResolver = (hotelId: string, connection: KbttHotelConnection) => Promise<KbttSession>;

@Injectable()
export class KbttStaySyncService {
  private readonly logger = new Logger(KbttStaySyncService.name);

  constructor(
    private readonly repository: KbttStayRepository,
    private readonly declarations: KbttRepository,
    private readonly provider: KbttProviderClient,
  ) {}

  enabled() {
    return process.env.KBTT_STAY_LIFECYCLE_ENABLED === "true";
  }

  async run(resolveSession: SessionResolver) {
    if (!this.enabled() || process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true" ||
        process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true") return;
    await this.repository.recoverInterrupted();
    for (const event of await this.repository.pendingEvents()) {
      try {
        await this.materialize(event);
      } catch {
        // The event remains unacknowledged. Do not expose payloads or provider details.
        this.logger.warn(`Could not prepare BCA lifecycle event ${event.id}.`);
      }
    }
    for (const operation of await this.repository.runnable()) {
      try {
        await this.dispatch(operation, resolveSession);
      } catch {
        // A durable SENDING record is recovered as UNKNOWN, never automatically resent.
        this.logger.warn(`Could not finish BCA lifecycle operation ${operation.id}.`);
      }
    }
  }

  private async materialize(event: DomainEvent) {
    const parsed = eventPayload.safeParse(event.payload);
    if (!event.hotelId || !parsed.success || parsed.data.stayId !== event.aggregateId) {
      await this.repository.materialize(event.id, [], { reason: "INVALID_EVENT" });
      return;
    }
    const connection = await this.declarations.find(event.hotelId);
    const stay = await this.repository.stay(event.hotelId, event.aggregateId);
    if (!connection) return;
    if (!stay) {
      await this.repository.materialize(event.id, [], { reason: "STAY_NOT_FOUND" });
      return;
    }
    if (event.tenantId && event.tenantId !== connection.hotel.tenantId) {
      await this.repository.materialize(event.id, [], { reason: "SCOPE_MISMATCH" });
      return;
    }
    const operations: Prisma.KbttStayOperationCreateManyInput[] = [];
    const skipped: Array<{ occupantId: string; reason: string }> = [];
    for (const occupant of stay.occupants) {
      const declaration = occupant.kbttGuestDeclarations.find((d) => d.status === "SUBMITTED") ??
        occupant.kbttGuestDeclarations.find((d) => d.status === "SENDING" || d.status === "UNKNOWN");
      const guest = declaration && (submittedGuest(declaration.submittedPayloadJson) ??
        (declaration.status !== "SUBMITTED" ? submittedGuest(declaration.draftPayloadJson) : null));
      const identity = declaration && guest && providerIdentity(declaration.declarationKind, guest);
      if (!declaration || !identity) {
        skipped.push({ occupantId: occupant.id, reason: "INITIAL_DECLARATION_NOT_CONFIRMED" });
        continue;
      }
      const kind = event.eventType === "GUEST_CHECKED_OUT" ? "CHECKOUT" : "EXTEND";
      operations.push({
        hotelId: stay.hotelId, stayId: stay.id, occupantId: occupant.id,
        declarationId: declaration.id, declarationKind: declaration.declarationKind,
        sourceEventId: event.id, csltId: declaration.submittedCsltId ?? connection.csltId, identityKey: identity.key,
        kind, wasOverdue: parsed.data.wasOverdue === true,
        status: declaration.status === "SUBMITTED" ? "PENDING" : "BLOCKED",
        providerCode: declaration.status === "SUBMITTED" ? null : "INITIAL_DECLARATION_PENDING",
        desiredDepartureAt: kind === "EXTEND" ? stay.plannedCheckOutAt : null,
        deduplicationKey: kind === "CHECKOUT"
          ? `${stay.id}:${occupant.id}:CHECKOUT`
          : `${event.id}:${occupant.id}:EXTEND`,
      });
    }
    await this.repository.materialize(event.id, operations, { prepared: operations.length, skipped });
  }

  private async hold(operation: KbttStayOperation, code: string, message: string) {
    await this.repository.update(operation.id, ["PENDING", "BLOCKED"], {
      status: "BLOCKED", providerCode: code, providerMessage: message,
    });
  }

  private async supersede(operation: KbttStayOperation, code: string) {
    await this.repository.update(operation.id, ["PENDING", "BLOCKED"], {
      status: "SUPERSEDED", providerCode: code, resolvedAt: new Date(),
    });
  }

  private async history(csltId: string, kind: DeclarationKind, guest: Record<string, unknown>) {
    const identity = providerIdentity(kind, guest);
    if (!identity) return null;
    const rows = await this.repository.declarationsForIdentity(csltId, kind, identity.number);
    if (rows.length > 100) return null;
    if (rows.some((row) => {
      const snapshot = submittedGuest(row.submittedPayloadJson) ??
        (row.status !== "SUBMITTED" ? submittedGuest(row.draftPayloadJson) : null);
      return !snapshot || !providerIdentity(row.declarationKind, snapshot);
    })) return null;
    return rows.filter((row) => {
      const snapshot = submittedGuest(row.submittedPayloadJson) ??
        (row.status !== "SUBMITTED" ? submittedGuest(row.draftPayloadJson) : null);
      return snapshot && providerIdentity(row.declarationKind, snapshot)?.key === identity.key;
    });
  }

  async sendInitial(
    hotelId: string, kind: DeclarationKind, payload: unknown[], accessToken: string,
    declarationId: string, csltId: string,
  ): Promise<KbttSubmitOutcome> {
    const guest = submittedGuest(payload);
    const identity = guest && providerIdentity(kind, guest);
    const connection = await this.declarations.find(hotelId);
    const localRejection = (code: string, message: string): KbttSubmitOutcome =>
      ({ outcome: "BUSINESS_REJECTION", code, message });
    if (!guest || !identity || !connection) {
      return localRejection("LOCAL_VALIDATION", "Chưa đủ dữ liệu xác định hồ sơ khai báo.");
    }
    if (connection.csltId !== csltId) {
      return localRejection("CONNECTION_SCOPE_CHANGED", "Kết nối BCA đã thay đổi; cần xác nhận lại cơ sở trước khi gửi.");
    }
    const token = await this.repository.acquire(connection.csltId);
    if (!token) return localRejection("DELIVERY_BUSY", "Đang có hồ sơ được gửi. Vui lòng thử lại sau.");
    try {
      const history = await this.history(connection.csltId, kind, guest);
      if (!history || (await this.repository.uncertainOperations(connection.csltId, identity.key)).length) {
        return localRejection("RECONCILIATION_REQUIRED", "Có lần gửi chưa rõ kết quả; cần đối soát trước khi khai báo tiếp.");
      }
      for (const row of history) {
        if (row.id === declarationId) continue;
        if (row.status === "UNKNOWN" || row.status === "SENDING" ||
            !(await this.repository.closedOperation(row.id))) {
          return localRejection("RECONCILIATION_REQUIRED", "Hồ sơ lưu trú trước chưa được xác nhận kết thúc trên BCA.");
        }
      }
      const declaration = await this.repository.initialDeclaration(declarationId, hotelId);
      const current = declaration?.stay;
      if (!current || declaration?.status !== "SENDING" || declaration.submittedCsltId !== csltId ||
          current.checkedOutAt || !ACTIVE_STAYS.has(current.status) ||
          providerDay(guest.ngayDiDuKienStr) !== toYmd(current.plannedCheckOutAt, VIETNAM_TIME_ZONE)) {
        return localRejection("LOCAL_STATE_CHANGED", "Lượt lưu trú đã thay đổi; cần cập nhật hồ sơ trước khi gửi.");
      }
      if (!(await this.repository.renew(connection.csltId, token))) {
        return localRejection("DELIVERY_BUSY", "Phiên gửi đã thay đổi; vui lòng thử lại sau.");
      }
      return await this.provider.submitDeclaration(kind, payload, accessToken);
    } finally {
      await this.repository.release(connection.csltId, token);
    }
  }

  private async dispatch(operation: KbttStayOperation, resolveSession: SessionResolver) {
    const connection = await this.declarations.find(operation.hotelId);
    if (!connection || connection.status !== "CONNECTED" || connection.csltId !== operation.csltId) {
      await this.hold(operation, "CONNECTION_REQUIRED", "Cần khôi phục đúng kết nối của cơ sở đã khai báo.");
      return;
    }
    const token = await this.repository.acquire(operation.csltId);
    if (!token) return;
    try {
      const stay = await this.repository.stay(operation.hotelId, operation.stayId);
      const occupant = stay?.occupants.find((o) => o.id === operation.occupantId);
      const declaration = occupant?.kbttGuestDeclarations.find((d) => d.id === operation.declarationId);
      const guest = declaration && submittedGuest(declaration.submittedPayloadJson);
      const identity = guest && providerIdentity(operation.declarationKind, guest);
      if (!stay || !declaration || declaration.status !== "SUBMITTED" || !guest ||
          identity?.key !== operation.identityKey) {
        await this.hold(operation, "DECLARATION_MISMATCH", "Hồ sơ gốc cần được đối soát trước khi cập nhật.");
        return;
      }
      if (!declaration.submittedCsltId || declaration.submittedCsltId !== operation.csltId) {
        await this.hold(operation, "DECLARATION_CSLT_REQUIRED", "Chưa xác định được cơ sở BCA của hồ sơ gốc; cần đối soát trước khi cập nhật.");
        return;
      }
      const history = await this.history(operation.csltId, operation.declarationKind, guest);
      const uncertain = await this.repository.uncertainOperations(operation.csltId, identity.key, operation.id);
      if (!history || uncertain.length || history.some((d) => d.status === "UNKNOWN" || d.status === "SENDING")) {
        await this.hold(operation, "RECONCILIATION_REQUIRED", "Có lần gửi chưa rõ kết quả; cần đối soát trước khi cập nhật.");
        return;
      }
      const arrivalAt = stay.checkedInAt ?? stay.plannedCheckInAt;
      if (history.some((d) => d.stayId !== stay.id && d.status === "SUBMITTED" &&
          ((d.stay.checkedInAt ?? d.createdAt) >= arrivalAt ||
           (d.submittedAt ?? d.createdAt) > (declaration.submittedAt ?? declaration.createdAt)))) {
        await this.hold(operation, "NEWER_STAY_DECLARED", "Đã có lượt lưu trú mới của khách; cần đối soát hồ sơ cũ.");
        return;
      }
      const acknowledged = await this.repository.acknowledgedOperations(stay.hotelId, occupant!.id, declaration.id, identity.key);
      if (acknowledged.some((o) => o.kind === "CHECKOUT")) {
        await this.supersede(operation, "ALREADY_CLOSED");
        return;
      }
      const lastChange = acknowledged.find((o) => o.kind === "EXTEND" || o.kind === "RECOVER");
      const lastDeparture = lastChange?.desiredDepartureAt ?? providerDate(guest.ngayDiDuKienStr);
      let payload: unknown;
      let isRecovery = operation.kind === "RECOVER";
      if (operation.kind === "CHECKOUT") {
        if (!stay.checkedOutAt || ACTIVE_STAYS.has(stay.status)) {
          await this.hold(operation, "CHECKOUT_NOT_CONFIRMED", "Lượt lưu trú chưa được xác nhận trả phòng.");
          return;
        }
        payload = departurePayload(operation.declarationKind, guest, "TS");
      } else {
        if (stay.checkedOutAt || !ACTIVE_STAYS.has(stay.status)) {
          await this.supersede(operation, "STAY_ENDED");
          return;
        }
        const desired = operation.desiredDepartureAt;
        const desiredDay = desired && toYmd(desired, VIETNAM_TIME_ZONE);
        if (!desired || !desiredDay || desiredDay !== toYmd(stay.plannedCheckOutAt, VIETNAM_TIME_ZONE)) {
          await this.supersede(operation, "DEPARTURE_CHANGED_AGAIN");
          return;
        }
        if (!lastDeparture) {
          await this.hold(operation, "ACKNOWLEDGED_DATE_REQUIRED", "Chưa xác định được ngày đi BCA đã xác nhận.");
          return;
        }
        const lastDepartureDay = toYmd(lastDeparture, VIETNAM_TIME_ZONE);
        const today = toYmd(new Date(), VIETNAM_TIME_ZONE);
        if (desiredDay === lastDepartureDay) {
          await this.supersede(operation, "ALREADY_SYNCHRONIZED");
          return;
        }
        if (desiredDay < today) {
          await this.hold(operation, "FUTURE_DEPARTURE_REQUIRED", "Cần xác nhận ngày trả phòng mới từ hôm nay trở đi.");
          return;
        }
        if (desiredDay < lastDepartureDay) {
          await this.hold(operation, "SHORTENING_UNSUPPORTED", "API được cung cấp chưa hỗ trợ rút ngắn ngày đi dự kiến khi khách vẫn đang ở.");
          return;
        }
        // Only an elapsed Vietnam calendar day triggers the local recovery policy.
        // Passing the checkout hour alone must not create another BCA check-in.
        if (operation.kind === "EXTEND" && lastDepartureDay < today) isRecovery = true;
        if (operation.declarationKind === "VIETNAMESE" && !isRecovery) {
          const arrival = providerDate(guest.ngayDenCsltStr);
          const limit = arrival && addDaysYmd(toYmd(arrival, VIETNAM_TIME_ZONE), 30);
          if (!limit || desiredDay > limit) {
            await this.hold(operation, "DOMESTIC_30_DAY_LIMIT", "Ngày gia hạn vượt giới hạn 30 ngày tính từ ngày đến cơ sở.");
            return;
          }
        } else if (operation.declarationKind === "FOREIGN") {
          const residenceUntil = providerDate(guest.thoiHanTamTruStr);
          if (!residenceUntil || toYmd(residenceUntil, VIETNAM_TIME_ZONE) < desiredDay) {
            await this.hold(operation, "RESIDENCE_VALIDITY_REQUIRED", "Cần xác nhận thời hạn tạm trú tại Việt Nam phù hợp với ngày đi mới.");
            return;
          }
        }
        if (isRecovery) {
          if ((operation.kind === "RECOVER" && !operation.wasOverdue) || lastDepartureDay >= today) {
            await this.hold(operation, "OVERDUE_RECOVERY_NOT_APPLICABLE", "Chưa đủ điều kiện khai báo phục hồi lượt lưu trú quá hạn.");
            return;
          }
          const schema = operation.declarationKind === "VIETNAMESE" ? kbttVietnameseReadySchema : kbttForeignReadySchema;
          const parsed = schema.safeParse({ ...guest, soPhong: stay.room.roomNumber,
            ngayDiDuKienStr: formatLocalDateTime(desired, VIETNAM_TIME_ZONE) });
          payload = parsed.success ? parsed.data : null;
        } else {
          payload = departurePayload(operation.declarationKind, guest, "GH", desired);
        }
      }
      if (!payload) {
        await this.hold(operation, "LOCAL_VALIDATION", "Chưa đủ thông tin hợp lệ để cập nhật hồ sơ BCA.");
        return;
      }
      let session: KbttSession;
      try {
        session = await resolveSession(stay.hotelId, connection);
      } catch {
        await this.hold(operation, "AUTHENTICATION_REQUIRED", "Cần khôi phục phiên kết nối BCA trước khi gửi.");
        return;
      }
      const latestConnection = await this.declarations.find(stay.hotelId);
      if (session.CsltId !== operation.csltId || latestConnection?.csltId !== operation.csltId) {
        await this.hold(operation, "CONNECTION_SCOPE_CHANGED", "Kết nối BCA đã thay đổi; cần khôi phục đúng cơ sở của hồ sơ gốc.");
        return;
      }
      const wire = [payload] as Prisma.InputJsonValue[];
      const deliveryOperation = isRecovery && operation.kind !== "RECOVER"
        ? { ...operation, kind: "RECOVER" as const, wasOverdue: true } : operation;
      if (deliveryOperation !== operation && !(await this.repository.update(operation.id, ["PENDING", "BLOCKED"], {
        kind: "RECOVER", wasOverdue: true,
      }))) return;
      const claimed = await this.repository.claim(deliveryOperation, token, wire,
        createHash("sha256").update(JSON.stringify(wire)).digest("hex"));
      if (!claimed) return;
      let outcome: KbttSubmitOutcome;
      try {
        outcome = isRecovery
          ? await this.provider.submitDeclaration(operation.declarationKind, wire, session.AccessToken)
          : await this.provider.changeDeparture(operation.declarationKind, wire, session.AccessToken);
      } catch {
        outcome = { outcome: "AMBIGUOUS", code: "INTERRUPTED_DELIVERY", message: "Lần gửi chưa rõ kết quả; cần đối soát." };
      }
      const status = outcome.outcome === "SUCCESS" ? "SUCCEEDED"
        : outcome.outcome === "BUSINESS_REJECTION" ? "REJECTED" : "UNKNOWN";
      await this.repository.finish(operation.id, token, {
        status, providerCode: outcome.code.slice(0, 64),
        providerMessage: sanitizedStayResult(outcome.message),
        resolvedAt: status === "UNKNOWN" ? null : new Date(),
      }, undefined);
    } finally {
      await this.repository.release(operation.csltId, token);
    }
  }
}
