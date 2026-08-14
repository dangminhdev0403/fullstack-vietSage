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
import { ConflictException } from "@nestjs/common";
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
      room: { update: jest.fn().mockResolvedValue({}) },
      roomQRCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      paymentTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: typeof tx) => Promise<unknown>) => callback(tx)),
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
    expect(tx.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
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
      room: { update: jest.fn().mockResolvedValue({}) },
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
    expect(tx.roomQRCode.updateMany).not.toHaveBeenCalled();
  });

  it("confirmManualPayment records the counter method and settles through the guarded payment flow", async () => {
    const payment = {
      id: "payment-counter-1",
      hotelId: "hotel-1",
      invoiceId: "invoice-1",
      folioId: "folio-1",
      stayId: "stay-1",
      paymentNumber: "PAY-001",
      provider: PaymentProvider.MANUAL,
      status: PaymentStatus.PENDING,
      method: PaymentMethod.MANUAL,
      amount: new Prisma.Decimal(250000),
      currency: "VND",
    };
    const prisma = {
      payment: { update: jest.fn().mockResolvedValue({ ...payment, method: PaymentMethod.CASH }) },
    };
    const service = createService(prisma);
    jest
      .spyOn(service, "createPaymentSession")
      .mockResolvedValue({ reused: false, payment } as never);
    const processPaymentWebhook = jest
      .spyOn(service, "processPaymentWebhook")
      .mockResolvedValue({ received: true, paid: true } as never);
    jest
      .spyOn(service, "getPaymentStatus")
      .mockResolvedValue({ ...payment, status: PaymentStatus.SUCCEEDED } as never);
    jest
      .spyOn(service, "getInvoiceDetail")
      .mockResolvedValue({ invoice: { id: "invoice-1", status: InvoiceStatus.PAID } } as never);

    await service.confirmManualPayment("staff-1", "frontdesk-role", "hotel-1", "invoice-1", {
      method: PaymentMethod.CASH,
      note: "Thu đủ tại quầy",
    });

    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: payment.id },
      data: {
        method: PaymentMethod.CASH,
        metadataJson: { source: "front_desk", note: "Thu đủ tại quầy" },
      },
    });
    expect(processPaymentWebhook).toHaveBeenCalledWith(
      PaymentProvider.MANUAL,
      expect.objectContaining({
        signatureVerified: true,
        eventType: "payment.succeeded",
        paymentId: payment.id,
        actorUserId: "staff-1",
      }),
    );
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
        },
      },
      "user-1",
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
      $transaction: jest.fn((callback: (tx: typeof tx) => Promise<unknown>) => callback(tx)),
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
      $transaction: jest.fn((callback: (tx: typeof tx) => Promise<unknown>) => callback(tx)),
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
      $transaction: jest.fn((callback: (tx: typeof tx) => Promise<unknown>) => callback(tx)),
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
});
