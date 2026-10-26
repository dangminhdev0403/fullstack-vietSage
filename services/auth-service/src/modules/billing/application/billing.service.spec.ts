import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import {
  BookingPaymentIntent,
  BookingPaymentMode,
  BookingPaymentStatus,
  FolioStatus,
  GuestStayStatus,
  PaymentMethod,
  Prisma,
  ReceivableDebtorType,
  ReceivableStatus,
  RoomQRCodeStatus,
  RoomStatus,
} from "@prisma/client";
import { BillingService } from "./billing.service";
import { createBookingPaymentBodySchema } from "../domain/schemas/billing.schema";

describe("BillingService - Commercial Ledger, Deposit Modes, Idempotency & Receivables", () => {
  let service: BillingService;
  let mockPrisma: any;
  let mockTx: any;
  let mockHotelAccessService: any;
  let mockBillingRepository: any;
  let mockCodesService: any;
  let mockLogger: any;
  let mockEventPublisher: any;

  const actorUserId = "user-1";
  const activeRoleId = "role-reception";
  const hotelId = "hotel-1";

  beforeEach(() => {
    mockTx = {
      $queryRaw: jest.fn(),
      bookingPayment: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      bookingPaymentAllocation: {
        create: jest.fn(),
      },
      reservation: {
        findFirst: jest.fn(),
      },
      reservationGroup: {
        findFirst: jest.fn(),
      },
      guestStay: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      folio: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      invoice: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
      },
      hotelReceivable: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      receivableCollection: {
        create: jest.fn(),
      },
      guestSession: {
        updateMany: jest.fn(),
      },
      roomQRCode: {
        updateMany: jest.fn(),
      },
      room: {
        updateMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    mockPrisma = {
      $transaction: jest.fn(async (cb: any, _options?: any) => cb(mockTx)),
    };

    mockHotelAccessService = {
      assertHotelAccess: jest.fn().mockResolvedValue(undefined),
      resolveRoomScope: jest.fn().mockResolvedValue({
        hotel: { id: hotelId },
        allowedRoomId: null,
        mode: "HOTEL_WIDE",
      }),
    };

    mockBillingRepository = {};
    mockCodesService = {
      generateEntityCode: jest.fn().mockResolvedValue("CODE-001"),
    };
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockEventPublisher = {
      publishConversationClosed: jest.fn().mockResolvedValue(undefined),
    };

    service = new BillingService(
      mockBillingRepository,
      mockHotelAccessService,
      mockPrisma,
      mockCodesService,
      mockLogger,
      mockEventPublisher,
    );
  });

  describe("AUD-06 & AUD-08: createBookingPayment / recordBookingPayment", () => {
    it("rejects orphan booking payment when neither reservationId nor groupId is provided", async () => {
      const schemaCheck = createBookingPaymentBodySchema.safeParse({
        inputMode: "AMOUNT",
        amount: 500000,
        paymentMethod: PaymentMethod.CASH,
      });
      expect(schemaCheck.success).toBe(false);

      await expect(
        service.createBookingPayment(actorUserId, activeRoleId, hotelId, {
          inputMode: "AMOUNT",
          amount: 500000,
          paymentMethod: PaymentMethod.CASH,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockTx.bookingPayment.create).not.toHaveBeenCalled();
    });

    it("computes deposit server-side when inputMode is PERCENT and creates BookingPaymentAllocation", async () => {
      mockTx.reservation.findFirst.mockResolvedValue({
        id: "res-1",
        hotelId,
        totalAmount: new Prisma.Decimal(2000000),
        stay: { folioId: "folio-1" },
      });

      mockTx.bookingPayment.create.mockImplementation(async ({ data }: any) => ({
        id: "bp-1",
        ...data,
      }));

      const result = await service.createBookingPayment(actorUserId, activeRoleId, hotelId, {
        reservationId: "res-1",
        intent: BookingPaymentIntent.DEPOSIT,
        inputMode: "PERCENT",
        percentValue: 30,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: "idem-percent-30",
      });

      expect(mockTx.bookingPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hotelId,
            reservationId: "res-1",
            inputMode: BookingPaymentMode.PERCENT,
            percentValue: new Prisma.Decimal(30),
            requestedAmount: new Prisma.Decimal("600000"),
            receivedAmount: new Prisma.Decimal("600000"),
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            idempotencyKey: "idem-percent-30",
          }),
        }),
      );

      expect(mockTx.bookingPaymentAllocation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hotelId,
          bookingPaymentId: "bp-1",
          reservationId: "res-1",
          folioId: "folio-1",
          allocatedAmount: new Prisma.Decimal("600000"),
          allocatedByUserId: actorUserId,
        }),
      });
      expect(result.receivedAmount.toString()).toBe("600000");
    });

    it("computes remaining balance when inputMode is FULL", async () => {
      mockTx.reservation.findFirst.mockResolvedValue({
        id: "res-full",
        hotelId,
        totalAmount: new Prisma.Decimal(1500000),
        paidDepositAmount: new Prisma.Decimal(500000),
      });

      mockTx.bookingPayment.create.mockImplementation(async ({ data }: any) => ({
        id: "bp-full",
        ...data,
      }));

      const result = await service.createBookingPayment(actorUserId, activeRoleId, hotelId, {
        reservationId: "res-full",
        intent: BookingPaymentIntent.FULL,
        inputMode: "FULL",
        paymentMethod: PaymentMethod.CASH,
      });

      expect(result.requestedAmount.toString()).toBe("1000000");
      expect(result.receivedAmount.toString()).toBe("1000000");
    });

    it("scopes idempotency lookup by (hotelId, idempotencyKey) and rejects mismatched payload reuse", async () => {
      mockTx.bookingPayment.findFirst.mockResolvedValue({
        id: "bp-existing",
        hotelId,
        reservationId: "res-1",
        groupId: null,
        intent: BookingPaymentIntent.DEPOSIT,
        paymentMethod: PaymentMethod.CASH,
        receivedAmount: new Prisma.Decimal(500000),
      });

      const idempotentResult = await service.recordBookingPayment(
        actorUserId,
        activeRoleId,
        hotelId,
        {
          reservationId: "res-1",
          intent: BookingPaymentIntent.DEPOSIT,
          paymentMethod: PaymentMethod.CASH,
          receivedAmount: 500000,
          idempotencyKey: "shared-key-1",
        },
      );

      expect(mockTx.bookingPayment.findFirst).toHaveBeenCalledWith({
        where: { hotelId, idempotencyKey: "shared-key-1" },
      });
      expect(idempotentResult.id).toBe("bp-existing");

      await expect(
        service.recordBookingPayment(actorUserId, activeRoleId, hotelId, {
          reservationId: "res-1",
          intent: BookingPaymentIntent.DEPOSIT,
          paymentMethod: PaymentMethod.CASH,
          receivedAmount: 900000,
          idempotencyKey: "shared-key-1",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("AUD-07: transferStayToReceivable concurrency, QR deactivation & lifecycle cleanup", () => {
    const stayId = "stay-101";

    it("locks GuestStay FOR UPDATE in Serializable tx, guards duplicate receivable, deactivates QR, records AuditLog, and closes conversation", async () => {
      mockTx.$queryRaw.mockResolvedValue([
        { id: stayId, status: GuestStayStatus.ACTIVE, roomId: "room-101", reservationId: "res-1" },
      ]);
      mockTx.guestStay.findFirst.mockResolvedValue({
        id: stayId,
        hotelId,
        roomId: "room-101",
        guestDisplayName: "Nguyễn Văn A",
        status: GuestStayStatus.ACTIVE,
        room: { id: "room-101", roomNumber: "101" },
      });
      mockTx.hotelReceivable.findFirst.mockResolvedValue(null);
      mockTx.folio.findFirst.mockResolvedValue({
        id: "folio-101",
        hotelId,
        stayId,
        status: FolioStatus.OPEN,
        totalAmount: new Prisma.Decimal(1200000),
      });
      mockTx.invoice.findFirst.mockResolvedValue(null);
      mockTx.hotelReceivable.create.mockImplementation(async ({ data }: any) => ({
        id: "rec-101",
        ...data,
      }));

      const res = await service.transferStayToReceivable(
        actorUserId,
        activeRoleId,
        hotelId,
        stayId,
        {
          debtorName: "Công ty Du lịch ABC",
          debtorType: ReceivableDebtorType.COMPANY,
          notes: "Công nợ đoàn tháng 10",
        },
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }),
      );
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockTx.roomQRCode.updateMany).toHaveBeenCalledWith({
        where: {
          hotelId,
          currentStayId: stayId,
          status: RoomQRCodeStatus.ACTIVE,
        },
        data: {
          status: RoomQRCodeStatus.INACTIVE,
          validTo: expect.any(Date),
        },
      });
      expect(mockTx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "STAY_TRANSFERRED_TO_RECEIVABLE",
            entityType: "HotelReceivable",
            entityId: "rec-101",
          }),
        }),
      );
      expect(mockTx.payment.create).not.toHaveBeenCalled();
      expect(mockEventPublisher.publishConversationClosed).toHaveBeenCalledWith(
        expect.objectContaining({
          hotelId,
          stayId,
          closedAt: expect.any(String),
        }),
      );
      expect(res.success).toBe(true);
      expect(res.outstandingAmount.toString()).toBe("1200000");
    });

    it("throws ConflictException when stay already has an open/partial receivable", async () => {
      mockTx.$queryRaw.mockResolvedValue([
        { id: stayId, status: GuestStayStatus.ACTIVE, roomId: "room-101", reservationId: "res-1" },
      ]);
      mockTx.guestStay.findFirst.mockResolvedValue({
        id: stayId,
        hotelId,
        roomId: "room-101",
        status: GuestStayStatus.ACTIVE,
      });
      mockTx.hotelReceivable.findFirst.mockResolvedValue({
        id: "rec-existing",
        hotelId,
        stayId,
        status: ReceivableStatus.OPEN,
      });

      await expect(
        service.transferStayToReceivable(actorUserId, activeRoleId, hotelId, stayId, {
          debtorName: "Khách lẻ",
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockTx.hotelReceivable.create).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when FOR UPDATE lock query returns empty array", async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      await expect(
        service.transferStayToReceivable(actorUserId, activeRoleId, hotelId, "missing-stay", {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("AUD-07: collectReceivable row-level locking & audit trail", () => {
    const receivableId = "rec-200";

    it("locks HotelReceivable FOR UPDATE in Serializable tx, updates paidAmount & outstandingAmount, and records AuditLog", async () => {
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: receivableId,
          status: ReceivableStatus.OPEN,
          outstandingAmount: new Prisma.Decimal(1000000),
          paidAmount: new Prisma.Decimal(200000),
        },
      ]);
      mockTx.hotelReceivable.findFirst.mockResolvedValue({
        id: receivableId,
        hotelId,
        status: ReceivableStatus.OPEN,
        originalAmount: new Prisma.Decimal(1200000),
        paidAmount: new Prisma.Decimal(200000),
        outstandingAmount: new Prisma.Decimal(1000000),
      });
      mockTx.receivableCollection.create.mockImplementation(async ({ data }: any) => ({
        id: "col-1",
        ...data,
      }));
      mockTx.hotelReceivable.update.mockImplementation(async ({ data }: any) => ({
        id: receivableId,
        ...data,
        collections: [],
      }));

      const result = await service.collectReceivable(
        actorUserId,
        activeRoleId,
        hotelId,
        receivableId,
        {
          collectedAmount: 400000,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          reference: "UNC-001",
        },
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        }),
      );
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockTx.hotelReceivable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: receivableId },
          data: expect.objectContaining({
            paidAmount: new Prisma.Decimal(600000),
            outstandingAmount: new Prisma.Decimal(600000),
            status: ReceivableStatus.PARTIALLY_COLLECTED,
          }),
        }),
      );
      expect(mockTx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "HOTEL_RECEIVABLE_COLLECTED",
            entityType: "HotelReceivable",
            entityId: receivableId,
          }),
        }),
      );
      expect(result.receivable.status).toBe(ReceivableStatus.PARTIALLY_COLLECTED);
    });
  });
});
