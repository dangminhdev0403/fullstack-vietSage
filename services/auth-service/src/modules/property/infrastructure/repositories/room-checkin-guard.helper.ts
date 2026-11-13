import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  FolioStatus,
  GuestSessionStatus,
  GuestStayStatus,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
  ReservationStatus,
  RoomQRCodeStatus,
  RoomStatus,
} from "@prisma/client";
import type { PrismaService } from "../../../../prisma/prisma.service";

export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = [
  ReservationStatus.CONFIRMED,
  ReservationStatus.ARRIVAL_READY,
];

export const ACTIVE_STAY_STATUSES: GuestStayStatus[] = [
  GuestStayStatus.CHECKED_IN,
  GuestStayStatus.ACTIVE,
  GuestStayStatus.CHECKOUT_PENDING,
  GuestStayStatus.RESERVED,
];

export const ACTIVE_IN_HOUSE_STAY_STATUSES: GuestStayStatus[] = [
  GuestStayStatus.CHECKED_IN,
  GuestStayStatus.ACTIVE,
  GuestStayStatus.CHECKOUT_PENDING,
];

export const NON_SELLABLE_ROOM_STATUSES: RoomStatus[] = [
  RoomStatus.BLOCKED,
  RoomStatus.MAINTENANCE,
  RoomStatus.OUT_OF_SERVICE,
];

export function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof ConflictException) {
    const response = error.getResponse();
    const message = typeof response === "string" ? response : (response as any)?.message;
    if (message === "RESERVATION_ROOM_ASSIGNMENT_CONCURRENCY_CONFLICT") {
      return true;
    }
  }
  const err = error as any;
  if (err?.code === "40001" || err?.code === "40P01") return true;

  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2002") return false;

  const target = error.meta?.target;
  const fields = Array.isArray(target)
    ? target.filter((field): field is string => typeof field === "string")
    : typeof target === "string"
      ? [target]
      : [];
  return fields.some((field) => field.includes("reservationId") || field.includes("folioNumber"));
}

export async function runSerializableTransaction<T>(
  prisma: Pick<PrismaService, "$transaction">,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  conflictCode: string,
): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isRetryableTransactionError(error)) {
        throw error;
      }
      if (attempt === maxAttempts) {
        throw new ConflictException(conflictCode);
      }
    }
  }
  throw new ConflictException(conflictCode);
}

export async function lockHotelRoomForUpdate(
  tx: Prisma.TransactionClient,
  hotelId: string,
  roomId: string,
) {
  if (typeof (tx as any).$queryRawUnsafe === "function") {
    await (tx as any).$queryRawUnsafe(
      'SELECT id FROM "Room" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
      roomId,
      hotelId,
    );
  } else if (typeof (tx as any).$queryRaw === "function") {
    await (tx as any).$queryRaw`SELECT id FROM "Room" WHERE id = ${roomId} AND "hotelId" = ${hotelId} FOR UPDATE`;
  }
}

export async function lockHotelRoomsForUpdate(
  tx: Prisma.TransactionClient,
  hotelId: string,
  roomIds: string[],
) {
  const sortedRoomIds = Array.from(new Set(roomIds)).sort();
  if (sortedRoomIds.length === 0) return;
  if (typeof (tx as any).$queryRawUnsafe === "function") {
    await (tx as any).$queryRawUnsafe(
      'SELECT id FROM "Room" WHERE id = ANY($1) AND "hotelId" = $2 ORDER BY id ASC FOR UPDATE',
      sortedRoomIds,
      hotelId,
    );
  }
}

export async function lockReservationForUpdate(
  tx: Prisma.TransactionClient,
  hotelId: string,
  reservationId: string,
) {
  if (typeof (tx as any).$queryRawUnsafe === "function") {
    await (tx as any).$queryRawUnsafe(
      'SELECT id FROM "Reservation" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
      reservationId,
      hotelId,
    );
  } else if (typeof (tx as any).$queryRaw === "function") {
    await (tx as any).$queryRaw`SELECT id FROM "Reservation" WHERE id = ${reservationId} AND "hotelId" = ${hotelId} FOR UPDATE`;
  }
}

