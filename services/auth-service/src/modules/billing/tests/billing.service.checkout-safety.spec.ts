process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.PORT = process.env.PORT || "8080";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/vietsage_auth";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "replace-with-local-docker-access-secret-at-least-32-chars";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "replace-with-local-docker-refresh-secret-at-least-32-chars";
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL || "15m";
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL || "30d";

jest.mock("../../../prisma/prisma.service", () => ({
  PrismaService: class MockPrismaService {},
}));

import {
  FolioStatus,
  GuestSessionStatus,
  GuestStayStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RoomStatus,
} from "@prisma/client";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { REQUIRED_PERMISSION_KEY } from "../../../shared/decorators/require-permission.decorator";
import { FolioController } from "../api/folio.controller";
import { PaymentController } from "../api/payment.controller";
import { BillingService } from "../application/billing.service";

const now = new Date("2026-07-18T10:00:00.000Z");

function createService(
  prisma: Record<string, unknown>,
  repository: Record<string, unknown> = {},
  eventPublisher?: Record<string, unknown>,
) {
  return new BillingService(
    repository as never,
    { assertHotelAccess: jest.fn().mockResolvedValue(undefined) } as never,
    prisma as never,
    { generateEntityCode: jest.fn().mockResolvedValue("INV-001") } as never,
    { log: jest.fn(), warn: jest.fn() } as never,
    eventPublisher as never,
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
            plannedCheckOutAt: new Date("2026-09-29T05:00:00.000Z"),
            checkedInAt: new Date("2026-07-18T09:40:00.000Z"),
            nightlyRateSnapshot: new Prisma.Decimal(100),
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
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "room-charge-1" }),
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
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)),
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

    await service.issueInvoice("user-1", "active-role", "hotel-1", "folio-1", {
      isEarlyDeparture: true,
    });

    expect(Reflect.get(service, "codesService").generateEntityCode).toHaveBeenCalledWith(
      "INVOICE",
      tx,
    );
    expect(tx.folio.update).toHaveBeenCalledWith({
      where: { id: "folio-1" },
      data: { status: FolioStatus.CHECKOUT_PENDING, checkoutStartedAt: now },
    });
    expect(tx.folioItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quantity: 1,
        subtotalSnapshot: new Prisma.Decimal(100),
        totalSnapshot: new Prisma.Decimal(100),
        billingSourceSnapshot: expect.objectContaining({
          chargeStart: "2026-07-18T09:40:00.000Z",
          chargeEnd: now.toISOString(),
          nights: 1,
        }),
      }),
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
      room: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      roomQRCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      paymentTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)),
    };
    const eventPublisher = {
      publishConversationClosed: jest.fn(),
    };
    const service = createService(prisma, {}, eventPublisher);

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
    expect(tx.room.updateMany).toHaveBeenCalledWith({
      where: {
        id: "room-1",
        hotelId: "hotel-1",
        status: RoomStatus.OCCUPIED,
      },
      data: { status: RoomStatus.PROCESSING },
    });
    expect(tx.roomQRCode.updateMany).not.toHaveBeenCalled();
    expect(eventPublisher.publishConversationClosed).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      stayId: "stay-1",
      roomId: "room-1",
    });
  });

  it("publishes conversation closure after a zero-balance checkout commits", async () => {
    const payment = { id: "payment-zero", status: PaymentStatus.SUCCEEDED };
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: "invoice-zero",
          hotelId: "hotel-1",
          folioId: "folio-1",
          stayId: "stay-1",
          status: InvoiceStatus.ISSUED,
          paidAmount: new Prisma.Decimal(0),
          balanceAmount: new Prisma.Decimal(0),
          currency: "VND",
          stay: { roomId: "room-1" },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(payment),
      },
      folio: { update: jest.fn().mockResolvedValue({}) },
      guestStay: { update: jest.fn().mockResolvedValue({}) },
      guestSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      room: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      roomQRCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({ balanceAmount: new Prisma.Decimal(0) }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const eventPublisher = { publishConversationClosed: jest.fn() };
    const service = createService(prisma, {}, eventPublisher);
    jest
      .spyOn(service, "getInvoiceDetail")
      .mockResolvedValue({ invoice: { id: "invoice-zero" } } as never);

    await service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-zero", {
      method: PaymentMethod.CASH,
    });

    expect(eventPublisher.publishConversationClosed).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      stayId: "stay-1",
      roomId: "room-1",
    });
    expect(tx.room.updateMany).toHaveBeenCalledWith({
      where: {
        id: "room-1",
        hotelId: "hotel-1",
        status: RoomStatus.OCCUPIED,
      },
      data: { status: RoomStatus.PROCESSING },
    });
    expect(tx.roomQRCode.updateMany).not.toHaveBeenCalled();
  });

  it("rejects zero-balance checkout settlement when room status is no longer OCCUPIED", async () => {
    const payment = { id: "payment-zero", status: PaymentStatus.SUCCEEDED };
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: "invoice-zero",
          hotelId: "hotel-1",
          folioId: "folio-1",
          stayId: "stay-1",
          status: InvoiceStatus.ISSUED,
          paidAmount: new Prisma.Decimal(0),
          balanceAmount: new Prisma.Decimal(0),
          currency: "VND",
          stay: { roomId: "room-1" },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(payment),
      },
      folio: { update: jest.fn().mockResolvedValue({}) },
      guestStay: { update: jest.fn().mockResolvedValue({}) },
      guestSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      room: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      roomQRCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({ balanceAmount: new Prisma.Decimal(0) }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const eventPublisher = { publishConversationClosed: jest.fn() };
    const service = createService(prisma, {}, eventPublisher);
    jest
      .spyOn(service, "getInvoiceDetail")
      .mockResolvedValue({ invoice: { id: "invoice-zero" } } as never);

    await expect(
      service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-zero", {
        method: PaymentMethod.CASH,
      }),
    ).rejects.toThrow(new ConflictException("ROOM_CHECKOUT_STATUS_CONFLICT"));

    expect(eventPublisher.publishConversationClosed).not.toHaveBeenCalled();
  });

  it("rejects payment webhook checkout settlement when room status is no longer OCCUPIED", async () => {
    const lockedPayment = {
      id: "payment-conflict",
      hotelId: "hotel-1",
      invoiceId: "invoice-1",
      folioId: "folio-1",
      stayId: "stay-1",
      status: PaymentStatus.PENDING,
      amount: new Prisma.Decimal(100),
      currency: "VND",
      invoice: {
        id: "invoice-1",
        hotelId: "hotel-1",
        folioId: "folio-1",
        stayId: "stay-1",
        status: InvoiceStatus.ISSUED,
        paidAmount: new Prisma.Decimal(0),
        balanceAmount: new Prisma.Decimal(100),
        currency: "VND",
        stay: { roomId: "room-1" },
      },
    };
    const tx = {
      payment: {
        findFirst: jest.fn().mockResolvedValue(lockedPayment),
        findUnique: jest.fn().mockResolvedValue(lockedPayment),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentTransaction: {
        create: jest.fn().mockResolvedValue({ id: "transaction-1" }),
      },
      invoice: { update: jest.fn().mockResolvedValue({}) },
      folio: { update: jest.fn().mockResolvedValue({}) },
      guestStay: { update: jest.fn().mockResolvedValue({}) },
      guestSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      room: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      roomQRCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      paymentTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const eventPublisher = { publishConversationClosed: jest.fn() };
    const service = createService(prisma, {}, eventPublisher);

    await expect(
      service.processPaymentWebhook(PaymentProvider.MOMO, {
        providerEventId: "event-conflict",
        paymentId: "payment-conflict",
        amount: "100",
        eventType: "payment.succeeded",
        signatureVerified: true,
      }),
    ).rejects.toThrow(new ConflictException("ROOM_CHECKOUT_STATUS_CONFLICT"));

    expect(eventPublisher.publishConversationClosed).not.toHaveBeenCalled();
  });

  function setupManualPaymentTx(invoiceOverrides: Record<string, unknown> = {}) {
    const invoice = {
      id: "invoice-1",
      hotelId: "hotel-1",
      folioId: "folio-1",
      stayId: "stay-1",
      status: InvoiceStatus.ISSUED,
      paidAmount: new Prisma.Decimal(0),
      balanceAmount: new Prisma.Decimal(500000),
      currency: "VND",
      stay: { roomId: "room-1" },
      ...invoiceOverrides,
    };
    const payment = {
      id: "payment-counter-1",
      hotelId: "hotel-1",
      invoiceId: "invoice-1",
      folioId: "folio-1",
      stayId: "stay-1",
      paymentNumber: "PAY-001",
      provider: PaymentProvider.MANUAL,
      status: PaymentStatus.SUCCEEDED,
      method: PaymentMethod.CASH,
      amount: new Prisma.Decimal(500000),
      paidAmount: new Prisma.Decimal(500000),
      currency: "VND",
    };
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoice),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...invoice, ...data })),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...payment, ...data })),
      },
      paymentTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "tx-1" }),
      },
      folio: { update: jest.fn().mockResolvedValue({}) },
      guestStay: { update: jest.fn().mockResolvedValue({}) },
      guestSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      room: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      roomQRCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      paymentTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    return { tx, prisma, invoice, payment };
  }

  it("legacy no-amount request pays full", async () => {
    const { tx, prisma, invoice } = setupManualPaymentTx({
      balanceAmount: new Prisma.Decimal(250000),
      totalAmount: new Prisma.Decimal(250000),
    });
    const eventPublisher = { publishConversationClosed: jest.fn() };
    const service = createService(prisma, {}, eventPublisher);
    jest
      .spyOn(service, "getInvoiceDetail")
      .mockResolvedValue({ invoice: { id: "invoice-1", status: InvoiceStatus.PAID } } as never);

    const result = await service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-1", {
      method: PaymentMethod.CASH,
      note: "Thu đủ tại quầy",
    });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Prisma.Decimal(250000),
        paidAmount: new Prisma.Decimal(250000),
        method: PaymentMethod.CASH,
      }),
    });
    expect(tx.paymentTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerEventId: expect.stringMatching(/^counter:/),
        amount: new Prisma.Decimal(250000),
      }),
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: invoice.id },
      data: expect.objectContaining({
        status: InvoiceStatus.PAID,
        paidAmount: new Prisma.Decimal(250000),
        balanceAmount: new Prisma.Decimal(0),
      }),
    });
    expect(tx.folio.update).toHaveBeenCalledWith({
      where: { id: invoice.folioId },
      data: expect.objectContaining({ status: FolioStatus.CLOSED }),
    });
    expect(tx.guestStay.update).toHaveBeenCalledWith({
      where: { id: invoice.stayId },
      data: expect.objectContaining({ status: GuestStayStatus.CHECKED_OUT }),
    });
    expect(tx.room.updateMany).toHaveBeenCalledWith({
      where: { id: "room-1", hotelId: "hotel-1", status: RoomStatus.OCCUPIED },
      data: { status: RoomStatus.PROCESSING },
    });
    expect(eventPublisher.publishConversationClosed).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      stayId: "stay-1",
      roomId: "room-1",
    });
    expect(result.changeAmount).toBe(0);
  });

  it("focused tests prove partial keeps stay open and balance accurate", async () => {
    const { tx, prisma, invoice } = setupManualPaymentTx({
      balanceAmount: new Prisma.Decimal(500000),
      paidAmount: new Prisma.Decimal(0),
    });
    const eventPublisher = { publishConversationClosed: jest.fn() };
    const service = createService(prisma, {}, eventPublisher);
    jest
      .spyOn(service, "getInvoiceDetail")
      .mockResolvedValue({
        invoice: {
          id: "invoice-1",
          status: InvoiceStatus.ISSUED,
          balanceAmount: new Prisma.Decimal(300000),
        },
      } as never);

    const result = await service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-1", {
      method: PaymentMethod.CASH,
      amount: 200000,
      cashReceived: 200000,
      clientRequestId: "req-partial-1",
    });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Prisma.Decimal(200000),
        paidAmount: new Prisma.Decimal(200000),
      }),
    });
    expect(tx.paymentTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerEventId: "counter:req-partial-1",
        amount: new Prisma.Decimal(200000),
      }),
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.ISSUED,
        paidAmount: new Prisma.Decimal(200000),
        balanceAmount: new Prisma.Decimal(300000),
      },
    });
    expect(tx.folio.update).not.toHaveBeenCalled();
    expect(tx.guestStay.update).not.toHaveBeenCalled();
    expect(tx.guestSession.updateMany).not.toHaveBeenCalled();
    expect(tx.room.updateMany).not.toHaveBeenCalled();
    expect(eventPublisher.publishConversationClosed).not.toHaveBeenCalled();
    expect(result.changeAmount).toBe(0);
  });

  it("second payment closes", async () => {
    const { tx, prisma, invoice } = setupManualPaymentTx({
      paidAmount: new Prisma.Decimal(200000),
      balanceAmount: new Prisma.Decimal(300000),
    });
    const eventPublisher = { publishConversationClosed: jest.fn() };
    const service = createService(prisma, {}, eventPublisher);
    jest
      .spyOn(service, "getInvoiceDetail")
      .mockResolvedValue({
        invoice: { id: "invoice-1", status: InvoiceStatus.PAID, balanceAmount: new Prisma.Decimal(0) },
      } as never);

    const result = await service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-1", {
      method: PaymentMethod.CASH,
      amount: 300000,
      cashReceived: 300000,
      clientRequestId: "req-final-2",
    });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Prisma.Decimal(300000),
        paidAmount: new Prisma.Decimal(300000),
      }),
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: invoice.id },
      data: expect.objectContaining({
        status: InvoiceStatus.PAID,
        paidAmount: new Prisma.Decimal(500000),
        balanceAmount: new Prisma.Decimal(0),
      }),
    });
    expect(tx.folio.update).toHaveBeenCalledWith({
      where: { id: invoice.folioId },
      data: expect.objectContaining({ status: FolioStatus.CLOSED }),
    });
    expect(tx.guestStay.update).toHaveBeenCalledWith({
      where: { id: invoice.stayId },
      data: expect.objectContaining({ status: GuestStayStatus.CHECKED_OUT }),
    });
    expect(tx.room.updateMany).toHaveBeenCalledWith({
      where: { id: "room-1", hotelId: "hotel-1", status: RoomStatus.OCCUPIED },
      data: { status: RoomStatus.PROCESSING },
    });
    expect(eventPublisher.publishConversationClosed).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      stayId: "stay-1",
      roomId: "room-1",
    });
    expect(result.changeAmount).toBe(0);
  });

  it("over-tender returns change and applies balance only", async () => {
    const { tx, prisma, invoice } = setupManualPaymentTx({
      balanceAmount: new Prisma.Decimal(300000),
      paidAmount: new Prisma.Decimal(200000),
    });
    const service = createService(prisma);
    jest
      .spyOn(service, "getInvoiceDetail")
      .mockResolvedValue({
        invoice: { id: "invoice-1", status: InvoiceStatus.PAID, balanceAmount: new Prisma.Decimal(0) },
      } as never);

    const result = await service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-1", {
      method: PaymentMethod.CASH,
      amount: 300000,
      cashReceived: 500000,
      clientRequestId: "req-over-1",
    });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Prisma.Decimal(300000),
        paidAmount: new Prisma.Decimal(300000),
      }),
    });
    expect(tx.paymentTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Prisma.Decimal(300000),
      }),
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: invoice.id },
      data: expect.objectContaining({
        balanceAmount: new Prisma.Decimal(0),
      }),
    });
    expect(result.changeAmount).toBe(200000);
  });

  it("under-tender accepted as partial", async () => {
    const { tx, prisma, invoice } = setupManualPaymentTx({
      balanceAmount: new Prisma.Decimal(500000),
      paidAmount: new Prisma.Decimal(0),
    });
    const service = createService(prisma);
    jest
      .spyOn(service, "getInvoiceDetail")
      .mockResolvedValue({
        invoice: {
          id: "invoice-1",
          status: InvoiceStatus.ISSUED,
          balanceAmount: new Prisma.Decimal(400000),
        },
      } as never);

    const result = await service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-1", {
      method: PaymentMethod.CASH,
      amount: 100000,
      cashReceived: 100000,
      clientRequestId: "req-under-1",
    });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: new Prisma.Decimal(100000),
      }),
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.ISSUED,
        paidAmount: new Prisma.Decimal(100000),
        balanceAmount: new Prisma.Decimal(400000),
      },
    });
    expect(tx.room.updateMany).not.toHaveBeenCalled();
    expect(result.changeAmount).toBe(0);
  });

  it("duplicate exact clientRequestId no duplicate payment", async () => {
    const existingPayment = {
      id: "payment-existing",
      hotelId: "hotel-1",
      invoiceId: "invoice-1",
      method: PaymentMethod.CASH,
      amount: new Prisma.Decimal(200000),
      status: PaymentStatus.SUCCEEDED,
    };
    const existingTx = {
      id: "tx-existing",
      hotelId: "hotel-1",
      provider: PaymentProvider.MANUAL,
      providerEventId: "counter:req-dup-1",
      amount: new Prisma.Decimal(200000),
      status: PaymentStatus.SUCCEEDED,
      payment: existingPayment,
      invoice: { id: "invoice-1" },
      rawPayloadJson: { cashReceived: 200000, changeAmount: 0 },
    };
    const { tx, prisma } = setupManualPaymentTx();
    tx.paymentTransaction.findFirst = jest.fn().mockResolvedValue(existingTx);
    const service = createService(prisma);
    jest
      .spyOn(service, "getInvoiceDetail")
      .mockResolvedValue({ invoice: { id: "invoice-1" } } as never);

    const result = await service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-1", {
      method: PaymentMethod.CASH,
      amount: 200000,
      cashReceived: 200000,
      clientRequestId: "req-dup-1",
    });

    expect(result.payment).toEqual(existingPayment);
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });

  it("conflicting retry rejected", async () => {
    const existingPayment = {
      id: "payment-existing",
      hotelId: "hotel-1",
      invoiceId: "invoice-1",
      method: PaymentMethod.CASH,
      amount: new Prisma.Decimal(200000),
      status: PaymentStatus.SUCCEEDED,
    };
    const existingTx = {
      id: "tx-existing",
      hotelId: "hotel-1",
      provider: PaymentProvider.MANUAL,
      providerEventId: "counter:req-conflict-1",
      amount: new Prisma.Decimal(200000),
      status: PaymentStatus.SUCCEEDED,
      payment: existingPayment,
      invoice: { id: "invoice-1" },
      rawPayloadJson: { cashReceived: 200000, changeAmount: 0 },
    };
    const { tx, prisma } = setupManualPaymentTx();
    tx.paymentTransaction.findFirst = jest.fn().mockResolvedValue(existingTx);
    const service = createService(prisma);

    await expect(
      service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-1", {
        method: PaymentMethod.CASH,
        amount: 300000,
        clientRequestId: "req-conflict-1",
      }),
    ).rejects.toThrow(new ConflictException("COUNTER_PAYMENT_CONFLICT"));

    await expect(
      service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-1", {
        method: PaymentMethod.CARD,
        amount: 200000,
        clientRequestId: "req-conflict-1",
      }),
    ).rejects.toThrow(new ConflictException("COUNTER_PAYMENT_CONFLICT"));

    await expect(
      service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-1", {
        method: PaymentMethod.CASH,
        amount: 200000,
        cashReceived: 300000,
        clientRequestId: "req-conflict-1",
      }),
    ).rejects.toThrow(new ConflictException("COUNTER_PAYMENT_CONFLICT"));
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

  it("caps room charges at planned checkout when payment is confirmed late", async () => {
    const tx = {
      folioItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "room-charge-1" }),
      },
    };
    const service = createService({});
    const ensureRoomCharge = Reflect.get(service, "ensureRoomChargeFolioItem") as (
      ...args: unknown[]
    ) => Promise<unknown>;

    await ensureRoomCharge.call(
      service,
      tx,
      {
        id: "folio-1",
        hotelId: "hotel-1",
        stayId: "stay-1",
        roomId: "room-1",
        currency: "VND",
        status: FolioStatus.OPEN,
        hotel: { id: "hotel-1", name: "Hotel" },
        room: { id: "room-1", roomNumber: "101", price: new Prisma.Decimal(100) },
        stay: {
          id: "stay-1",
          checkedInAt: new Date("2026-07-16T10:00:00.000Z"),
          plannedCheckInAt: new Date("2026-07-16T10:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-07-17T10:00:00.000Z"),
          checkedOutAt: new Date("2026-07-17T10:00:00.000Z"),
          nightlyRateSnapshot: new Prisma.Decimal(100),
        },
      },
      "user-1",
    );

    expect(tx.folioItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quantity: 1,
        billingSourceSnapshot: expect.objectContaining({ chargeEnd: "2026-07-17T10:00:00.000Z" }),
      }),
    });
  });

  it("recalculates an existing room charge before invoice issuance", async () => {
    const tx = {
      folioItem: {
        findFirst: jest.fn().mockResolvedValue({ id: "room-charge-existing" }),
        update: jest.fn().mockResolvedValue({ id: "room-charge-existing" }),
      },
    };
    const service = createService({});
    const ensureRoomCharge = Reflect.get(service, "ensureRoomChargeFolioItem") as (
      ...args: unknown[]
    ) => Promise<unknown>;

    await ensureRoomCharge.call(
      service,
      tx,
      {
        id: "folio-1",
        hotelId: "hotel-1",
        stayId: "stay-1",
        roomId: "room-1",
        currency: "VND",
        status: FolioStatus.OPEN,
        hotel: { id: "hotel-1", name: "Hotel" },
        room: { id: "room-1", roomNumber: "101", price: new Prisma.Decimal(100) },
        stay: {
          id: "stay-1",
          checkedInAt: new Date("2026-07-18T09:40:00.000Z"),
          plannedCheckInAt: new Date("2026-07-18T09:40:00.000Z"),
          plannedCheckOutAt: new Date("2026-09-29T05:00:00.000Z"),
          nightlyRateSnapshot: new Prisma.Decimal(100),
        },
      },
      "user-1",
      { isEarlyDeparture: true },
    );

    expect(tx.folioItem.update).toHaveBeenCalledWith({
      where: { id: "room-charge-existing" },
      data: expect.objectContaining({ quantity: 1, totalSnapshot: new Prisma.Decimal(100) }),
    });
  });

  it("refuses to recalculate room charges after the folio stops being open", async () => {
    const service = createService({});
    const ensureRoomCharge = Reflect.get(service, "ensureRoomChargeFolioItem") as (
      ...args: unknown[]
    ) => Promise<unknown>;

    await expect(
      ensureRoomCharge.call(
        service,
        { folioItem: { findFirst: jest.fn() } },
        { status: FolioStatus.CHECKOUT_PENDING },
        "user-1",
      ),
    ).rejects.toThrow("ROOM_CHARGE_RECALCULATION_REQUIRES_OPEN_FOLIO");
  });

  it("adds a surcharge (ADJUSTMENT) item to an open folio and updates folio totals", async () => {
    const tx = {
      folio: {
        findFirst: jest.fn().mockResolvedValue({
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          status: FolioStatus.OPEN,
          currency: "VND",
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      folioItem: {
        create: jest.fn().mockResolvedValue({
          id: "item-adj-1",
          itemType: "ADJUSTMENT",
          totalSnapshot: new Prisma.Decimal(50000),
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            subtotalSnapshot: new Prisma.Decimal(100000),
            taxAmountSnapshot: new Prisma.Decimal(0),
            discountAmountSnapshot: new Prisma.Decimal(0),
            totalSnapshot: new Prisma.Decimal(100000),
          },
          {
            subtotalSnapshot: new Prisma.Decimal(50000),
            taxAmountSnapshot: new Prisma.Decimal(0),
            discountAmountSnapshot: new Prisma.Decimal(0),
            totalSnapshot: new Prisma.Decimal(50000),
          },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)),
    };
    const service = createService(prisma);

    const result = await service.addFolioItem("user-1", "role-1", "hotel-1", "folio-1", {
      itemType: "ADJUSTMENT",
      name: "Phụ thu Check-out muộn",
      amount: 50000,
    });

    expect(tx.folioItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        hotelId: "hotel-1",
        folioId: "folio-1",
        itemType: "ADJUSTMENT",
        nameSnapshot: "Phụ thu Check-out muộn",
        subtotalSnapshot: new Prisma.Decimal(50000),
        totalSnapshot: new Prisma.Decimal(50000),
      }),
    });
    expect(tx.folio.update).toHaveBeenCalledWith({
      where: { id: "folio-1" },
      data: expect.objectContaining({
        subtotalAmount: new Prisma.Decimal(150000),
        totalAmount: new Prisma.Decimal(150000),
      }),
    });
    expect(result).toEqual(expect.objectContaining({ id: "item-adj-1" }));
  });

  it("adds a DISCOUNT item to an open folio and updates folio totals", async () => {
    const tx = {
      folio: {
        findFirst: jest.fn().mockResolvedValue({
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          status: FolioStatus.OPEN,
          currency: "VND",
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      folioItem: {
        create: jest.fn().mockResolvedValue({
          id: "item-disc-1",
          itemType: "DISCOUNT",
          discountAmountSnapshot: new Prisma.Decimal(20000),
          totalSnapshot: new Prisma.Decimal(-20000),
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            subtotalSnapshot: new Prisma.Decimal(100000),
            taxAmountSnapshot: new Prisma.Decimal(0),
            discountAmountSnapshot: new Prisma.Decimal(0),
            totalSnapshot: new Prisma.Decimal(100000),
          },
          {
            subtotalSnapshot: new Prisma.Decimal(0),
            taxAmountSnapshot: new Prisma.Decimal(0),
            discountAmountSnapshot: new Prisma.Decimal(20000),
            totalSnapshot: new Prisma.Decimal(-20000),
          },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)),
    };
    const service = createService(prisma);

    const result = await service.addFolioItem("user-1", "role-1", "hotel-1", "folio-1", {
      itemType: "DISCOUNT",
      name: "Giảm giá 20k Khách thân thiết",
      amount: 20000,
    });

    expect(tx.folioItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemType: "DISCOUNT",
        discountAmountSnapshot: new Prisma.Decimal(20000),
        totalSnapshot: new Prisma.Decimal(-20000),
      }),
    });
    expect(tx.folio.update).toHaveBeenCalledWith({
      where: { id: "folio-1" },
      data: expect.objectContaining({
        discountAmount: new Prisma.Decimal(20000),
        totalAmount: new Prisma.Decimal(80000),
      }),
    });
    expect(result).toEqual(expect.objectContaining({ id: "item-disc-1" }));
  });

  it("voids a folio item and recalculates folio totals", async () => {
    const tx = {
      folio: {
        findFirst: jest.fn().mockResolvedValue({
          id: "folio-1",
          hotelId: "hotel-1",
          status: FolioStatus.OPEN,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      folioItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "item-1",
          folioId: "folio-1",
          hotelId: "hotel-1",
          voidedAt: null,
        }),
        update: jest.fn().mockResolvedValue({ id: "item-1", voidedAt: new Date() }),
        findMany: jest.fn().mockResolvedValue([
          {
            subtotalSnapshot: new Prisma.Decimal(100000),
            taxAmountSnapshot: new Prisma.Decimal(0),
            discountAmountSnapshot: new Prisma.Decimal(0),
            totalSnapshot: new Prisma.Decimal(100000),
          },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)),
    };
    const service = createService(prisma);

    const result = await service.voidFolioItem(
      "user-1",
      "role-1",
      "hotel-1",
      "folio-1",
      "item-1",
      "Nhập nhầm",
    );

    expect(tx.folioItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({
        voidedByUserId: "user-1",
        voidReason: "Nhập nhầm",
      }),
    });
    expect(result).toEqual({ success: true });
  });

  it("maps serviceSource and partnerName correctly in getInvoiceDetail", async () => {
    const mockInvoiceDetail = {
      invoice: {
        id: "inv-1",
        invoiceNumber: "INV-001",
        status: InvoiceStatus.ISSUED,
        currency: "VND",
        issuedAt: new Date("2026-08-13T00:00:00.000Z"),
        subtotalAmount: new Prisma.Decimal(300000),
        taxAmount: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(300000),
        paidAmount: new Prisma.Decimal(0),
        balanceAmount: new Prisma.Decimal(300000),
        folio: { id: "folio-1", folioNumber: "FOL-001", status: FolioStatus.OPEN },
        stay: {
          id: "stay-1",
          guestDisplayName: "Nguyen Van A",
          room: { roomNumber: "101" },
          plannedCheckInAt: new Date(),
          plannedCheckOutAt: new Date(),
        },
      },
      items: [
        {
          id: "item-hotel",
          itemType: "ROOM_CHARGE",
          sourceType: "ROOM",
          nameSnapshot: "Tiền phòng",
          quantity: 1,
          unitPriceSnapshot: new Prisma.Decimal(200000),
          subtotalSnapshot: new Prisma.Decimal(200000),
          taxAmountSnapshot: new Prisma.Decimal(0),
          discountAmountSnapshot: new Prisma.Decimal(0),
          totalSnapshot: new Prisma.Decimal(200000),
          postedAt: new Date(),
          billingSourceSnapshot: {},
        },
        {
          id: "item-external",
          itemType: "SERVICE",
          sourceType: "SYSTEM",
          nameSnapshot: "Tour Sapa",
          quantity: 1,
          unitPriceSnapshot: new Prisma.Decimal(100000),
          subtotalSnapshot: new Prisma.Decimal(100000),
          taxAmountSnapshot: new Prisma.Decimal(0),
          discountAmountSnapshot: new Prisma.Decimal(0),
          totalSnapshot: new Prisma.Decimal(100000),
          postedAt: new Date(),
          billingSourceSnapshot: {
            serviceSource: "EXTERNAL",
            partnerName: "Công ty du lịch Sapa",
            marketplaceOrderId: "ord-1",
          },
        },
      ],
      payments: [],
    };

    const billingRepo = {
      findInvoiceDetail: jest.fn().mockResolvedValue(mockInvoiceDetail),
    };
    const hotelAccess = {
      assertHotelAccess: jest.fn().mockResolvedValue(undefined),
    };

    const service = createService({}, billingRepo, hotelAccess);
    const detail = await service.getInvoiceDetail("user-1", "role-1", "hotel-1", "inv-1");

    expect(detail.items).toHaveLength(2);
    expect(detail.items[0]).toMatchObject({
      id: "item-hotel",
      serviceSource: "HOTEL",
      partnerName: undefined,
    });
    expect(detail.items[1]).toMatchObject({
      id: "item-external",
      serviceSource: "EXTERNAL",
      partnerName: "Công ty du lịch Sapa",
    });
  });

  it("retains service classification and calculates totals matching acceptance criteria (Benchmark Test)", async () => {
    const benchmarkInvoice = {
      invoice: {
        id: "inv-benchmark",
        invoiceNumber: "INV-2026-001",
        status: InvoiceStatus.ISSUED,
        currency: "VND",
        issuedAt: new Date("2026-08-13T09:00:00.000Z"),
        subtotalAmount: new Prisma.Decimal(2001100),
        taxAmount: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(2001100),
        paidAmount: new Prisma.Decimal(0),
        balanceAmount: new Prisma.Decimal(2001100),
        folio: { id: "folio-bm", folioNumber: "FOL-200", status: FolioStatus.CHECKOUT_PENDING },
        stay: {
          id: "stay-200",
          guestDisplayName: "Guest 200",
          room: { roomNumber: "200" },
          plannedCheckInAt: new Date(),
          plannedCheckOutAt: new Date(),
        },
      },
      items: [
        {
          id: "item-room-1",
          itemType: "ROOM_CHARGE",
          sourceType: "STAY",
          nameSnapshot: "Room charge - 200",
          quantity: 1,
          unitPriceSnapshot: new Prisma.Decimal(1000000),
          subtotalSnapshot: new Prisma.Decimal(1000000),
          taxAmountSnapshot: new Prisma.Decimal(0),
          discountAmountSnapshot: new Prisma.Decimal(0),
          totalSnapshot: new Prisma.Decimal(1000000),
          postedAt: new Date(),
          billingSourceSnapshot: { roomNumber: "200" },
        },
        {
          id: "item-room-2",
          itemType: "ROOM_CHARGE",
          sourceType: "STAY",
          nameSnapshot: "Room charge - 200",
          quantity: 1,
          unitPriceSnapshot: new Prisma.Decimal(1000000),
          subtotalSnapshot: new Prisma.Decimal(1000000),
          taxAmountSnapshot: new Prisma.Decimal(0),
          discountAmountSnapshot: new Prisma.Decimal(0),
          totalSnapshot: new Prisma.Decimal(1000000),
          postedAt: new Date(),
          billingSourceSnapshot: { roomNumber: "200" },
        },
        {
          id: "item-massage-60",
          itemType: "SERVICE",
          sourceType: "GUEST_REQUEST",
          nameSnapshot: "Massage 60 minutes",
          quantity: 1,
          unitPriceSnapshot: new Prisma.Decimal(450),
          subtotalSnapshot: new Prisma.Decimal(450),
          taxAmountSnapshot: new Prisma.Decimal(0),
          discountAmountSnapshot: new Prisma.Decimal(0),
          totalSnapshot: new Prisma.Decimal(450),
          postedAt: new Date(),
          billingSourceSnapshot: { categoryName: "Spa & Massage", serviceSource: "EXTERNAL" },
        },
        {
          id: "item-massage-90",
          itemType: "SERVICE",
          sourceType: "GUEST_REQUEST",
          nameSnapshot: "Massage 90 minutes",
          quantity: 1,
          unitPriceSnapshot: new Prisma.Decimal(650),
          subtotalSnapshot: new Prisma.Decimal(650),
          taxAmountSnapshot: new Prisma.Decimal(0),
          discountAmountSnapshot: new Prisma.Decimal(0),
          totalSnapshot: new Prisma.Decimal(650),
          postedAt: new Date(),
          billingSourceSnapshot: { categoryName: "Spa & Massage", serviceSource: "EXTERNAL" },
        },
        {
          id: "item-towel-free",
          itemType: "SERVICE",
          sourceType: "GUEST_REQUEST",
          nameSnapshot: "Extra towel",
          quantity: 1,
          unitPriceSnapshot: new Prisma.Decimal(0),
          subtotalSnapshot: new Prisma.Decimal(0),
          taxAmountSnapshot: new Prisma.Decimal(0),
          discountAmountSnapshot: new Prisma.Decimal(0),
          totalSnapshot: new Prisma.Decimal(0),
          postedAt: new Date(),
          billingSourceSnapshot: { categoryName: "Housekeeping", serviceSource: "HOTEL" },
        },
      ],
      payments: [],
    };

    const billingRepo = { findInvoiceDetail: jest.fn().mockResolvedValue(benchmarkInvoice) };
    const hotelAccess = { assertHotelAccess: jest.fn().mockResolvedValue(undefined) };

    const service = createService({}, billingRepo, hotelAccess);
    const detail = await service.getInvoiceDetail("user-1", "role-1", "hotel-1", "inv-benchmark");

    expect(detail.items).toHaveLength(5);
    expect(detail.items[0]).toMatchObject({
      name: "Room charge - 200",
      serviceSource: "HOTEL",
      type: "ROOM_CHARGE",
    });
    expect(detail.items[1]).toMatchObject({
      name: "Room charge - 200",
      serviceSource: "HOTEL",
      type: "ROOM_CHARGE",
    });
    expect(detail.items[2]).toMatchObject({
      name: "Massage 60 minutes",
      serviceSource: "EXTERNAL",
      type: "SERVICE",
    });
    expect(detail.items[3]).toMatchObject({
      name: "Massage 90 minutes",
      serviceSource: "EXTERNAL",
      type: "SERVICE",
    });
    expect(detail.items[4]).toMatchObject({
      name: "Extra towel",
      serviceSource: "HOTEL",
      type: "SERVICE",
    });

    const hotelTotal = detail.items
      .filter((i) => i.serviceSource === "HOTEL")
      .reduce((sum, i) => sum + Number(i.total), 0);

    const externalTotal = detail.items
      .filter((i) => i.serviceSource === "EXTERNAL")
      .reduce((sum, i) => sum + Number(i.total), 0);

    expect(hotelTotal).toBe(2000000);
    expect(externalTotal).toBe(1100);
    expect(hotelTotal + externalTotal).toBe(2001100);
    expect(Number(detail.invoice.totalAmount)).toBe(2001100);
  });

  it("getFolioSummary performs no create or update in the database (query purity)", async () => {
    const prisma = {
      folio: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      folioItem: {
        create: jest.fn(),
        update: jest.fn(),
      },
      guestRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = {
      getFolioSummary: jest.fn().mockResolvedValue({
        latestItemPostedAt: null,
        grouped: [],
        folio: {
          id: "folio-pure",
          hotelId: "hotel-1",
          stayId: "stay-1",
          folioNumber: "FOL-PURE",
          status: FolioStatus.OPEN,
          currency: "VND",
          subtotalAmount: new Prisma.Decimal(500000),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(500000),
          updatedAt: new Date("2026-07-18T00:00:00.000Z"),
        },
      }),
    };
    const service = createService(prisma, repository);

    const summary = await service.getFolioSummary("user-1", "active-role", "hotel-1", "folio-pure");

    expect(summary).toBeDefined();
    expect(summary.total).toEqual(new Prisma.Decimal(500000));
    expect(repository.getFolioSummary).toHaveBeenCalledWith("hotel-1", "folio-pure");
    expect(prisma.folio.findFirst).not.toHaveBeenCalled();
    expect(prisma.folio.update).not.toHaveBeenCalled();
    expect(prisma.folioItem.create).not.toHaveBeenCalled();
    expect(prisma.folioItem.update).not.toHaveBeenCalled();
  });

  it("getFolioSummary computes estimated room charge for OPEN folio with room rate and stay dates", async () => {
    const prisma = {
      guestRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = {
      getFolioSummary: jest.fn().mockResolvedValue({
        latestItemPostedAt: null,
        grouped: [],
        folio: {
          id: "folio-open-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          folioNumber: "FOL-OPEN-1",
          status: FolioStatus.OPEN,
          currency: "VND",
          subtotalAmount: new Prisma.Decimal(0),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(0),
          updatedAt: new Date("2026-07-18T00:00:00.000Z"),
          room: { id: "room-501", roomNumber: "501", price: new Prisma.Decimal(600000) },
          stay: {
            id: "stay-1",
            checkedInAt: new Date("2026-07-17T14:00:00.000Z"),
            plannedCheckInAt: new Date("2026-07-17T14:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-07-18T12:00:00.000Z"),
            baseNightlyRateSnapshot: new Prisma.Decimal(800000),
            nightlyRateSnapshot: new Prisma.Decimal(600000),
          },
        },
      }),
    };
    const service = createService(prisma, repository);
    const summary = await service.getFolioSummary(
      "user-1",
      "active-role",
      "hotel-1",
      "folio-open-1",
    );

    expect(summary).toBeDefined();
    expect(summary.estimatedRoomCharge).toBeDefined();
    expect(summary.estimatedRoomCharge?.nights).toBe(1);
    expect(summary.estimatedRoomCharge?.nightlyRate).toEqual(new Prisma.Decimal(600000));
    expect(summary.estimatedRoomCharge?.subtotal).toEqual(new Prisma.Decimal(600000));
    expect(summary.roomRateComparison).toEqual({
      direction: "DECREASE",
      baseNightlyRate: new Prisma.Decimal(800000),
      appliedNightlyRate: new Prisma.Decimal(600000),
      nightlyDifference: new Prisma.Decimal(-200000),
      baseSubtotal: new Prisma.Decimal(800000),
      appliedSubtotal: new Prisma.Decimal(600000),
      totalDifference: new Prisma.Decimal(-200000),
    });
    expect(summary.subtotal).toEqual(new Prisma.Decimal(600000));
    expect(summary.total).toEqual(new Prisma.Decimal(600000));
  });

  it("requires hotel.billing.checkout permission for issueInvoice and confirmManualPayment", () => {
    const issueInvoicePermission = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      FolioController.prototype.issueInvoice,
    );
    const confirmManualPaymentPermission = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      PaymentController.prototype.confirmManualPayment,
    );

    expect(issueInvoicePermission).toBe("hotel.billing.checkout");
    expect(confirmManualPaymentPermission).toBe("hotel.billing.checkout");
  });

  it("BillingService calculateEstimatedRoomCharge compares the applied rate with its base snapshot", () => {
    const service = createService({});
    const charge = service.calculateEstimatedRoomCharge({
      room: { roomNumber: "101", price: new Prisma.Decimal(2000000) },
      stay: {
        checkedInAt: new Date("2026-07-17T14:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-07-18T12:00:00.000Z"),
        baseNightlyRateSnapshot: new Prisma.Decimal(800000),
        nightlyRateSnapshot: new Prisma.Decimal(650000),
      },
    });

    expect(charge.nightlyRate).toEqual(new Prisma.Decimal(650000));
    expect(charge.subtotal).toEqual(new Prisma.Decimal(650000));
    expect(charge.rateComparison).toEqual({
      direction: "DECREASE",
      baseNightlyRate: new Prisma.Decimal(800000),
      appliedNightlyRate: new Prisma.Decimal(650000),
      nightlyDifference: new Prisma.Decimal(-150000),
      baseSubtotal: new Prisma.Decimal(800000),
      appliedSubtotal: new Prisma.Decimal(650000),
      totalDifference: new Prisma.Decimal(-150000),
    });
  });

  it("BillingService calculateEstimatedRoomCharge ensures room-price edits cannot alter stay charge when stay snapshot exists", () => {
    const service = createService({});
    // Even if room price changes to 2,000,000, stay locked snapshot remains 650,000
    const charge = service.calculateEstimatedRoomCharge({
      room: { roomNumber: "101", price: new Prisma.Decimal(2000000) },
      stay: {
        checkedInAt: new Date("2026-07-17T14:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-07-18T12:00:00.000Z"),
        nightlyRateSnapshot: new Prisma.Decimal(650000),
      },
    });

    expect(charge.nightlyRate).toEqual(new Prisma.Decimal(650000));
    expect(charge.subtotal).toEqual(new Prisma.Decimal(650000));
  });

  it("BillingService calculateEstimatedRoomCharge treats 0 as free stay (subtotal 0) and rejects missing rate snapshot (H3)", () => {
    const service = createService({});
    // 0 is free stay
    const freeCharge = service.calculateEstimatedRoomCharge({
      room: { roomNumber: "101", price: new Prisma.Decimal(800000) },
      stay: {
        checkedInAt: new Date("2026-07-17T14:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-07-18T12:00:00.000Z"),
        nightlyRateSnapshot: new Prisma.Decimal(0),
      },
    });
    expect(freeCharge.nightlyRate).toEqual(new Prisma.Decimal(0));
    expect(freeCharge.subtotal).toEqual(new Prisma.Decimal(0));

    // null rejects instead of falling back to room price (H3)
    expect(() =>
      service.calculateEstimatedRoomCharge({
        room: { roomNumber: "101", price: new Prisma.Decimal(750000) },
        stay: {
          checkedInAt: new Date("2026-07-17T14:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-07-18T12:00:00.000Z"),
          nightlyRateSnapshot: null,
        },
      }),
    ).toThrow(ConflictException);

    // null stay snapshot and null room price rejects instead of fallback 500,000 (H3)
    expect(() =>
      service.calculateEstimatedRoomCharge({
        room: { roomNumber: "101", price: null },
        stay: {
          checkedInAt: new Date("2026-07-17T14:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-07-18T12:00:00.000Z"),
          nightlyRateSnapshot: null,
        },
      }),
    ).toThrow(ConflictException);
  });

  it("calculateEstimatedRoomCharge prevents phantom night overcharging on early check-in (AUDIT-BILLING-001)", () => {
    const service = createService({});
    // Checked in early at 11:30 AM (2.5h early), checkout at 11:45 AM next day (15m late) -> total 24h15m = 24.25h
    const charge = service.calculateEstimatedRoomCharge({
      room: { roomNumber: "101", price: new Prisma.Decimal(500000) },
      stay: {
        checkedInAt: new Date("2026-10-20T11:30:00.000Z"),
        plannedCheckOutAt: new Date("2026-10-21T11:45:00.000Z"),
        nightlyRateSnapshot: new Prisma.Decimal(500000),
      },
    });
    // Must remain 1 night, NOT inflated to 2 nights
    expect(charge.nights).toBe(1);
    expect(charge.subtotal).toEqual(new Prisma.Decimal(500000));
  });

  it("calculateEstimatedRoomCharge calculates plannedNights and plannedSubtotal for multi-night stays (AUDIT-BILLING-002)", () => {
    const service = createService({});
    // 5-night stay from Oct 20 14:00 to Oct 25 12:00
    const charge = service.calculateEstimatedRoomCharge({
      room: { roomNumber: "101", price: new Prisma.Decimal(600000) },
      stay: {
        plannedCheckInAt: new Date("2026-10-20T14:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-10-25T12:00:00.000Z"),
        checkedInAt: new Date("2026-10-20T14:00:00.000Z"),
        nightlyRateSnapshot: new Prisma.Decimal(600000),
      },
    });
    expect(charge.plannedNights).toBe(5);
    expect(charge.plannedSubtotal).toEqual(new Prisma.Decimal(3000000));
  });

  it("H1: calculateEstimatedRoomCharge uses committed nights by default and explicit early departure intent for shortening", () => {
    const service = createService({});
    jest.useFakeTimers().setSystemTime(new Date("2026-10-21T10:00:00.000Z"));

    const defaultCharge = service.calculateEstimatedRoomCharge({
      room: { roomNumber: "101", price: new Prisma.Decimal(500000) },
      stay: {
        plannedCheckInAt: new Date("2026-10-20T14:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-10-25T12:00:00.000Z"),
        checkedInAt: new Date("2026-10-20T14:00:00.000Z"),
        nightlyRateSnapshot: new Prisma.Decimal(500000),
      },
    });
    expect(defaultCharge.nights).toBe(5);
    expect(defaultCharge.subtotal).toEqual(new Prisma.Decimal(2500000));

    const earlyCharge = service.calculateEstimatedRoomCharge(
      {
        room: { roomNumber: "101", price: new Prisma.Decimal(500000) },
        stay: {
          plannedCheckInAt: new Date("2026-10-20T14:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-10-25T12:00:00.000Z"),
          checkedInAt: new Date("2026-10-20T14:00:00.000Z"),
          nightlyRateSnapshot: new Prisma.Decimal(500000),
        },
      },
      { isEarlyDeparture: true },
    );
    expect(earlyCharge.nights).toBe(1);
    expect(earlyCharge.subtotal).toEqual(new Prisma.Decimal(500000));
  });

  it("H4: addFolioItem rejects discount/adjustment that makes total negative", async () => {
    const tx = {
      folio: {
        findFirst: jest.fn().mockResolvedValue({
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          roomId: "room-1",
          status: FolioStatus.OPEN,
          currency: "VND",
          room: { id: "room-1" },
          stay: {
            plannedCheckInAt: new Date("2026-10-20T14:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-10-21T12:00:00.000Z"),
            checkedInAt: new Date("2026-10-20T14:00:00.000Z"),
            nightlyRateSnapshot: new Prisma.Decimal(500000),
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      folioItem: {
        create: jest.fn().mockResolvedValue({ id: "item-discount" }),
        findMany: jest.fn().mockResolvedValue([
          {
            itemType: "DISCOUNT",
            subtotalSnapshot: new Prisma.Decimal(0),
            taxAmountSnapshot: new Prisma.Decimal(0),
            discountAmountSnapshot: new Prisma.Decimal(600000),
            totalSnapshot: new Prisma.Decimal(-600000),
          },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const service = createService(prisma);

    await expect(
      service.addFolioItem("user-1", "role-1", "hotel-1", "folio-1", {
        itemType: "DISCOUNT" as any,
        name: "Discount VIP",
        amount: 600000,
        quantity: 1,
      }),
    ).rejects.toThrow("DISCOUNT_MAKES_TOTAL_NEGATIVE");
  });

  it("C1: validateFolioForCheckout rejects folio with mismatched item currency", async () => {
    const prisma = {
      folioItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: "item-mismatch",
          currency: "USD",
        }),
      },
    };
    const repository = {
      getFolioSummary: jest.fn().mockResolvedValue({
        latestItemPostedAt: null,
        grouped: [],
        folio: {
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          status: FolioStatus.OPEN,
          currency: "VND",
          subtotalAmount: new Prisma.Decimal(100),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(100),
          updatedAt: new Date(),
        },
      }),
    };
    const service = createService(prisma, repository);

    await expect(
      service.validateFolioForCheckout("hotel-1", "folio-1"),
    ).rejects.toThrow(ConflictException);
  });

  it("issueInvoice creates adjustments and invoice atomically in a single request", async () => {
    const createdItems: any[] = [];
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
            plannedCheckOutAt: new Date("2026-09-29T05:00:00.000Z"),
            checkedInAt: new Date("2026-07-18T09:40:00.000Z"),
            nightlyRateSnapshot: new Prisma.Decimal(100),
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: "invoice-1", ...data })),
      },
      folioItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => {
          const item = { id: `item-${createdItems.length + 1}`, ...data };
          createdItems.push(item);
          return Promise.resolve(item);
        }),
        findMany: jest.fn().mockImplementation(() => Promise.resolve([...createdItems])),
      },
      guestStay: { update: jest.fn(), updateMany: jest.fn() },
      room: { update: jest.fn() },
      roomQRCode: { updateMany: jest.fn() },
    };
    const prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)),
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

    const result = await service.issueInvoice("user-1", "active-role", "hotel-1", "folio-1", {
      adjustments: [
        {
          clientRequestId: "req-surcharge-1",
          itemType: "MANUAL_CHARGE",
          name: "Phụ thu lễ tân",
          amount: 50,
          quantity: 1,
        },
        {
          clientRequestId: "req-discount-1",
          itemType: "DISCOUNT",
          name: "Giảm giá đặc biệt",
          amount: 20,
          quantity: 1,
        },
      ],
    });

    expect(result).toBeDefined();
    expect(tx.folioItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nameSnapshot: "Phụ thu lễ tân",
          itemType: "MANUAL_CHARGE",
          subtotalSnapshot: new Prisma.Decimal(50),
          totalSnapshot: new Prisma.Decimal(50),
          billingSourceSnapshot: expect.objectContaining({
            clientRequestId: "req-surcharge-1",
          }),
        }),
      }),
    );
    expect(tx.folioItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nameSnapshot: "Giảm giá đặc biệt",
          itemType: "DISCOUNT",
          discountAmountSnapshot: new Prisma.Decimal(20),
          totalSnapshot: new Prisma.Decimal(-20),
          billingSourceSnapshot: expect.objectContaining({
            clientRequestId: "req-discount-1",
          }),
        }),
      }),
    );
    expect(tx.invoice.create).toHaveBeenCalledTimes(1);
  });

  it("issueInvoice exact retry returns same invoice without adding items", async () => {
    const existingAdjustmentItem = {
      id: "item-adj-1",
      hotelId: "hotel-1",
      folioId: "folio-1",
      itemType: "MANUAL_CHARGE",
      nameSnapshot: "Phụ thu lễ tân",
      descriptionSnapshot: null,
      quantity: 1,
      unitPriceSnapshot: new Prisma.Decimal(50),
      subtotalSnapshot: new Prisma.Decimal(50),
      discountAmountSnapshot: new Prisma.Decimal(0),
      taxAmountSnapshot: new Prisma.Decimal(0),
      totalSnapshot: new Prisma.Decimal(50),
      currency: "VND",
      billingSourceSnapshot: {
        clientRequestId: "req-surcharge-1",
        itemType: "MANUAL_CHARGE",
        name: "Phụ thu lễ tân",
        amount: 50,
        quantity: 1,
      },
      voidedAt: null,
    };
    const existingInvoice = {
      id: "invoice-existing-1",
      hotelId: "hotel-1",
      folioId: "folio-1",
      totalAmount: new Prisma.Decimal(150),
    };

    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      folio: {
        findFirst: jest.fn().mockResolvedValue({
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          status: FolioStatus.OPEN,
          currency: "VND",
          subtotalAmount: new Prisma.Decimal(150),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(150),
          updatedAt: new Date("2026-07-17T10:00:00.000Z"),
          hotel: { id: "hotel-1", name: "Hotel" },
          room: { id: "room-1" },
          stay: { id: "stay-1" },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(existingInvoice),
        create: jest.fn(),
      },
      folioItem: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([existingAdjustmentItem]),
      },
      guestStay: { updateMany: jest.fn() },
    };
    const prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)),
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
          subtotalAmount: new Prisma.Decimal(150),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(150),
          updatedAt: new Date("2026-07-17T10:00:00.000Z"),
        },
      }),
    };
    const service = createService(prisma, repository);

    const result = await service.issueInvoice("user-1", "active-role", "hotel-1", "folio-1", {
      adjustments: [
        {
          clientRequestId: "req-surcharge-1",
          itemType: "MANUAL_CHARGE",
          name: "Phụ thu lễ tân",
          amount: 50,
          quantity: 1,
        },
      ],
    });

    expect(result).toEqual(existingInvoice);
    expect(tx.folioItem.create).not.toHaveBeenCalled();
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it("issueInvoice conflicting retry fails with ConflictException", async () => {
    const existingAdjustmentItem = {
      id: "item-adj-1",
      hotelId: "hotel-1",
      folioId: "folio-1",
      itemType: "MANUAL_CHARGE",
      nameSnapshot: "Phụ thu lễ tân",
      quantity: 1,
      unitPriceSnapshot: new Prisma.Decimal(50),
      billingSourceSnapshot: {
        clientRequestId: "req-surcharge-1",
      },
      voidedAt: null,
    };
    const existingInvoice = {
      id: "invoice-existing-1",
      hotelId: "hotel-1",
      folioId: "folio-1",
    };

    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      folio: {
        findFirst: jest.fn().mockResolvedValue({
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          status: FolioStatus.OPEN,
          currency: "VND",
          updatedAt: new Date("2026-07-17T10:00:00.000Z"),
          hotel: { id: "hotel-1", name: "Hotel" },
          room: { id: "room-1" },
          stay: { id: "stay-1" },
        }),
      },
      invoice: {
        findFirst: jest.fn().mockResolvedValue(existingInvoice),
      },
      folioItem: {
        findMany: jest.fn().mockResolvedValue([existingAdjustmentItem]),
      },
    };
    const prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)),
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
          subtotalAmount: new Prisma.Decimal(150),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(150),
          updatedAt: new Date("2026-07-17T10:00:00.000Z"),
        },
      }),
    };
    const service = createService(prisma, repository);

    await expect(
      service.issueInvoice("user-1", "active-role", "hotel-1", "folio-1", {
        adjustments: [
          {
            clientRequestId: "req-surcharge-1",
            itemType: "MANUAL_CHARGE",
            name: "Phụ thu lễ tân",
            amount: 999999,
            quantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("issueInvoice duplicate request IDs with conflicting payload fails with ConflictException", async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      folio: {
        findFirst: jest.fn().mockResolvedValue({
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          status: FolioStatus.OPEN,
          currency: "VND",
          updatedAt: new Date("2026-07-17T10:00:00.000Z"),
          hotel: { id: "hotel-1", name: "Hotel" },
          room: { id: "room-1" },
          stay: { id: "stay-1" },
        }),
      },
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      folioItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)),
    };
    const repository = {
      getFolioSummary: jest.fn().mockResolvedValue({
        latestItemPostedAt: null,
        grouped: [],
        folio: {
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
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

    await expect(
      service.issueInvoice("user-1", "active-role", "hotel-1", "folio-1", {
        adjustments: [
          {
            clientRequestId: "req-duplicate",
            itemType: "MANUAL_CHARGE",
            name: "Phụ thu A",
            amount: 50,
            quantity: 1,
          },
          {
            clientRequestId: "req-duplicate",
            itemType: "MANUAL_CHARGE",
            name: "Phụ thu B",
            amount: 100,
            quantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("issueInvoice rolls back and rejects when discount makes total negative", async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      folio: {
        findFirst: jest.fn().mockResolvedValue({
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          status: FolioStatus.OPEN,
          currency: "VND",
          updatedAt: new Date("2026-07-17T10:00:00.000Z"),
          hotel: { id: "hotel-1", name: "Hotel" },
          room: { id: "room-1", roomNumber: "101", price: new Prisma.Decimal(100) },
          stay: {
            id: "stay-1",
            plannedCheckInAt: new Date("2026-07-17T10:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-09-29T05:00:00.000Z"),
            checkedInAt: new Date("2026-07-18T09:40:00.000Z"),
            nightlyRateSnapshot: new Prisma.Decimal(100),
          },
        }),
      },
      invoice: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      folioItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "item-discount" }),
        findMany: jest.fn().mockResolvedValue([
          {
            itemType: "DISCOUNT",
            subtotalSnapshot: new Prisma.Decimal(0),
            taxAmountSnapshot: new Prisma.Decimal(0),
            discountAmountSnapshot: new Prisma.Decimal(999999),
            totalSnapshot: new Prisma.Decimal(-999999),
            currency: "VND",
          },
        ]),
      },
    };
    const prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: any) => Promise<unknown>) => callback(tx)),
    };
    const repository = {
      getFolioSummary: jest.fn().mockResolvedValue({
        latestItemPostedAt: null,
        grouped: [],
        folio: {
          id: "folio-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
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

    await expect(
      service.issueInvoice("user-1", "active-role", "hotel-1", "folio-1", {
        adjustments: [
          {
            clientRequestId: "req-discount-excessive",
            itemType: "DISCOUNT",
            name: "Giảm giá quá mức",
            amount: 999999,
            quantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });
});
