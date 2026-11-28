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
  GuestStayStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReceivableDebtorType,
  ReceivableStatus,
} from "@prisma/client";
import { BillingService } from "../application/billing.service";
import { PaymentController } from "../api/payment.controller";

function createBillingService(
  prisma: Record<string, unknown>,
  repository: Record<string, unknown> = {},
) {
  return new BillingService(
    repository as never,
    {
      assertHotelAccess: jest.fn().mockResolvedValue(undefined),
      resolveRoomScope: jest.fn().mockResolvedValue({ hotel: { id: "hotel", tenantId: "tenant", timezone: "Asia/Ho_Chi_Minh" }, allowedRoomId: null }),
      assertRoomAccess: jest.fn(),
    } as never,
    prisma as never,
    { generateEntityCode: jest.fn().mockResolvedValue("PAY-001") } as never,
    { log: jest.fn(), warn: jest.fn() } as never,
  );
}

describe("Finance Workstream B Test Suite", () => {
  const hotelId = "hotel-b-1";
  const actorUserId = "staff-accountant-1";
  const activeRoleId = "role-accountant";

  describe("1. Debtor & Booking Traceability in Folios & Receivables", () => {
    it("listReceivables trả về đầy đủ liên kết bookingCode, phòng, ngày lưu trú, hóa đơn và lịch sử thu nợ", async () => {
      const mockReceivable = {
        id: "rec-1",
        hotelId,
        stayId: "stay-1",
        folioId: "folio-1",
        invoiceId: "inv-1",
        debtorName: "Agoda Vietnam",
        debtorType: ReceivableDebtorType.PARTNER,
        originalAmount: new Prisma.Decimal(2500000),
        paidAmount: new Prisma.Decimal(1000000),
        outstandingAmount: new Prisma.Decimal(1500000),
        status: ReceivableStatus.PARTIALLY_COLLECTED,
        createdAt: new Date("2026-11-20T10:00:00Z"),
        stay: {
          id: "stay-1",
          reservationCode: "BK-AGODA-999",
          guestDisplayName: "John Smith",
          status: GuestStayStatus.CHECKED_OUT,
          checkedInAt: new Date("2026-11-18T14:00:00Z"),
          checkedOutAt: new Date("2026-11-20T11:00:00Z"),
          room: { id: "room-201", roomNumber: "201" },
          reservation: {
            id: "res-1",
            reservationCode: "BK-AGODA-999",
            sourceCategory: "OTA",
            sourcePartner: { id: "p-1", name: "Agoda", code: "AGODA" },
          },
        },
        folio: { id: "folio-1", folioNumber: "FOLIO-201-01", totalAmount: new Prisma.Decimal(2500000) },
        invoice: {
          id: "inv-1",
          invoiceNumber: "INV-202611-001",
          totalAmount: new Prisma.Decimal(2500000),
          paidAmount: new Prisma.Decimal(1000000),
          balanceAmount: new Prisma.Decimal(1500000),
        },
        debtorPartner: { id: "p-1", name: "Agoda", code: "AGODA" },
        collections: [
          {
            id: "col-1",
            collectedAmount: new Prisma.Decimal(1000000),
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            destinationAccount: "Vietcombank - 1012345678",
            collectedAt: new Date("2026-11-22T09:00:00Z"),
            reference: "VCB-REF-001",
            notes: "Thu đợt 1",
          },
        ],
      };

      const prismaMock = {
        hotelReceivable: {
          findMany: jest.fn().mockResolvedValue([mockReceivable]),
          count: jest.fn().mockResolvedValue(1),
        },
      };

      const service = createBillingService(prismaMock);
      const result = await service.listReceivables(actorUserId, activeRoleId, hotelId);

      expect(result.total).toBe(1);
      const item = result.items[0];
      expect(item.bookingCode).toBe("BK-AGODA-999");
      expect(item.roomNumber).toBe("201");
      expect(item.invoiceNumber).toBe("INV-202611-001");
      expect(item.folioNumber).toBe("FOLIO-201-01");
      expect(item.debtorPartnerName).toBe("Agoda");
      expect(item.stayDates).toEqual({
        checkIn: "2026-11-18T14:00:00.000Z",
        checkOut: "2026-11-20T11:00:00.000Z",
      });
      expect(item.collections).toHaveLength(1);
      expect(item.collections[0].destinationAccount).toBe("Vietcombank - 1012345678");
    });
  });

  describe("2. Verification Case 2: OTA prepay, zero cash at checkout, 2 later receipts, idempotent retry", () => {
    it("thu nợ 2 lần vào 2 ngày khác nhau giảm dần dư nợ, lặp lại submission không sinh biên nhận thứ hai", async () => {
      let currentPaid = new Prisma.Decimal(0);
      let currentOut = new Prisma.Decimal(2000000);
      let currentStatus: ReceivableStatus = ReceivableStatus.OPEN;
      const collections: any[] = [];

      const txMock = {
        $queryRaw: jest.fn().mockResolvedValue([{
          id: "rec-ota-1",
          status: currentStatus,
          outstandingAmount: currentOut,
          paidAmount: currentPaid,
        }]),
        hotelReceivable: {
          findFirst: jest.fn().mockImplementation(() =>
            Promise.resolve({
              id: "rec-ota-1",
              hotelId,
              debtorName: "Agoda",
              status: currentStatus,
              outstandingAmount: currentOut,
              paidAmount: currentPaid,
            }),
          ),
          update: jest.fn().mockImplementation(({ data }) => {
            currentPaid = data.paidAmount;
            currentOut = data.outstandingAmount;
            currentStatus = data.status;
            return Promise.resolve({
              id: "rec-ota-1",
              paidAmount: currentPaid,
              outstandingAmount: currentOut,
              status: currentStatus,
              collections,
            });
          }),
        },
        receivableCollection: {
          findMany: jest.fn().mockImplementation(({ where }) => {
            const matched = collections.filter((c) => {
              if (where?.receivableId && c.receivableId !== where.receivableId) return false;
              if (where?.submissionKey !== undefined) return c.submissionKey === where.submissionKey;
              if (where?.reference !== undefined) return c.reference === where.reference;
              return false;
            });
            return Promise.resolve(matched);
          }),
          create: jest.fn().mockImplementation(({ data }) => {
            const created = { id: `col-${collections.length + 1}`, ...data };
            collections.push(created);
            return Promise.resolve(created);
          }),
        },
      };

      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      // Đợt 1: Thu 400,000 VND có cả idempotencyKey và mã tham chiếu ngân hàng (R2)
      const collect1 = await service.collectReceivable(actorUserId, activeRoleId, hotelId, "rec-ota-1", {
        collectedAmount: 400000,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        destinationAccount: "Techcombank - 1902837465",
        reference: "BANK-TX-400K",
        idempotencyKey: "idem-receipt-1",
      });

      expect(collect1.receivable.paidAmount.toNumber()).toBe(400000);
      expect(collect1.receivable.outstandingAmount.toNumber()).toBe(1600000);
      expect(collect1.receivable.status).toBe(ReceivableStatus.PARTIALLY_COLLECTED);
      expect(collections).toHaveLength(1);
      expect(collections[0].destinationAccount).toBe("Techcombank - 1902837465");

      // Retry đợt 1 với cùng idempotencyKey + cùng mã ngân hàng: KHÔNG sinh biên nhận thứ hai!
      const retry1 = await service.collectReceivable(actorUserId, activeRoleId, hotelId, "rec-ota-1", {
        collectedAmount: 400000,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        destinationAccount: "Techcombank - 1902837465",
        reference: "BANK-TX-400K",
        idempotencyKey: "idem-receipt-1",
      });
      expect(collections).toHaveLength(1); // Vẫn 1 collection, paid = 400k, outstanding = 1,600k!
      expect(retry1.collection.id).toBe("col-1");

      // Đợt 2: Thu nốt 1,600,000 VND chia 2 phương thức vào ngày khác -> tất toán
      const collect2 = await service.collectReceivable(actorUserId, activeRoleId, hotelId, "rec-ota-1", {
        collectedAmount: 1600000,
        splits: [
          { method: PaymentMethod.BANK_TRANSFER, amount: 1000000, destinationAccount: "Vietcombank - 1012345678" },
          { method: PaymentMethod.CASH, amount: 600000, destinationAccount: "Két tiền mặt lễ tân" },
        ],
        idempotencyKey: "idem-receipt-2",
        collectedAt: "2026-11-24T10:00:00.000Z",
      });

      expect(collect2.receivable.paidAmount.toNumber()).toBe(2000000);
      expect(collect2.receivable.outstandingAmount.toNumber()).toBe(0);
      expect(collect2.receivable.status).toBe(ReceivableStatus.SETTLED);
      expect(collections).toHaveLength(3);
      expect(collect2.collections).toHaveLength(2);
      expect(collections[1].collectedAt.toISOString()).toBe("2026-11-24T10:00:00.000Z");

      // Replay đợt 2 SAU KHI đã SETTLED -> vẫn trả về đủ 2 dòng đã ghi, không bị từ chối theo trạng thái!
      const retrySettled = await service.collectReceivable(actorUserId, activeRoleId, hotelId, "rec-ota-1", {
        collectedAmount: 1600000,
        splits: [
          { method: PaymentMethod.BANK_TRANSFER, amount: 1000000, destinationAccount: "Vietcombank - 1012345678" },
          { method: PaymentMethod.CASH, amount: 600000, destinationAccount: "Két tiền mặt lễ tân" },
        ],
        idempotencyKey: "idem-receipt-2",
        collectedAt: "2026-11-24T10:00:00.000Z",
      });
      expect(retrySettled.collections).toHaveLength(2);
      expect(collections).toHaveLength(3);

      // Durable replay conflict: Retry cùng key nhưng khác nội dung -> ném ConflictException
      await expect(
        service.collectReceivable(actorUserId, activeRoleId, hotelId, "rec-ota-1", {
          collectedAmount: 500000, // Khác 1,600,000
          idempotencyKey: "idem-receipt-2",
        }),
      ).rejects.toThrow("CONCURRENT_SUBMISSION_CONFLICT");
    });
  });

  describe("3. Verification Case 3: Sổ thu chi thực tế hàng ngày, 2 tài khoản đích riêng biệt, chi phí chưa trả = 0 tiền mặt, tài khoản legacy", () => {
    it("tính toán đúng thực thu, thực chi, phân biệt 2 tài khoản ngân hàng, bỏ qua chi phí chưa trả và giữ rõ tài khoản legacy", async () => {
      const mockPayments = [
        {
          id: "p-cash-1",
          hotelId,
          stayId: "stay-1",
          invoiceId: "inv-1",
          folioId: "folio-1",
          paymentNumber: "PAY-001",
          status: PaymentStatus.SUCCEEDED,
          provider: "MANUAL",
          method: PaymentMethod.CASH,
          paidAmount: new Prisma.Decimal(500000),
          refundedAmount: new Prisma.Decimal(0),
          currency: "VND",
          confirmedAt: new Date("2026-11-25T10:00:00+07:00"),
          metadataJson: { source: "front_desk", destinationAccount: "Két tiền mặt lễ tân" },
          invoice: { invoiceNumber: "INV-001" },
          stay: { guestDisplayName: "Khách A", reservationCode: "BK-01", room: { roomNumber: "101" } },
          transactions: [],
        },
        {
          id: "p-transfer-legacy",
          hotelId,
          stayId: "stay-2",
          invoiceId: "inv-2",
          folioId: "folio-2",
          paymentNumber: "PAY-002",
          status: PaymentStatus.SUCCEEDED,
          provider: "MANUAL",
          method: PaymentMethod.BANK_TRANSFER,
          paidAmount: new Prisma.Decimal(800000),
          refundedAmount: new Prisma.Decimal(0),
          currency: "VND",
          confirmedAt: new Date("2026-11-25T11:00:00+07:00"),
          metadataJson: { source: "front_desk" }, // Không có destinationAccount
          invoice: { invoiceNumber: "INV-002" },
          stay: { guestDisplayName: "Khách B", reservationCode: "BK-02", room: { roomNumber: "102" } },
          transactions: [],
        },
      ];

      const mockCollections = [
        {
          id: "col-vcb-1",
          hotelId,
          receivableId: "rec-1",
          collectedAmount: new Prisma.Decimal(1200000),
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          destinationAccount: "Vietcombank - 1012345678",
          collectedAt: new Date("2026-11-25T14:00:00+07:00"),
          isVoided: false,
          voidedAt: null,
          reference: "VCB-1200",
          receivable: {
            debtorName: "Booking.com",
            invoiceId: "inv-ota",
            stayId: "stay-ota",
            folioId: "folio-ota",
            invoice: { invoiceNumber: "INV-OTA" },
            folio: { currency: "VND" },
            stay: { reservationCode: "BK-OTA-77", room: { roomNumber: "301" } },
          },
        },
      ];

      const mockExpenseLegs = [
        {
          id: "exp-paid-tcb",
          amount: new Prisma.Decimal(400000),
          paymentMethod: "BANK_TRANSFER",
          paymentAccount: "Techcombank - 1902837465",
          paidAt: new Date("2026-11-25T15:00:00+07:00"),
          expense: {
            title: "Mua hóa phẩm buồng phòng",
            vendorName: "Công ty Hóa Chất Minh Quân",
            documentNumber: "PC-01",
            roomNumberSnapshot: null,
            room: null,
          },
        },
      ];

      const mockManualCollections = [
        {
          id: "man-minibar-1",
          receivedAt: new Date("2026-11-25T01:00:00+07:00"), // 01:00 VN = ngày 24/11 UTC, nhưng phải thuộc ngày 25/11 VN!
          amount: new Prisma.Decimal(150000),
          method: "CASH",
          reference: "MB-01",
          entry: {
            description: "Bán minibar ngoài hóa đơn",
            documentNumber: "MB-01",
            roomNumberSnapshot: "105",
            room: { roomNumber: "105" },
          },
        },
      ];

      const txMock = {
        payment: { findMany: jest.fn().mockResolvedValue(mockPayments) },
        bookingPayment: { findMany: jest.fn().mockResolvedValue([]) },
        receivableCollection: { findMany: jest.fn().mockResolvedValue(mockCollections) },
        hotelRevenueCollection: { findMany: jest.fn().mockResolvedValue(mockManualCollections) },
        hotelExpensePayment: { findMany: jest.fn().mockResolvedValue(mockExpenseLegs) },
        $queryRaw: jest.fn().mockResolvedValue([{ amount: new Prisma.Decimal(0), count: BigInt(0), invalid: BigInt(0) }]),
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);
      const result = await service.getCashMovements(actorUserId, activeRoleId, hotelId, {
        from: "2026-11-25",
        to: "2026-11-25",
      });

      // 1. Thực thu: 500k + 800k + 1,200k + 150k (minibar 01:00 giờ VN) = 2,650,000 VND
      expect(result.summary.totalCashIn).toBe(2650000);
      expect(result.summary.totalCashOut).toBe(400000);
      expect(result.summary.netCashFlow).toBe(2250000);

      // 4. Phân bổ theo tài khoản: VCB, TCB, Két tiền mặt, và chưa xác định
      const accounts = result.summary.byAccount;
      expect(accounts.find((a) => a.accountName === "Vietcombank - 1012345678")?.cashIn).toBe(1200000);
      expect(accounts.find((a) => a.accountName === "Techcombank - 1902837465")?.cashOut).toBe(400000);
      expect(accounts.find((a) => a.accountName === "Két tiền mặt lễ tân")?.cashIn).toBe(500000);

      const legacy = accounts.find((a) => a.isLegacy);
      expect(legacy).toBeDefined();
      expect(legacy?.accountName).toBe("Chưa xác định tài khoản");
      expect(legacy?.cashIn).toBe(950000); // 800k transfer + 150k minibar chưa có tài khoản

      expect(result.items).toHaveLength(5);
    });

    it("R3: báo lỗi đối soát rõ ràng (503) khi nguồn dữ liệu cọc lỗi thay vì trả về 0 dòng thành công", async () => {
      const txMock = {
        payment: { findMany: jest.fn().mockResolvedValue([]) },
        bookingPayment: { findMany: jest.fn().mockRejectedValue(new Error("DB connection error on BookingPayment")) },
        receivableCollection: { findMany: jest.fn().mockResolvedValue([]) },
        hotelRevenueCollection: { findMany: jest.fn().mockResolvedValue([]) },
        hotelExpensePayment: { findMany: jest.fn().mockResolvedValue([]) },
        $queryRaw: jest.fn().mockResolvedValue([{ amount: new Prisma.Decimal(0), count: BigInt(0), invalid: BigInt(0) }]),
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);
      await expect(
        service.getCashMovements(actorUserId, activeRoleId, hotelId, {
          from: "2026-11-25",
          to: "2026-11-25",
        }),
      ).rejects.toThrow("Không đủ dữ liệu để đối soát sổ thu chi");
    });

    it("loại trừ phân bổ cọc tổng hợp tại checkout, tách biệt thẻ CARD và ghi nhận từng đợt thanh toán chi phí qua HotelExpensePayment", async () => {
      const mockPayments = [
        {
          id: "p-card-1",
          hotelId,
          stayId: "stay-card",
          invoiceId: "inv-card",
          folioId: "folio-card",
          paymentNumber: "PAY-CARD-1",
          status: PaymentStatus.SUCCEEDED,
          provider: "MANUAL",
          method: "CARD",
          paidAmount: new Prisma.Decimal(700000),
          refundedAmount: new Prisma.Decimal(0),
          currency: "VND",
          confirmedAt: new Date("2026-11-25T16:00:00+07:00"),
          metadataJson: { source: "front_desk", destinationAccount: "Vietcombank - POS" },
          invoice: { invoiceNumber: "INV-CARD" },
          stay: { guestDisplayName: "Khách Quẹt Thẻ", reservationCode: "BK-C", room: { roomNumber: "401" } },
          transactions: [],
        },
        {
          id: "p-synthetic-deposit",
          hotelId,
          stayId: "stay-syn",
          invoiceId: "inv-syn",
          folioId: "folio-syn",
          paymentNumber: "PAY-SYN-1",
          status: PaymentStatus.SUCCEEDED,
          provider: "MANUAL",
          method: "MANUAL",
          paidAmount: new Prisma.Decimal(1000000),
          refundedAmount: new Prisma.Decimal(0),
          currency: "VND",
          confirmedAt: new Date("2026-11-25T12:00:00+07:00"),
          metadataJson: {
            source: "booking_deposit",
            bookingPaymentId: "bp-dep-1",
            bookingPaymentAllocationId: "bpa-alloc-1",
          }, // Phân bổ cọc tổng hợp tại checkout -> BẮT BUỘC BỊ LOẠI TRỪ khỏi cash book!
          invoice: { invoiceNumber: "INV-SYNTH" },
          stay: { guestDisplayName: "Khách Cọc Trừ Dần", reservationCode: "BK-S", room: { roomNumber: "402" } },
          transactions: [],
        },
      ];

      const mockDeposits = [
        {
          id: "bp-real-deposit",
          status: "COMPLETED",
          receivedAmount: new Prisma.Decimal(1000000),
          receivedAt: new Date("2026-11-25T08:00:00+07:00"),
          paymentMethod: "BANK_TRANSFER",
          transactionReference: "DEP-REAL-01",
          reservation: { reservationCode: "BK-DEP-88", guestDisplayName: "Khách Cọc Thực Tế", room: { roomNumber: "402" } },
          group: null,
        },
      ];

      const mockExpensePaymentLegs = [
        {
          id: "leg-exp-1",
          amount: new Prisma.Decimal(600000),
          paymentMethod: "BANK_TRANSFER",
          paymentAccount: "Techcombank - 1902837465",
          paidAt: new Date("2026-11-25T17:00:00+07:00"),
          expense: {
            title: "Sơn sửa hành lang đợt 1",
            vendorName: "Nhà Thầu An Phát",
            documentNumber: "PC-AP-01",
            roomNumberSnapshot: null,
            room: null,
          },
        },
      ];

      const txMock = {
        payment: { findMany: jest.fn().mockResolvedValue(mockPayments) },
        bookingPayment: { findMany: jest.fn().mockResolvedValue(mockDeposits) },
        receivableCollection: { findMany: jest.fn().mockResolvedValue([]) },
        hotelRevenueCollection: { findMany: jest.fn().mockResolvedValue([]) },
        hotelExpensePayment: { findMany: jest.fn().mockResolvedValue(mockExpensePaymentLegs) },
        $queryRaw: jest.fn().mockResolvedValue([{ amount: new Prisma.Decimal(0), count: BigInt(0), invalid: BigInt(0) }]),
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);
      const result = await service.getCashMovements(actorUserId, activeRoleId, hotelId, {
        from: "2026-11-25",
        to: "2026-11-25",
      });

      // 1. Phân bổ cọc synthetic bị loại trừ, tiền cọc thật được nhận:
      const syntheticItem = result.items.find((i) => i.id === "pay-p-synthetic-deposit");
      expect(syntheticItem).toBeUndefined(); // Loại trừ hoàn toàn!

      const realDepositItem = result.items.find((i) => i.id === "dep-bp-real-deposit");
      expect(realDepositItem).toBeDefined();
      expect(realDepositItem?.sourceType).toBe("BOOKING_DEPOSIT");
      expect(realDepositItem?.amount).toBe(1000000);

      // 2. Thẻ quẹt CARD được phân biệt rõ ràng:
      const cardItem = result.items.find((i) => i.id === "pay-p-card-1");
      expect(cardItem).toBeDefined();
      expect(cardItem?.paymentMethod).toBe("CARD");

      // 3. Đợt thanh toán chi phí giao dịch độc lập:
      const legItem = result.items.find((i) => i.id === "exp-leg-leg-exp-1");
      expect(legItem).toBeDefined();
      expect(legItem?.amount).toBe(600000);
      expect(legItem?.destinationAccount).toBe("Techcombank - 1902837465");
    });

    it("R3 & R4: đối chiếu trọn bộ D0–D3 (tài khoản A thu 2tr, tài khoản B chi 600k, tiền mặt minibar 150k, dòng tiền ròng 1tr550) và cô lập phạm vi phòng", async () => {
      const txMock = {
        payment: { findMany: jest.fn().mockResolvedValue([]) },
        bookingPayment: { findMany: jest.fn().mockResolvedValue([]) },
        receivableCollection: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "agoda-d2",
              collectedAt: new Date("2026-11-22T10:00:00+07:00"),
              collectedAmount: new Prisma.Decimal(1200000),
              voidedAt: null,
              isVoided: false,
              paymentMethod: "BANK_TRANSFER",
              reference: "AGODA-1",
              destinationAccount: "Tài khoản A",
              receivable: {
                debtorName: "Agoda",
                invoiceId: "inv-1",
                stayId: "stay-1",
                folioId: "folio-1",
                invoice: { invoiceNumber: "INV-1" },
                folio: { currency: "VND" },
                stay: { guestDisplayName: "Khách Agoda", reservationCode: "AG-1", room: { roomNumber: "101" } },
              },
            },
            {
              id: "agoda-d3",
              collectedAt: new Date("2026-11-23T15:00:00+07:00"),
              collectedAmount: new Prisma.Decimal(800000),
              voidedAt: null,
              isVoided: false,
              paymentMethod: "BANK_TRANSFER",
              reference: "AGODA-2",
              destinationAccount: "Tài khoản A",
              receivable: {
                debtorName: "Agoda",
                invoiceId: "inv-1",
                stayId: "stay-1",
                folioId: "folio-1",
                invoice: { invoiceNumber: "INV-1" },
                folio: { currency: "VND" },
                stay: { guestDisplayName: "Khách Agoda", reservationCode: "AG-1", room: { roomNumber: "101" } },
              },
            },
          ]),
        },
        hotelRevenueCollection: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "minibar-d1",
              receivedAt: new Date("2026-11-21T16:00:00+07:00"),
              amount: new Prisma.Decimal(150000),
              method: "CASH",
              reference: "MB-D1",
              entry: { description: "Minibar", documentNumber: "MB-D1", roomNumberSnapshot: "102", room: { roomNumber: "102" } },
            },
          ]),
        },
        hotelExpensePayment: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "elec-d2",
              amount: new Prisma.Decimal(250000),
              paidAt: new Date("2026-11-22T14:00:00+07:00"),
              paymentMethod: "BANK_TRANSFER",
              paymentAccount: "Tài khoản B",
              expense: { title: "Tiền điện đợt 1", vendorName: "EVN", documentNumber: "EVN-1", roomNumberSnapshot: null, room: null },
            },
            {
              id: "elec-d3",
              amount: new Prisma.Decimal(350000),
              paidAt: new Date("2026-11-23T14:00:00+07:00"),
              paymentMethod: "BANK_TRANSFER",
              paymentAccount: "Tài khoản B",
              expense: { title: "Tiền điện đợt 2", vendorName: "EVN", documentNumber: "EVN-2", roomNumberSnapshot: null, room: null },
            },
          ]),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ amount: new Prisma.Decimal(0), count: BigInt(0), invalid: BigInt(0) }]),
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);
      const d1d3 = await service.getCashMovements(actorUserId, activeRoleId, hotelId, {
        from: "2026-11-21",
        to: "2026-11-23",
      });
      expect(d1d3.summary.totalCashIn).toBe(2150000);
      expect(d1d3.summary.totalCashOut).toBe(600000);
      expect(d1d3.summary.netCashFlow).toBe(1550000);
      expect(d1d3.summary.byAccount.find((a) => a.accountName === "Tài khoản A")?.cashIn).toBe(2000000);
      expect(d1d3.summary.byAccount.find((a) => a.accountName === "Tài khoản B")?.cashOut).toBe(600000);
      expect(d1d3.summary.byMethod.CASH?.cashIn).toBe(150000);

      // R4: empty allowedRoomIds returns 0 without querying DB
      const emptyScopeService = new BillingService(
        {} as never,
        {
          resolveRoomScope: jest.fn().mockResolvedValue({
            hotel: { id: hotelId, tenantId: "t", timezone: "Asia/Ho_Chi_Minh" },
            allowedRoomId: null,
            allowedRoomIds: [],
          }),
        } as never,
        prismaMock as never,
        { generateEntityCode: jest.fn() } as never,
        { log: jest.fn(), warn: jest.fn() } as never,
      );
      const scopedEmpty = await emptyScopeService.getCashMovements(actorUserId, activeRoleId, hotelId, {
        from: "2026-11-21",
        to: "2026-11-23",
      });
      expect(scopedEmpty.items).toHaveLength(0);
      expect(scopedEmpty.summary.totalCashIn).toBe(0);
    });
  });

  describe("4. Debtor Partner Validation & Room Access Enforcement", () => {
    it("từ chối transferStayToReceivable nếu debtorPartnerId không thuộc khách sạn", async () => {
      const stay = {
        id: "stay-test",
        hotelId,
        guestDisplayName: "Khách Test",
        status: GuestStayStatus.ACTIVE,
        roomId: "room-1",
        reservationId: "res-1",
        checkedOutAt: null,
      };

      const folio = {
        id: "folio-test",
        hotelId,
        status: FolioStatus.OPEN,
        totalAmount: new Prisma.Decimal(500000),
      };

      const txMock = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: "stay-test" }]),
        guestStay: { findFirst: jest.fn().mockResolvedValue(stay) },
        folio: { findFirst: jest.fn().mockResolvedValue(folio) },
        invoice: { findFirst: jest.fn().mockResolvedValue(null) },
        bookingPayment: { findMany: jest.fn().mockResolvedValue([]) },
        payment: { findMany: jest.fn().mockResolvedValue([]) },
        folioItem: { findMany: jest.fn().mockResolvedValue([{ amount: new Prisma.Decimal(500000) }]) },
        bookingSourcePartner: { findFirst: jest.fn().mockResolvedValue(null) }, // Partner KHÔNG tồn tại trong hotel!
      };

      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      await expect(
        service.transferStayToReceivable(actorUserId, activeRoleId, hotelId, "stay-test", {
          debtorPartnerId: "partner-foreign-hotel", // Partner lạ
        }),
      ).rejects.toThrow("INVALID_DEBTOR_PARTNER");
    });

    it("chặn thu nợ collectReceivable nếu nhân viên bị giới hạn ROOM_EXCLUSIVE ngoài phòng được phân công", async () => {
      const accessMock = {
        assertHotelAccess: jest.fn().mockResolvedValue(undefined),
        resolveRoomScope: jest.fn().mockResolvedValue({
          mode: "ROOM_EXCLUSIVE",
          allowedRoomId: "room-101",
          allowedRoomIds: ["room-101"],
          hotel: { id: hotelId },
        }),
        assertRoomAccess: jest.fn().mockImplementation((scope, roomId) => {
          if (roomId !== scope.allowedRoomId) {
            throw new Error("FORBIDDEN_ROOM_ACCESS");
          }
        }),
      };

      const txMock = {
        $queryRaw: jest.fn().mockResolvedValue([{
          id: "rec-other-room",
          status: ReceivableStatus.OPEN,
          outstandingAmount: new Prisma.Decimal(500000),
          paidAmount: new Prisma.Decimal(0),
        }]),
        hotelReceivable: {
          findFirst: jest.fn().mockResolvedValue({
            id: "rec-other-room",
            hotelId,
            stayId: "stay-other",
            status: ReceivableStatus.OPEN,
            outstandingAmount: new Prisma.Decimal(500000),
            stay: { roomId: "room-999" }, // Phòng 999 khác phòng 101!
          }),
        },
      };

      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = new BillingService(
        {} as never,
        accessMock as never,
        prismaMock as never,
        { generateEntityCode: jest.fn().mockResolvedValue("PAY-001") } as never,
        { log: jest.fn(), warn: jest.fn() } as never,
      );

      await expect(
        service.collectReceivable(actorUserId, activeRoleId, hotelId, "rec-other-room", {
          collectedAmount: 500000,
        }),
      ).rejects.toThrow("FORBIDDEN_ROOM_ACCESS");
    });
  });

  describe("5. PaymentController HTTP Delegation", () => {
    it("uỷ quyền chính xác getCashMovements từ HTTP controller sang service", async () => {
      const mockResult = { summary: { totalCashIn: 0, totalCashOut: 0, netCashFlow: 0 } };
      const billingServiceMock = {
        getCashMovements: jest.fn().mockResolvedValue(mockResult),
      };

      const controller = new PaymentController(billingServiceMock as never);
      const req = { user: { userId: actorUserId, roleId: activeRoleId } } as never;

      const res = await controller.getCashMovements(req, hotelId, { from: "2026-11-01", to: "2026-11-30" });
      expect(billingServiceMock.getCashMovements).toHaveBeenCalledWith(
        actorUserId,
        activeRoleId,
        hotelId,
        expect.objectContaining({ from: "2026-11-01", to: "2026-11-30" }),
      );
      expect(res).toBe(mockResult);
    });
  });
});