export async function findUsableRoomQr(
  tx: Prisma.TransactionClient,
  hotelId: string,
  roomId: string,
  now: Date = new Date(),
  missingMessage = "Phòng chưa có QR khả dụng để check-in.",
) {
  const qr = await tx.roomQRCode.findFirst({
    where: {
      hotelId,
      roomId,
      status: { in: [RoomQRCodeStatus.INACTIVE, RoomQRCodeStatus.ACTIVE] },
    },
    orderBy: { version: "desc" },
  });
  if (
    !qr ||
    (qr as any).revokedAt ||
    ((qr as any).expiresAt && new Date((qr as any).expiresAt).getTime() <= now.getTime())
  ) {
    throw new BadRequestException(missingMessage);
  }
  return qr;
}

export async function activateRoomQr(
  tx: Prisma.TransactionClient,
  hotelId: string,
  roomId: string,
  qrId: string,
  now: Date = new Date(),
) {
  if (typeof tx.roomQRCode?.updateMany === "function") {
    await tx.roomQRCode.updateMany({
      where: {
        hotelId,
        roomId,
        id: { not: qrId },
        status: RoomQRCodeStatus.ACTIVE,
      },
      data: { status: RoomQRCodeStatus.INACTIVE, deactivatedAt: now },
    });
  }
  return tx.roomQRCode.update({
    where: { id: qrId },
    data: {
      status: RoomQRCodeStatus.ACTIVE,
      activatedAt: now,
      deactivatedAt: null,
      expiresAt: null,
    },
  });
}

export async function closeDanglingSettledFolios(
  tx: Prisma.TransactionClient,
  hotelId: string,
  roomId: string,
  now: Date,
) {
  if (typeof tx.folio?.findMany !== "function") return;
  const danglingFolios = await tx.folio.findMany({
    where: {
      hotelId,
      roomId,
      status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
      stay: { status: { in: [GuestStayStatus.CHECKED_OUT, GuestStayStatus.CANCELLED] } },
    },
    select: { id: true },
  });

  if (danglingFolios.length > 0 && typeof tx.folio.updateMany === "function") {
    await tx.folio.updateMany({
      where: { id: { in: danglingFolios.map((f) => f.id) } },
      data: { status: FolioStatus.CLOSED, closedAt: now },
    });
  }
}

export async function checkStayHasUnpaidOrPendingFolio(
  tx: Prisma.TransactionClient,
  hotelId: string,
  stayId: string,
): Promise<boolean> {
  if (typeof tx.folio?.findMany !== "function") {
    return false;
  }

  const openFolios = await tx.folio.findMany({
    where: {
      hotelId,
      stayId,
      status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
    },
    select: { id: true, status: true },
  });

  if (!openFolios || openFolios.length === 0) {
    return false;
  }

  if (openFolios.some((f: any) => f.status === FolioStatus.CHECKOUT_PENDING)) {
    return true;
  }

  if (typeof tx.invoice?.findMany === "function") {
    const unpaidInvoices = await tx.invoice.findMany({
      where: {
        hotelId,
        stayId,
        status: { not: InvoiceStatus.VOID },
        balanceAmount: { gt: 0 },
      },
      select: { id: true },
      take: 1,
    });
    if (unpaidInvoices.length > 0) {
      return true;
    }
  }

  if (typeof tx.folioItem?.findMany === "function") {
    const folioIds = openFolios.map((f: any) => f.id);
    const items = await tx.folioItem.findMany({
      where: {
        hotelId,
        folioId: { in: folioIds },
        voidedAt: null,
      },
      select: { totalSnapshot: true },
    });
    const chargeTotal = items.reduce(
      (sum: number, item: any) => sum + Number(item.totalSnapshot ?? 0),
      0,
    );
    if (chargeTotal > 0) {
      const allocations =
        typeof tx.bookingPaymentAllocation?.findMany === "function"
          ? await tx.bookingPaymentAllocation.findMany({
              where: { hotelId, folioId: { in: folioIds } },
              select: { allocatedAmount: true },
            })
          : [];
      const payments =
        typeof (tx as any).payment?.findMany === "function"
          ? await (tx as any).payment.findMany({
              where: {
                hotelId,
                invoice: { stayId, status: { not: InvoiceStatus.VOID } },
                status: PaymentStatus.SUCCEEDED,
              },
              select: { amount: true },
            })
          : [];
      const paidTotal =
        allocations.reduce((s: number, a: any) => s + Number(a.allocatedAmount ?? 0), 0) +
        payments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
      if (chargeTotal - paidTotal > 0.01) {
        return true;
      }
    }
  }

  return false;
}

