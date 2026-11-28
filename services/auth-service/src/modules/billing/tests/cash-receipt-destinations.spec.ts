import {
  BookingPaymentIntent,
  BookingPaymentMode,
  BookingPaymentStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RoomStatus,
} from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { BillingService } from "../application/billing.service";
import { HotelRevenueBookService } from "../../property/application/hotel-revenue-book.service";

describe("Cash Receipt Destinations Suite (Deposits, Checkout, Supplemental Revenue)", () => {
  const hotelId = "hotel-test-1";
  const actorUserId = "staff-user-1";
  const activeRoleId = "role-frontdesk";

  describe("Flow 1: Booking Deposits (BookingPayment)", () => {
    it("records user-provided destinationAccount for single tender deposit", async () => {
      let createdData: any = null;
      const txMock = {
        invoice: { findFirst: jest.fn().mockResolvedValue(null) },
        bookingPayment: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            createdData = data;
            return Promise.resolve({ id: "bp-1", ...data, createdAt: new Date(), updatedAt: new Date() });
          }),
        },
        reservation: {
          findFirst: jest.fn().mockResolvedValue({ id: "res-1", hotelId }),
        },
      };

      const billingService = new BillingService(
        {} as never,
        {
          assertHotelAccess: jest.fn().mockResolvedValue(undefined),
          resolveRoomScope: jest.fn().mockResolvedValue({ hotel: { id: hotelId, tenantId: "tenant", timezone: "Asia/Ho_Chi_Minh" }, allowedRoomId: null }),
          assertRoomAccess: jest.fn(),
        } as never,
        { $transaction: jest.fn().mockImplementation((cb) => cb(txMock)) } as never,
        { generateEntityCode: jest.fn().mockResolvedValue("CODE-001") } as never,
        { log: jest.fn(), warn: jest.fn() } as never,
      );

      const result = await billingService.recordBookingPayment(actorUserId, activeRoleId, hotelId, {
        reservationId: "res-1",
        amount: 500_000,
        receivedAmount: 500_000,
        paymentMethod: PaymentMethod.CASH,
        destinationAccount: "Két tiền mặt lễ tân",
      });

      expect(createdData).not.toBeNull();
      expect(createdData.destinationAccount).toBe("Két tiền mặt lễ tân");
      expect(result.destinationAccount).toBe("Két tiền mặt lễ tân");
    });

    it("records null destinationAccount when user does not provide one (no fabricated default)", async () => {
      let createdData: any = null;
      const txMock = {
        invoice: { findFirst: jest.fn().mockResolvedValue(null) },
        bookingPayment: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            createdData = data;
            return Promise.resolve({ id: "bp-2", ...data, createdAt: new Date(), updatedAt: new Date() });
          }),
        },
        reservation: {
          findFirst: jest.fn().mockResolvedValue({ id: "res-1", hotelId }),
        },
      };

      const billingService = new BillingService(
        {} as never,
        {
          assertHotelAccess: jest.fn().mockResolvedValue(undefined),
          resolveRoomScope: jest.fn().mockResolvedValue({ hotel: { id: hotelId, tenantId: "tenant", timezone: "Asia/Ho_Chi_Minh" }, allowedRoomId: null }),
          assertRoomAccess: jest.fn(),
        } as never,
        { $transaction: jest.fn().mockImplementation((cb) => cb(txMock)) } as never,
        { generateEntityCode: jest.fn().mockResolvedValue("CODE-002") } as never,
        { log: jest.fn(), warn: jest.fn() } as never,
      );

      const result = await billingService.recordBookingPayment(actorUserId, activeRoleId, hotelId, {
        reservationId: "res-1",
        amount: 500_000,
        receivedAmount: 500_000,
        paymentMethod: PaymentMethod.CASH,
      });

      expect(createdData).not.toBeNull();
      expect(createdData.destinationAccount).toBeNull();
      expect(result.destinationAccount).toBeNull();
    });

    it("records optional user-provided destination per actual tender in multi-split deposit", async () => {
      const createdLegs: any[] = [];
      const txMock = {
        invoice: { findFirst: jest.fn().mockResolvedValue(null) },
        bookingPayment: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            createdLegs.push(data);
            return Promise.resolve({ id: `bp-leg-${createdLegs.length}`, ...data, createdAt: new Date(), updatedAt: new Date() });
          }),
        },
        bookingPaymentAllocation: {
          create: jest.fn().mockResolvedValue({ id: "alloc-1" }),
        },
        reservation: {
          findFirst: jest.fn().mockResolvedValue({ id: "res-1", hotelId }),
        },
      };

      const billingService = new BillingService(
        {} as never,
        {
          assertHotelAccess: jest.fn().mockResolvedValue(undefined),
          resolveRoomScope: jest.fn().mockResolvedValue({ hotel: { id: hotelId, tenantId: "tenant", timezone: "Asia/Ho_Chi_Minh" }, allowedRoomId: null }),
          assertRoomAccess: jest.fn(),
        } as never,
        { $transaction: jest.fn().mockImplementation((cb) => cb(txMock)) } as never,
        { generateEntityCode: jest.fn().mockResolvedValue("CODE-003") } as never,
        { log: jest.fn(), warn: jest.fn() } as never,
      );

      const result = await billingService.recordBookingPayment(actorUserId, activeRoleId, hotelId, {
        reservationId: "res-1",
        amount: 1_000_000,
        splits: [
          { method: PaymentMethod.CASH, amount: 400_000, destinationAccount: "Két tiền mặt tầng 1" },
          { method: PaymentMethod.BANK_TRANSFER, amount: 600_000, destinationAccount: "Techcombank - 1902837465" },
        ],
      });

      expect(createdLegs.length).toBe(2);
      expect(createdLegs[0].paymentMethod).toBe(PaymentMethod.CASH);
      expect(createdLegs[0].destinationAccount).toBe("Két tiền mặt tầng 1");
      expect(createdLegs[1].paymentMethod).toBe(PaymentMethod.BANK_TRANSFER);
      expect(createdLegs[1].destinationAccount).toBe("Techcombank - 1902837465");
      expect(result.payments).toBeDefined();
      expect(result.payments[0].destinationAccount).toBe("Két tiền mặt tầng 1");
      expect(result.payments[1].destinationAccount).toBe("Techcombank - 1902837465");
    });

    it("replay never changes account and rejects replay with mismatched destinationAccount", async () => {
      const existingDeposit = {
        id: "bp-existing",
        hotelId,
        reservationId: "res-1",
        receivedAmount: new Prisma.Decimal(500_000),
        paymentMethod: PaymentMethod.CASH,
        intent: BookingPaymentIntent.DEPOSIT,
        destinationAccount: "Két tiền mặt lễ tân",
        idempotencyKey: "idem-dep-123",
      };

      const txMock = {
        invoice: { findFirst: jest.fn().mockResolvedValue(null) },
        bookingPayment: {
          findFirst: jest.fn().mockResolvedValue(existingDeposit),
          create: jest.fn(),
        },
      };

      const billingService = new BillingService(
        {} as never,
        {
          assertHotelAccess: jest.fn().mockResolvedValue(undefined),
          resolveRoomScope: jest.fn().mockResolvedValue({ hotel: { id: hotelId, tenantId: "tenant", timezone: "Asia/Ho_Chi_Minh" }, allowedRoomId: null }),
          assertRoomAccess: jest.fn(),
        } as never,
        { $transaction: jest.fn().mockImplementation((cb) => cb(txMock)) } as never,
        { generateEntityCode: jest.fn().mockResolvedValue("CODE-004") } as never,
        { log: jest.fn(), warn: jest.fn() } as never,
      );

      // Replay with matching destination returns existing without mutating account
      const replayResult = await billingService.recordBookingPayment(actorUserId, activeRoleId, hotelId, {
        reservationId: "res-1",
        amount: 500_000,
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: "idem-dep-123",
        destinationAccount: "Két tiền mặt lễ tân",
      });
      expect(replayResult.id).toBe("bp-existing");
      expect(replayResult.destinationAccount).toBe("Két tiền mặt lễ tân");
      expect(txMock.bookingPayment.create).not.toHaveBeenCalled();

      // Replay with different destinationAccount throws IDEMPOTENCY_KEY_PAYLOAD_MISMATCH
      await expect(
        billingService.recordBookingPayment(actorUserId, activeRoleId, hotelId, {
          reservationId: "res-1",
          amount: 500_000,
          paymentMethod: PaymentMethod.CASH,
          idempotencyKey: "idem-dep-123",
          destinationAccount: "Techcombank",
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("Flow 2: Counter Checkout (confirmManualPayment)", () => {
    it("records user-provided destinationAccount in Payment metadataJson for single tender checkout", async () => {
      let createdPaymentData: any = null;
      let createdTxData: any = null;
      const tx = {
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
        invoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-1",
            hotelId,
            folioId: "folio-1",
            stayId: "stay-1",
            currency: "VND",
            status: InvoiceStatus.ISSUED,
            paidAmount: new Prisma.Decimal(0),
            balanceAmount: new Prisma.Decimal(800_000),
            stay: { roomId: "room-1", checkedInAt: new Date() },
          }),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "inv-1", ...data })),
        },
        payment: {
          create: jest.fn().mockImplementation(({ data }) => {
            createdPaymentData = data;
            return Promise.resolve({ id: "pay-1", paymentNumber: "PM-1", ...data });
          }),
        },
        paymentTransaction: {
          create: jest.fn().mockImplementation(({ data }) => {
            createdTxData = data;
            return Promise.resolve({ id: "tx-1", ...data });
          }),
        },
        hotel: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ tenantId: "tenant-1" }),
        },
        room: {
          findUnique: jest.fn().mockResolvedValue({ id: "room-1", status: RoomStatus.OCCUPIED }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        guestSession: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        guestStay: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        folio: {
          update: jest.fn().mockResolvedValue({ id: "folio-1" }),
        },
        housekeepingTask: {
          findFirst: jest.fn().mockResolvedValue({ id: "hk-1" }),
          create: jest.fn().mockResolvedValue({ id: "hk-1", room: { roomNumber: "101" } }),
        },
        housekeepingTaskHistory: {
          create: jest.fn().mockResolvedValue({ id: "hkh-1" }),
        },
        housekeepingNotification: {
          create: jest.fn().mockResolvedValue({ id: "hkn-1" }),
        },
        domainEvent: {
          create: jest.fn().mockResolvedValue({ id: "de-1" }),
        },
      };

      const mockInvoiceDetail1 = {
        invoice: {
          id: "inv-1",
          invoiceNumber: "INV-001",
          status: InvoiceStatus.PAID,
          currency: "VND",
          issuedAt: new Date(),
          subtotalAmount: new Prisma.Decimal(800_000),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(800_000),
          paidAmount: new Prisma.Decimal(800_000),
          balanceAmount: new Prisma.Decimal(0),
          folio: { id: "folio-1", folioNumber: "FOLIO-001", status: "CLOSED" },
          stay: {
            id: "stay-1",
            guestDisplayName: "Nguyen Van A",
            room: { id: "room-1", roomNumber: "101" },
            checkedInAt: new Date(),
            checkedOutAt: new Date(),
          },
        },
        items: [],
        payments: [],
      };

      const billingService = new BillingService(
        {
          checkoutPendingInvoiceUpdate: jest.fn().mockResolvedValue({ count: 1 }),
          findInvoiceDetail: jest.fn().mockResolvedValue(mockInvoiceDetail1),
        } as never,
        {
          assertHotelAccess: jest.fn().mockResolvedValue(undefined),
          resolveRoomScope: jest.fn().mockResolvedValue({ hotel: { id: hotelId, tenantId: "tenant", timezone: "Asia/Ho_Chi_Minh" }, allowedRoomId: null }),
          assertRoomAccess: jest.fn(),
        } as never,
        { $transaction: jest.fn().mockImplementation((cb) => cb(tx)) } as never,
        { generateEntityCode: jest.fn().mockResolvedValue("PAY-001") } as never,
        { log: jest.fn(), warn: jest.fn() } as never,
      );

      const result = await billingService.confirmManualPayment(actorUserId, activeRoleId, hotelId, "inv-1", {
        method: PaymentMethod.BANK_TRANSFER,
        amount: 800_000,
        destinationAccount: "Vietcombank - 1012345678",
        clientRequestId: "req-checkout-1",
      });

      expect(createdPaymentData).not.toBeNull();
      expect(createdPaymentData.metadataJson.destinationAccount).toBe("Vietcombank - 1012345678");
      expect(createdTxData.rawPayloadJson.destinationAccount).toBe("Vietcombank - 1012345678");
    });

    it("records user-provided destinationAccount per split leg in Payment metadataJson for multi-split checkout", async () => {
      const createdPayments: any[] = [];
      const tx = {
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
        invoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-2",
            hotelId,
            folioId: "folio-2",
            stayId: "stay-2",
            currency: "VND",
            status: InvoiceStatus.ISSUED,
            paidAmount: new Prisma.Decimal(0),
            balanceAmount: new Prisma.Decimal(1_000_000),
            stay: { roomId: "room-2", checkedInAt: new Date() },
          }),
          update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "inv-2", ...data })),
        },
        payment: {
          create: jest.fn().mockImplementation(({ data }) => {
            createdPayments.push(data);
            return Promise.resolve({ id: `pay-${createdPayments.length}`, paymentNumber: `PM-${createdPayments.length}`, ...data });
          }),
        },
        paymentTransaction: {
          create: jest.fn().mockResolvedValue({ id: "tx-split" }),
        },
        hotel: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ tenantId: "tenant-1" }),
        },
        room: {
          findUnique: jest.fn().mockResolvedValue({ id: "room-2", status: RoomStatus.OCCUPIED }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        guestSession: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        guestStay: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        folio: {
          update: jest.fn().mockResolvedValue({ id: "folio-2" }),
        },
        housekeepingTask: {
          findFirst: jest.fn().mockResolvedValue({ id: "hk-2" }),
          create: jest.fn().mockResolvedValue({ id: "hk-2", room: { roomNumber: "102" } }),
        },
        housekeepingTaskHistory: {
          create: jest.fn().mockResolvedValue({ id: "hkh-2" }),
        },
        housekeepingNotification: {
          create: jest.fn().mockResolvedValue({ id: "hkn-2" }),
        },
        domainEvent: {
          create: jest.fn().mockResolvedValue({ id: "de-2" }),
        },
      };

      const mockInvoiceDetail1 = {
        invoice: {
          id: "inv-1",
          invoiceNumber: "INV-001",
          status: InvoiceStatus.PAID,
          currency: "VND",
          issuedAt: new Date(),
          subtotalAmount: new Prisma.Decimal(800_000),
          taxAmount: new Prisma.Decimal(0),
          discountAmount: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(800_000),
          paidAmount: new Prisma.Decimal(800_000),
          balanceAmount: new Prisma.Decimal(0),
          folio: { id: "folio-1", folioNumber: "FOLIO-001", status: "CLOSED" },
          stay: {
            id: "stay-1",
            guestDisplayName: "Nguyen Van A",
            room: { id: "room-1", roomNumber: "101" },
            checkedInAt: new Date(),
            checkedOutAt: new Date(),
          },
        },
        items: [],
        payments: [],
      };

      const billingService = new BillingService(
        {
          checkoutPendingInvoiceUpdate: jest.fn().mockResolvedValue({ count: 1 }),
          findInvoiceDetail: jest.fn().mockResolvedValue(mockInvoiceDetail1),
        } as never,
        {
          assertHotelAccess: jest.fn().mockResolvedValue(undefined),
          resolveRoomScope: jest.fn().mockResolvedValue({ hotel: { id: hotelId, tenantId: "tenant", timezone: "Asia/Ho_Chi_Minh" }, allowedRoomId: null }),
          assertRoomAccess: jest.fn(),
        } as never,
        { $transaction: jest.fn().mockImplementation((cb) => cb(tx)) } as never,
        { generateEntityCode: jest.fn().mockResolvedValue("PAY-002") } as never,
        { log: jest.fn(), warn: jest.fn() } as never,
      );

      await billingService.confirmManualPayment(actorUserId, activeRoleId, hotelId, "inv-2", {
        amount: 1_000_000,
        splits: [
          { method: PaymentMethod.CASH, amount: 400_000, destinationAccount: "Két lễ tân ca sáng" },
          { method: PaymentMethod.BANK_TRANSFER, amount: 600_000, destinationAccount: "Vietcombank - Quầy" },
        ],
        clientRequestId: "req-checkout-split",
      });

      expect(createdPayments.length).toBe(2);
      expect(createdPayments[0].method).toBe(PaymentMethod.CASH);
      expect(createdPayments[0].metadataJson.destinationAccount).toBe("Két lễ tân ca sáng");
      expect(createdPayments[1].method).toBe(PaymentMethod.BANK_TRANSFER);
      expect(createdPayments[1].metadataJson.destinationAccount).toBe("Vietcombank - Quầy");
    });
  });

  describe("Flow 3: Supplemental Manual Revenue Receipts (HotelRevenueCollection)", () => {
    it("records user-provided destinationAccount on HotelRevenueCollection during manual entry creation", async () => {
      let createdEntry: any = null;
      const tx = {
        hotelRevenueEntry: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            createdEntry = data;
            return Promise.resolve({ id: "rev-entry-1", version: 1, ...data });
          }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: "audit-1" }),
        },
        hotel: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ tenantId: "tenant-1" }),
        },
        room: {
          findFirst: jest.fn().mockResolvedValue({ roomNumber: "101" }),
        },
      };

      const accessMock = {
        resolveRoomScope: jest.fn().mockResolvedValue({
          hotel: { id: hotelId, tenantId: "tenant-1", name: "Hotel Test", timezone: "Asia/Ho_Chi_Minh" },
          allowedRoomId: null,
          allowedRoomIds: null,
        }),
        loadActorContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, permissions: new Set(["hotel.billing.manage"]) }),
        assertRoomAccess: jest.fn(),
      };

      const revenueService = new HotelRevenueBookService(
        { $transaction: jest.fn().mockImplementation((cb) => cb(tx)) } as never,
        accessMock as never,
      );

      const result = await revenueService.create(actorUserId, activeRoleId, hotelId, {
        date: "2026-11-26",
        description: "Thu tiền giặt ủi ngoài",
        category: "LAUNDRY",
        amount: 250_000,
        idempotencyKey: "rev-idem-1",
        collection: {
          amount: 250_000,
          method: "CASH",
          destinationAccount: "Két tiền mặt lễ tân",
          receivedAt: new Date().toISOString(),
        },
      });

      expect(result.id).toBe("rev-entry-1");
      expect(createdEntry).not.toBeNull();
      expect(createdEntry.collections.create.destinationAccount).toBe("Két tiền mặt lễ tân");
    });

    it("records user-provided destinationAccount per split leg during collect()", async () => {
      const createdCollections: any[] = [];
      const mockEntry = {
        id: "rev-entry-2",
        hotelId,
        amount: new Prisma.Decimal(1_000_000),
        version: 1,
        voidedAt: null,
        collections: [],
      };

      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: "rev-entry-2" }]),
        hotelRevenueEntry: {
          findFirst: jest.fn().mockResolvedValue(mockEntry),
          update: jest.fn().mockResolvedValue({ id: "rev-entry-2", version: 2 }),
        },
        hotelRevenueCollection: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation(({ data }) => {
            createdCollections.push(data);
            return Promise.resolve({ id: `col-${createdCollections.length}`, ...data });
          }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: "audit-2" }),
        },
      };

      const accessMock = {
        resolveRoomScope: jest.fn().mockResolvedValue({
          hotel: { id: hotelId, tenantId: "tenant-1", name: "Hotel Test", timezone: "Asia/Ho_Chi_Minh" },
          allowedRoomId: null,
          allowedRoomIds: null,
        }),
        loadActorContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, permissions: new Set(["hotel.billing.manage"]) }),
        assertRoomAccess: jest.fn(),
      };

      const revenueService = new HotelRevenueBookService(
        { $transaction: jest.fn().mockImplementation((cb) => cb(tx)) } as never,
        accessMock as never,
      );

      const result = await revenueService.collect(actorUserId, activeRoleId, hotelId, "rev-entry-2", {
        receivedAt: new Date().toISOString(),
        idempotencyKey: "collect-idem-1",
        version: 1,
        splits: [
          { method: "CASH", amount: 400_000, destinationAccount: "Két lễ tân" },
          { method: "BANK_TRANSFER", amount: 600_000, destinationAccount: "ACB - 987654321" },
        ],
      });

      expect(result.id).toBe("rev-entry-2");
      expect(result.version).toBe(2);
      expect(createdCollections.length).toBe(2);
      expect(createdCollections[0].method).toBe("CASH");
      expect(createdCollections[0].destinationAccount).toBe("Két lễ tân");
      expect(createdCollections[1].method).toBe("BANK_TRANSFER");
      expect(createdCollections[1].destinationAccount).toBe("ACB - 987654321");
    });
  });
});
