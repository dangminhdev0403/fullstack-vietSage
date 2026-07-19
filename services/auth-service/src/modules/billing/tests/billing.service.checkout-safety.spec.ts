import {
  FolioStatus,
  GuestSessionStatus,
  GuestStayStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RoomQRCodeStatus,
  RoomStatus,
} from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { BillingService } from "../application/billing.service";

const now = new Date("2026-07-18T10:00:00.000Z");

function createService(prisma: Record<string, unknown>, repository: Record<string, unknown> = {}) {
  return new BillingService(
    repository as never,
    { assertHotelAccess: jest.fn().mockResolvedValue(undefined) } as never,
    prisma as never,
    { generateEntityCode: jest.fn().mockResolvedValue("INV-001") } as never,
    { log: jest.fn(), warn: jest.fn() } as never,
  );
}

describe("BillingService checkout safety", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("issueInvoice issues an invoice and only moves an OPEN folio to CHECKOUT_PENDING", async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      folio: {
        findFirst: jest.fn().mockResolvedValue({
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          roomId: "room-1",
          folioNumber: "FOL-001",
          status: FolioStatus.OPEN,
          currency: "VND",
          openedAt: new Date("2026-07-17T10:00:00.000Z"),
          subtotalAmount: new Prisma.Decimal(100),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(100),
          updatedAt: new Date("2026-07-17T10:00:00.000Z"),
          hotel: { id: "hotel-1", name: "Hotel" },
          room: { id: "room-1", roomNumber: "101", price: new Prisma.Decimal(100) },
          stay: {
            id: "stay-1",
            plannedCheckInAt: new Date("2026-07-17T10:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-07-18T10:00:00.000Z"),
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: "invoice-1", totalAmount: new Prisma.Decimal(100) }),
      },
      folioItem: {
        findFirst: jest.fn().mockResolvedValue({ id: "item-existing" }),
        findMany: jest.fn().mockResolvedValue([
          {
            subtotalSnapshot: new Prisma.Decimal(100),
            taxAmountSnapshot: new Prisma.Decimal(0),
            discountAmountSnapshot: new Prisma.Decimal(0),
            totalSnapshot: new Prisma.Decimal(100),
          },
        ]),
      },
      guestStay: { update: jest.fn() },
      room: { update: jest.fn() },
      roomQRCode: { updateMany: jest.fn() },
    };
    const prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = {
      getFolioSummary: jest.fn().mockResolvedValue({
        latestItemPostedAt: null,
        grouped: [],
        folio: {
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          folioNumber: "FOL-001",
          status: FolioStatus.OPEN,
          currency: "VND",
          subtotalAmount: new Prisma.Decimal(100),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(100),
          updatedAt: new Date("2026-07-17T10:00:00.000Z"),
        },
      }),
    };
    const service = createService(prisma, repository);

    await service.issueInvoice("user-1", "active-role", "hotel-1", "folio-1");

    expect(tx.folio.update).toHaveBeenCalledWith({
      where: { id: "folio-1" },
      data: { status: FolioStatus.CHECKOUT_PENDING, checkoutStartedAt: now },
    });
    expect(tx.guestStay.update).not.toHaveBeenCalled();
    expect(tx.room.update).not.toHaveBeenCalled();
    expect(tx.roomQRCode.updateMany).not.toHaveBeenCalled();
  });

  it("issueInvoice rejects stale folio state before reusing an existing invoice", async () => {
    const prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue({ id: "invoice-existing" }) },
      folio: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const repository = {
      getFolioSummary: jest.fn().mockResolvedValue({
        latestItemPostedAt: new Date("2026-07-18T09:30:00.000Z"),
        grouped: [],
        folio: {
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          folioNumber: "FOL-001",
          status: FolioStatus.OPEN,
          currency: "VND",
          subtotalAmount: new Prisma.Decimal(100),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(100),
          updatedAt: new Date("2026-07-18T09:00:00.000Z"),
        },
      }),
    };
    const service = createService(prisma, repository);

    await expect(
      service.issueInvoice("user-1", "active-role", "hotel-1", "folio-1"),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
    expect(prisma.folio.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("processPaymentWebhook settles checkout and revokes guest access only once payment succeeds", async () => {
    const tx = {
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          id: "payment-1",
          hotelId: "hotel-1",
          invoiceId: "invoice-1",
          folioId: "folio-1",
          stayId: "stay-1",
          status: PaymentStatus.PENDING,
          provider: PaymentProvider.MOMO,
          amount: new Prisma.Decimal(100),
          currency: "VND",
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: "payment-1",
          hotelId: "hotel-1",
          invoiceId: "invoice-1",
          folioId: "folio-1",
          stayId: "stay-1",
          status: PaymentStatus.PENDING,
          provider: PaymentProvider.MOMO,
          method: PaymentMethod.MOMO,
          amount: new Prisma.Decimal(100),
          currency: "VND",
          invoice: {
            id: "invoice-1",
            status: InvoiceStatus.ISSUED,
            balanceAmount: new Prisma.Decimal(100),
            stay: { id: "stay-1", roomId: "room-1" },
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentTransaction: {
        create: jest.fn().mockResolvedValue({ id: "transaction-1" }),
      },
      invoice: { update: jest.fn().mockResolvedValue({}) },
      folio: { update: jest.fn().mockResolvedValue({}) },
      guestStay: { update: jest.fn().mockResolvedValue({}) },
      guestSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      room: { update: jest.fn().mockResolvedValue({}) },
      roomQRCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      paymentTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = createService(prisma);

    await service.processPaymentWebhook(PaymentProvider.MOMO, {
      providerEventId: "event-1",
      paymentId: "payment-1",
      amount: "100",
      eventType: "payment.succeeded",
      signatureVerified: true,
    });

    expect(tx.folio.update).toHaveBeenCalledWith({
      where: { id: "folio-1" },
      data: { status: FolioStatus.CLOSED, closedAt: now },
    });
    expect(tx.guestStay.update).toHaveBeenCalledWith({
      where: { id: "stay-1" },
      data: {
        status: GuestStayStatus.CHECKED_OUT,
        checkedOutAt: now,
        accessCodeHash: null,
        accessCodeExpiresAt: null,
      },
    });
    expect(tx.guestSession.updateMany).toHaveBeenCalledWith({
      where: {
        stayId: "stay-1",
        status: {
          in: [GuestSessionStatus.CREATED, GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE],
        },
      },
      data: { status: GuestSessionStatus.CLOSED, closedAt: now },
    });
    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { status: RoomStatus.PROCESSING },
    });
    expect(tx.roomQRCode.updateMany).toHaveBeenCalledWith({
      where: { roomId: "room-1", status: RoomQRCodeStatus.ACTIVE },
      data: { status: RoomQRCodeStatus.INACTIVE, deactivatedAt: now },
    });
  });

  it("processPaymentWebhook rejects an unverified webhook before any database side effect", async () => {
    const prisma = {
      paymentTransaction: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = createService(prisma);

    await expect(
      service.processPaymentWebhook(PaymentProvider.MOMO, {
        providerEventId: "event-unverified",
        eventType: "payment.succeeded",
        signatureVerified: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.paymentTransaction.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("processPaymentWebhook rejects non-success provider events before settlement", async () => {
    const prisma = {
      paymentTransaction: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = createService(prisma);

    await expect(
      service.processPaymentWebhook(PaymentProvider.MOMO, {
        providerEventId: "event-failed",
        eventType: "payment.failed",
        signatureVerified: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.paymentTransaction.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("processPaymentWebhook recovers a concurrent duplicate provider event as idempotent", async () => {
    const winningTransaction = { id: "transaction-winner" };
    const duplicateError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["hotelId", "provider", "providerEventId"] },
    });
    const prisma = {
      paymentTransaction: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winningTransaction),
      },
      $transaction: jest.fn().mockRejectedValue(duplicateError),
    };
    const service = createService(prisma);

    await expect(
      service.processPaymentWebhook(PaymentProvider.MOMO, {
        providerEventId: "event-race",
        eventType: "payment.succeeded",
        signatureVerified: true,
      }),
    ).resolves.toEqual({
      received: true,
      idempotent: true,
      matched: true,
      transaction: winningTransaction,
    });

    expect(prisma.paymentTransaction.findFirst).toHaveBeenNthCalledWith(2, {
      where: { provider: PaymentProvider.MOMO, providerEventId: "event-race" },
      include: { invoice: true, payment: true },
    });
  });

  it("processPaymentWebhook does not swallow unrelated unique constraint errors", async () => {
    const unrelatedDuplicate = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["providerTransactionId"] },
      },
    );
    const prisma = {
      paymentTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockRejectedValue(unrelatedDuplicate),
    };
    const service = createService(prisma);

    await expect(
      service.processPaymentWebhook(PaymentProvider.MOMO, {
        providerEventId: "event-unrelated-duplicate",
        eventType: "payment.succeeded",
        signatureVerified: true,
      }),
    ).rejects.toBe(unrelatedDuplicate);

    expect(prisma.paymentTransaction.findFirst).toHaveBeenCalledTimes(1);
  });

  it("processPaymentWebhook treats a repeated provider event as idempotent without side effects", async () => {
    const existingTransaction = { id: "transaction-1" };
    const prisma = {
      paymentTransaction: {
        findFirst: jest.fn().mockResolvedValue(existingTransaction),
      },
      $transaction: jest.fn(),
    };
    const service = createService(prisma);

    await expect(
      service.processPaymentWebhook(PaymentProvider.MOMO, {
        providerEventId: "event-1",
        eventType: "payment.succeeded",
        signatureVerified: true,
      }),
    ).resolves.toEqual({
      received: true,
      idempotent: true,
      matched: true,
      transaction: existingTransaction,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