export async function closeActiveGuestSessionsForStay(
  tx: Prisma.TransactionClient,
  hotelId: string,
  stayId: string,
  now: Date,
) {
  if (typeof tx.guestSession?.updateMany !== "function") return;
  await tx.guestSession.updateMany({
    where: {
      hotelId,
      stayId,
      status: { in: [GuestSessionStatus.CREATED, GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE] },
    },
    data: {
      status: GuestSessionStatus.CLOSED,
      closedAt: now,
    },
  });
}

export async function assertRoomClearForCheckIn(
  tx: Prisma.TransactionClient,
  input: {
    hotelId: string;
    roomId: string;
    checkInAt?: Date;
    checkOutAt?: Date;
    excludeReservationId?: string;
    excludeStayId?: string;
    conflictErrorMessage?: string;
    overlapErrorMessage?: string;
  },
) {
  const now = new Date();
  await closeDanglingSettledFolios(tx, input.hotelId, input.roomId, now);

  if (typeof tx.guestStay?.findFirst === "function") {
    const collidingStay = await tx.guestStay.findFirst({
      where: {
        hotelId: input.hotelId,
        roomId: input.roomId,
        status: { in: ACTIVE_IN_HOUSE_STAY_STATUSES },
        ...(input.excludeStayId ? { id: { not: input.excludeStayId } } : {}),
        ...(input.excludeReservationId ? { reservationId: { not: input.excludeReservationId } } : {}),
      },
      select: { id: true, status: true },
    });
    if (
      collidingStay &&
      (!input.excludeStayId || collidingStay.id !== input.excludeStayId) &&
      (!(collidingStay as any).status ||
        ACTIVE_IN_HOUSE_STAY_STATUSES.includes((collidingStay as any).status))
    ) {
      throw new ConflictException(input.conflictErrorMessage ?? "ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO");
    }
  } else if (typeof tx.guestStay?.count === "function") {
    const activeStayCount = await tx.guestStay.count({
      where: {
        hotelId: input.hotelId,
        roomId: input.roomId,
        status: { in: ACTIVE_IN_HOUSE_STAY_STATUSES },
        ...(input.excludeStayId ? { id: { not: input.excludeStayId } } : {}),
      },
    });
    if (activeStayCount > 0) {
      throw new ConflictException(input.conflictErrorMessage ?? "ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO");
    }
  }

  if (typeof tx.folio?.count === "function") {
    const openFolioCount = await tx.folio.count({
      where: {
        hotelId: input.hotelId,
        roomId: input.roomId,
        status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
        ...(input.excludeStayId ? { stayId: { not: input.excludeStayId } } : {}),
      },
    });
    if (openFolioCount > 0) {
      throw new ConflictException(input.conflictErrorMessage ?? "ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO");
    }
  }

  if (input.checkInAt && input.checkOutAt && typeof tx.reservation?.findFirst === "function") {
    const overlappingReservation = await tx.reservation.findFirst({
      where: {
        hotelId: input.hotelId,
        roomId: input.roomId,
        ...(input.excludeReservationId ? { id: { not: input.excludeReservationId } } : {}),
        status: { in: ACTIVE_RESERVATION_STATUSES },
        plannedCheckInAt: { lt: input.checkOutAt },
        plannedCheckOutAt: { gt: input.checkInAt },
      },
      select: { id: true },
    });
    if (overlappingReservation) {
      throw new ConflictException(input.overlapErrorMessage ?? "ROOM_RESERVATION_OVERLAP");
    }
  }
}
