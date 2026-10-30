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
  BookingPaymentIntent,
  BookingPaymentMode,
  BookingPaymentStatus,
  FolioStatus,
  GuestStayStatus,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  ReceivableDebtorType,
  ReceivableStatus,
  RoomStatus,
} from "@prisma/client";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { BillingService } from "../application/billing.service";
import { PaymentController } from "../api/payment.controller";

function createBillingService(
  prisma: Record<string, unknown>,
  repository: Record<string, unknown> = {},
) {
  return new BillingService(
    repository as never,
    { assertHotelAccess: jest.fn().mockResolvedValue(undefined) } as never,
    prisma as never,
    { generateEntityCode: jest.fn().mockResolvedValue("CODE-001") } as never,
    { log: jest.fn(), warn: jest.fn() } as never,
  );
}

describe("Billing Receivables & Deposits Suite", () => {
  const hotelId = "hotel-pms-1";
  const actorUserId = "staff-user-1";
  const activeRoleId = "role-frontdesk";

  describe("1. Ghi nhận tiền cọc/thanh toán trước check-in (BookingPayment)", () => {
    it("ghi nhận tiền cọc thành công và lưu đúng thông tin", async () => {
      const mockCreate = jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: "bp-1",
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const txMock = {
        bookingPayment: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: mockCreate,
        },
        reservation: {
          findFirst: jest.fn().mockResolvedValue({ id: "res-1", hotelId }),
        },
      };

      const service = createBillingService(prismaMock);

      const result = await service.recordBookingPayment(actorUserId, activeRoleId, hotelId, {
        reservationId: "res-1",
        intent: BookingPaymentIntent.DEPOSIT,
        receivedAmount: 500000,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        notes: "Khách cọc chuyển khoản 500k giữ phòng",
        idempotencyKey: "idem-deposit-001",
      });

      expect(txMock.reservation.findFirst).toHaveBeenCalledWith({
        where: { id: "res-1", hotelId },
      });
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hotelId,
            reservationId: "res-1",
            intent: BookingPaymentIntent.DEPOSIT,
            inputMode: BookingPaymentMode.AMOUNT,
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            status: BookingPaymentStatus.COMPLETED,
            notes: "Khách cọc chuyển khoản 500k giữ phòng",
            idempotencyKey: "idem-deposit-001",
            createdByUserId: actorUserId,
          }),
        }),
      );
      expect(result.id).toBe("bp-1");
    });

    it("bảo toàn tính lũy đẳng idempotencyKey khi retry cùng payload", async () => {
      const existingPayment = {
        id: "bp-existing-1",
        hotelId,
        reservationId: "res-1",
        groupId: null,
        intent: BookingPaymentIntent.DEPOSIT,
        receivedAmount: new Prisma.Decimal(500000),
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        status: BookingPaymentStatus.COMPLETED,
        idempotencyKey: "idem-deposit-001",
      };

      const mockCreate = jest.fn();
      const txMock = {
        bookingPayment: {
          findFirst: jest.fn().mockResolvedValue(existingPayment),
          create: mockCreate,
        },
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      const result = await service.recordBookingPayment(actorUserId, activeRoleId, hotelId, {
        reservationId: "res-1",
        intent: BookingPaymentIntent.DEPOSIT,
        receivedAmount: 500000,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        idempotencyKey: "idem-deposit-001",
      });

      expect(txMock.bookingPayment.findFirst).toHaveBeenCalledWith({
        where: { hotelId, idempotencyKey: "idem-deposit-001" },
      });
      expect(mockCreate).not.toHaveBeenCalled();
      expect(result).toBe(existingPayment);
    });

    it("từ chối khi gửi lại cùng idempotencyKey nhưng khác số tiền hoặc thông tin", async () => {
      const existingPayment = {
        id: "bp-existing-1",
        hotelId,
        reservationId: "res-1",
        groupId: null,
        intent: BookingPaymentIntent.DEPOSIT,
        receivedAmount: new Prisma.Decimal(500000),
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        status: BookingPaymentStatus.COMPLETED,
        idempotencyKey: "idem-deposit-001",
      };

      const txMock = {
        bookingPayment: {
          findFirst: jest.fn().mockResolvedValue(existingPayment),
        },
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      await expect(
        service.recordBookingPayment(actorUserId, activeRoleId, hotelId, {
          reservationId: "res-1",
          intent: BookingPaymentIntent.DEPOSIT,
          receivedAmount: 800000, // Khác số tiền
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          idempotencyKey: "idem-deposit-001",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("báo lỗi NotFoundException nếu reservationId không tồn tại", async () => {
      const txMock = {
        bookingPayment: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        reservation: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      await expect(
        service.recordBookingPayment(actorUserId, activeRoleId, hotelId, {
          reservationId: "res-not-found",
          intent: BookingPaymentIntent.DEPOSIT,
          receivedAmount: 500000,
          paymentMethod: PaymentMethod.CASH,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("2. Chuyển số dư sang công nợ khi trả phòng (Transfer to Receivable)", () => {
    it("đóng Folio và chuyển GuestStay sang CHECKED_OUT, tạo HotelReceivable an toàn mà không sinh doanh thu tiền mặt giả", async () => {
      const stayId = "stay-pms-101";
      const roomId = "room-pms-101";
      const folioId = "folio-pms-101";
      const invoiceId = "inv-pms-101";

      const stayRecord = {
        id: stayId,
        hotelId,
        roomId,
        guestDisplayName: "Doan Doanh Nghiep ABC",
        status: GuestStayStatus.ACTIVE,
      };

      const folioRecord = {
        id: folioId,
        hotelId,
        stayId,
        status: FolioStatus.OPEN,
        totalAmount: new Prisma.Decimal(3500000),
      };

      const invoiceRecord = {
        id: invoiceId,
        hotelId,
        folioId,
        totalAmount: new Prisma.Decimal(3500000),
        paidAmount: new Prisma.Decimal(1000000), // Đã cọc trước 1tr
        balanceAmount: new Prisma.Decimal(2500000), // Nợ lại 2.5tr
        status: InvoiceStatus.ISSUED,
      };

      const mockCreateReceivable = jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: "rec-1",
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const mockUpdateFolio = jest
        .fn()
        .mockResolvedValue({ id: folioId, status: FolioStatus.CLOSED });
      const mockUpdateStay = jest
        .fn()
        .mockResolvedValue({ id: stayId, status: GuestStayStatus.CHECKED_OUT });
      const mockUpdateSessions = jest.fn().mockResolvedValue({ count: 1 });
      const mockUpdateRoom = jest.fn().mockResolvedValue({ count: 1 });
      const mockPaymentCreate = jest.fn();
      const mockInvoiceUpdate = jest.fn();

      const txMock = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: stayId }]),
        bookingPayment: { findMany: jest.fn().mockResolvedValue([]) },
        user: { findFirst: jest.fn().mockResolvedValue({ id: "accountant-1" }) },
        guestStay: {
          findFirst: jest.fn().mockResolvedValue(stayRecord),
          update: mockUpdateStay,
        },
        folio: {
          findFirst: jest.fn().mockResolvedValue(folioRecord),
          update: mockUpdateFolio,
        },
        invoice: {
          findFirst: jest.fn().mockResolvedValue(invoiceRecord),
          update: mockInvoiceUpdate,
        },
        hotelReceivable: {
          create: mockCreateReceivable,
        },
        guestSession: {
          updateMany: mockUpdateSessions,
        },
        room: {
          updateMany: mockUpdateRoom,
        },
        payment: {
          create: mockPaymentCreate,
        },
      };

      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      const dueDate = new Date("2026-11-15T00:00:00.000Z");
      const result = await service.transferStayToReceivable(
        actorUserId,
        activeRoleId,
        hotelId,
        stayId,
        {
          debtorName: "Cong ty ABC",
          debtorType: ReceivableDebtorType.COMPANY,
          dueDate,
          assigneeUserId: "accountant-1",
          notes: "Chờ kế toán công ty ABC thanh toán công nợ theo hợp đồng",
        },
      );

      // 1. Tạo đúng bản ghi HotelReceivable với số tiền còn nợ 2.5tr
      expect(mockCreateReceivable).toHaveBeenCalledTimes(1);
      expect(mockCreateReceivable).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hotelId,
            stayId,
            folioId,
            invoiceId,
            debtorName: "Cong ty ABC",
            debtorType: ReceivableDebtorType.COMPANY,
            originalAmount: new Prisma.Decimal(2500000),
            outstandingAmount: new Prisma.Decimal(2500000),
            dueDate,
            assigneeUserId: "accountant-1",
            status: ReceivableStatus.OPEN,
            transferredByUserId: actorUserId,
          }),
        }),
      );

      // 2. Đóng folio và chuyển GuestStay sang CHECKED_OUT
      expect(mockUpdateFolio).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: folioId },
          data: expect.objectContaining({ status: FolioStatus.CLOSED }),
        }),
      );
      expect(mockUpdateStay).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: stayId },
          data: expect.objectContaining({ status: GuestStayStatus.CHECKED_OUT }),
        }),
      );

      // 3. Phòng chuyển sang PROCESSING để buồng phòng dọn dẹp
      expect(mockUpdateRoom).toHaveBeenCalledWith({
        where: { id: roomId, hotelId, status: RoomStatus.OCCUPIED },
        data: { status: RoomStatus.PROCESSING },
      });

      // 4. BẤT BIẾN AN TOÀN TUYỆT ĐỐI:
      // Không ghi nhận Payment tiền mặt đã thu (không tăng collected cash revenue)
      expect(mockPaymentCreate).not.toHaveBeenCalled();
      // Không update Invoice thành PAID giả mạo
      expect(mockInvoiceUpdate).not.toHaveBeenCalled();

      expect(result.success).toBe(true);
      expect(result.debtorName).toBe("Cong ty ABC");
      expect(result.outstandingAmount).toEqual(new Prisma.Decimal(2500000));
    });

    it("từ chối chuyển công nợ nếu lượt lưu trú đã CHECKED_OUT trước đó", async () => {
      const stayId = "stay-already-out";
      const txMock = {
        guestStay: {
          findFirst: jest.fn().mockResolvedValue({
            id: stayId,
            hotelId,
            status: GuestStayStatus.CHECKED_OUT,
          }),
        },
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      await expect(
        service.transferStayToReceivable(actorUserId, activeRoleId, hotelId, stayId, {
          debtorName: "Khách lẻ",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("từ chối chuyển công nợ nếu số dư nợ bằng 0 hoặc không có nợ", async () => {
      const stayId = "stay-zero-balance";
      const txMock = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: stayId }]),
        guestStay: {
          findFirst: jest.fn().mockResolvedValue({
            id: stayId,
            hotelId,
            status: GuestStayStatus.ACTIVE,
          }),
        },
        folio: {
          findFirst: jest.fn().mockResolvedValue({
            id: "folio-zero",
            hotelId,
            stayId,
            status: FolioStatus.OPEN,
            totalAmount: new Prisma.Decimal(1000000),
          }),
        },
        invoice: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-zero",
            hotelId,
            totalAmount: new Prisma.Decimal(1000000),
            paidAmount: new Prisma.Decimal(1000000),
            balanceAmount: new Prisma.Decimal(0), // Đã thanh toán đủ
          }),
        },
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      await expect(
        service.transferStayToReceivable(actorUserId, activeRoleId, hotelId, stayId, {
          debtorName: "Khách lẻ",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("3. Thu hồi công nợ (Collect Receivable)", () => {
    it("thu nợ từng phần và trừ dần outstandingAmount, cập nhật trạng thái PARTIALLY_COLLECTED", async () => {
      const receivableId = "rec-collect-1";
      const existingReceivable = {
        id: receivableId,
        hotelId,
        debtorName: "Cong ty ABC",
        originalAmount: new Prisma.Decimal(2500000),
        outstandingAmount: new Prisma.Decimal(2500000),
        status: ReceivableStatus.OPEN,
      };

      const mockCreateCollection = jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: "col-1",
          ...data,
          createdAt: new Date(),
        }),
      );

      const mockUpdateReceivable = jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...existingReceivable,
          ...data,
        }),
      );

      const txMock = {
        hotelReceivable: {
          findFirst: jest.fn().mockResolvedValue(existingReceivable),
          update: mockUpdateReceivable,
        },
        receivableCollection: {
          create: mockCreateCollection,
        },
      };

      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      const result = await service.collectReceivable(
        actorUserId,
        activeRoleId,
        hotelId,
        receivableId,
        {
          collectedAmount: 1000000,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          reference: "UNC-2026-001",
          notes: "Thu đợt 1 chuyển khoản 1 triệu",
        },
      );

      // Tạo bản ghi ReceivableCollection
      expect(mockCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hotelId,
            receivableId,
            collectedAmount: new Prisma.Decimal(1000000),
            paymentMethod: PaymentMethod.BANK_TRANSFER,
            reference: "UNC-2026-001",
            notes: "Thu đợt 1 chuyển khoản 1 triệu",
            collectedByUserId: actorUserId,
          }),
        }),
      );

      // Cập nhật HotelReceivable còn nợ 1.5 triệu và status = PARTIALLY_COLLECTED
      expect(mockUpdateReceivable).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: receivableId },
          data: expect.objectContaining({
            outstandingAmount: new Prisma.Decimal(1500000),
            status: ReceivableStatus.PARTIALLY_COLLECTED,
          }),
        }),
      );

      expect(result.receivable.status).toBe(ReceivableStatus.PARTIALLY_COLLECTED);
      expect(result.receivable.outstandingAmount).toEqual(new Prisma.Decimal(1500000));
    });

    it("thu hết nợ và chuyển trạng thái sang SETTLED khi outstandingAmount == 0", async () => {
      const receivableId = "rec-collect-2";
      const existingReceivable = {
        id: receivableId,
        hotelId,
        debtorName: "Cong ty ABC",
        originalAmount: new Prisma.Decimal(2500000),
        outstandingAmount: new Prisma.Decimal(1500000), // Còn nợ 1.5tr
        status: ReceivableStatus.PARTIALLY_COLLECTED,
      };

      const mockCreateCollection = jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: "col-2",
          ...data,
          createdAt: new Date(),
        }),
      );

      const mockUpdateReceivable = jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...existingReceivable,
          ...data,
        }),
      );

      const txMock = {
        hotelReceivable: {
          findFirst: jest.fn().mockResolvedValue(existingReceivable),
          update: mockUpdateReceivable,
        },
        receivableCollection: {
          create: mockCreateCollection,
        },
      };

      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      const result = await service.collectReceivable(
        actorUserId,
        activeRoleId,
        hotelId,
        receivableId,
        {
          collectedAmount: 1500000, // Thu nốt 1.5tr
          paymentMethod: PaymentMethod.CASH,
          notes: "Thu tiền mặt đợt cuối, thanh toán toàn bộ công nợ",
        },
      );

      // Tạo bản ghi ReceivableCollection
      expect(mockCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hotelId,
            receivableId,
            collectedAmount: new Prisma.Decimal(1500000),
            paymentMethod: PaymentMethod.CASH,
          }),
        }),
      );

      // Cập nhật HotelReceivable còn nợ 0 và status = SETTLED
      expect(mockUpdateReceivable).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: receivableId },
          data: expect.objectContaining({
            outstandingAmount: new Prisma.Decimal(0),
            status: ReceivableStatus.SETTLED,
          }),
        }),
      );

      expect(result.receivable.status).toBe(ReceivableStatus.SETTLED);
      expect(result.receivable.outstandingAmount).toEqual(new Prisma.Decimal(0));
    });

    it("từ chối khi số tiền thu vượt quá số dư nợ còn lại", async () => {
      const receivableId = "rec-collect-over";
      const existingReceivable = {
        id: receivableId,
        hotelId,
        debtorName: "Khách lẻ",
        originalAmount: new Prisma.Decimal(1000000),
        outstandingAmount: new Prisma.Decimal(500000),
        status: ReceivableStatus.PARTIALLY_COLLECTED,
      };

      const txMock = {
        hotelReceivable: {
          findFirst: jest.fn().mockResolvedValue(existingReceivable),
        },
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      await expect(
        service.collectReceivable(actorUserId, activeRoleId, hotelId, receivableId, {
          collectedAmount: 600000, // Vượt quá 500k còn nợ
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("từ chối thu nợ khi công nợ đã SETTLED", async () => {
      const receivableId = "rec-already-settled";
      const existingReceivable = {
        id: receivableId,
        hotelId,
        debtorName: "Cong ty ABC",
        originalAmount: new Prisma.Decimal(2500000),
        outstandingAmount: new Prisma.Decimal(0),
        status: ReceivableStatus.SETTLED,
      };

      const txMock = {
        hotelReceivable: {
          findFirst: jest.fn().mockResolvedValue(existingReceivable),
        },
      };
      const prismaMock = {
        $transaction: jest.fn().mockImplementation((cb) => cb(txMock)),
      };

      const service = createBillingService(prismaMock);

      await expect(
        service.collectReceivable(actorUserId, activeRoleId, hotelId, receivableId, {
          collectedAmount: 100000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("4. PaymentController endpoints delegation", () => {
    it("uỷ quyền chính xác recordBookingPayment từ HTTP controller sang service", async () => {
      const mockService = {
        recordBookingPayment: jest.fn().mockResolvedValue({ id: "bp-controller-1" }),
      };
      const controller = new PaymentController(mockService as any);

      const reqMock: any = {
        user: { userId: actorUserId, roleId: activeRoleId },
      };

      const result = await controller.recordBookingPayment(reqMock, hotelId, {
        reservationId: "res-1",
        receivedAmount: 300000,
        intent: "DEPOSIT",
        paymentMethod: "CASH",
        notes: "Cọc tại quầy",
      });

      expect(mockService.recordBookingPayment).toHaveBeenCalledWith(
        actorUserId,
        activeRoleId,
        hotelId,
        expect.objectContaining({
          reservationId: "res-1",
          receivedAmount: 300000,
          intent: "DEPOSIT",
          paymentMethod: "CASH",
        }),
      );
      expect(result).toEqual({ id: "bp-controller-1" });
    });

    it("uỷ quyền chính xác transferToReceivable từ HTTP controller sang service", async () => {
      const mockService = {
        transferStayToReceivable: jest.fn().mockResolvedValue({ success: true }),
      };
      const controller = new PaymentController(mockService as any);

      const reqMock: any = {
        user: { userId: actorUserId, roleId: activeRoleId },
      };

      const result = await controller.transferToReceivable(reqMock, hotelId, "stay-1", {
        debtorName: "Cong ty X",
        debtorType: "COMPANY",
      });

      expect(mockService.transferStayToReceivable).toHaveBeenCalledWith(
        actorUserId,
        activeRoleId,
        hotelId,
        "stay-1",
        expect.objectContaining({
          debtorName: "Cong ty X",
          debtorType: "COMPANY",
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it("uỷ quyền chính xác collectReceivable từ HTTP controller sang service", async () => {
      const mockService = {
        collectReceivable: jest.fn().mockResolvedValue({ success: true }),
      };
      const controller = new PaymentController(mockService as any);

      const reqMock: any = {
        user: { userId: actorUserId, roleId: activeRoleId },
      };

      const result = await controller.collectReceivable(reqMock, hotelId, "rec-1", {
        collectedAmount: 500000,
        paymentMethod: "CASH",
      });

      expect(mockService.collectReceivable).toHaveBeenCalledWith(
        actorUserId,
        activeRoleId,
        hotelId,
        "rec-1",
        expect.objectContaining({
          collectedAmount: 500000,
          paymentMethod: "CASH",
        }),
      );
      expect(result).toEqual({ success: true });
    });
  });
});
