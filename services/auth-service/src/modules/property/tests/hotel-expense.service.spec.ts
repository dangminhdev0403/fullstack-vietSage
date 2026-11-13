import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { HotelExpenseService } from "../application/hotel-expense.service";

describe("HotelExpenseService", () => {
  let service: HotelExpenseService;
  let mockTx: any;
  let mockPrisma: any;
  let mockAccess: any;

  beforeEach(() => {
    mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "exp-1" }]),
      hotelExpense: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    mockPrisma = {
      $transaction: jest.fn(async (cb: any) => cb(mockTx)),
      hotelExpense: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      platformBillableDay: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      room: {
        findMany: jest.fn().mockResolvedValue([{ id: "room-1", roomNumber: "101" }]),
        findFirst: jest.fn().mockResolvedValue({ id: "room-1", roomNumber: "101" }),
      },
    };

    mockAccess = {
      resolveRoomScope: jest.fn().mockResolvedValue({
        hotel: {
          id: "hotel-1",
          tenantId: "tenant-1",
          name: "VietSage Hotel",
          currency: "VND",
          timeZone: "Asia/Ho_Chi_Minh",
        },
        allowedRoomId: null,
        allowedRoomIds: null,
        mode: "HOTEL_WIDE",
      }),
      assertRoomAccess: jest.fn(),
    };

    service = new HotelExpenseService(mockPrisma, mockAccess);
  });

  it("tổng hợp chính xác chi phí đã trả, chưa trả và phí VietSage SaaS trong kỳ", async () => {
    mockPrisma.hotelExpense.findMany.mockResolvedValue([
      {
        id: "exp-1",
        roomId: null,
        roomNumberSnapshot: null,
        expenseDate: new Date("2026-11-05T00:00:00.000Z"),
        category: "PAYROLL",
        title: "Lương nhân viên ca ngày",
        vendorName: "Nội bộ",
        amount: new Prisma.Decimal(12000000),
        paidAmount: new Prisma.Decimal(12000000),
        paymentStatus: "PAID",
        paymentMethod: "BANK_TRANSFER",
        paidAt: new Date("2026-11-05T10:00:00.000Z"),
        documentNumber: "PC-001",
        notes: null,
        version: 0,
        voidedAt: null,
        voidReason: null,
        createdAt: new Date("2026-11-05T10:00:00.000Z"),
        room: null,
      },
      {
        id: "exp-2",
        roomId: "room-1",
        roomNumberSnapshot: "101",
        expenseDate: new Date("2026-11-08T00:00:00.000Z"),
        category: "MAINTENANCE",
        title: "Thay điều hòa phòng 101",
        vendorName: "Điện lạnh Minh Tâm",
        amount: new Prisma.Decimal(4000000),
        paidAmount: new Prisma.Decimal(1500000),
        paymentStatus: "PARTIAL",
        paymentMethod: "CASH",
        paidAt: new Date("2026-11-08T14:00:00.000Z"),
        documentNumber: "HD-88",
        notes: null,
        version: 1,
        voidedAt: null,
        voidReason: null,
        createdAt: new Date("2026-11-08T14:00:00.000Z"),
        room: { roomNumber: "101" },
      },
    ]);
    mockPrisma.platformBillableDay.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(50000) },
      { amount: new Prisma.Decimal(50000) },
    ]);

    const result = await service.listExpenses("u1", "r1", "hotel-1", {
      from: "2026-11-01",
      to: "2026-11-30",
      includeVoided: false,
    });

    expect(result.summary).toEqual({
      totalExpense: 16000000,
      paidExpense: 13500000,
      unpaidExpense: 2500000,
      saasFeeInPeriod: 100000,
      totalWithSaas: 16100000,
      entryCount: 2,
      unpaidCount: 1,
    });
    expect(result.items[1].unpaidAmount).toBe(2500000);
    expect(result.byCategory[0].category).toBe("PAYROLL");
  });

  it("tạo khoản chi mới idempotent và phát hiện xung đột payload khi trùng key", async () => {
    mockTx.hotelExpense.create.mockResolvedValue({ id: "exp-new", version: 0 });

    const created = await service.create("u1", "r1", "hotel-1", {
      expenseDate: "2026-11-10",
      category: "UTILITIES",
      title: "Tiền điện tháng 11",
      vendorName: "EVN HCMC",
      amount: 3200000,
      paymentStatus: "UNPAID",
      idempotencyKey: "idem-1",
    });

    expect(created).toEqual({ id: "exp-new", version: 0 });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "HOTEL_EXPENSE_CREATED" }),
      }),
    );

    mockTx.hotelExpense.findUnique.mockResolvedValue({
      id: "exp-new",
      version: 0,
      requestHash: "different-hash",
    });

    await expect(
      service.create("u1", "r1", "hotel-1", {
        expenseDate: "2026-11-10",
        category: "UTILITIES",
        title: "Tiền điện tháng 11 (khác)",
        amount: 3200000,
        paymentStatus: "UNPAID",
        idempotencyKey: "idem-1",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("tất toán từng phần rồi chuyển sang PAID khi thanh toán nốt phần còn lại", async () => {
    mockTx.hotelExpense.findFirst.mockResolvedValue({
      id: "exp-2",
      hotelId: "hotel-1",
      roomId: null,
      amount: new Prisma.Decimal(4000000),
      paidAmount: new Prisma.Decimal(1500000),
      paymentStatus: "PARTIAL",
      notes: null,
      version: 1,
      voidedAt: null,
    });
    mockTx.hotelExpense.update.mockResolvedValue({
      id: "exp-2",
      version: 2,
      paidAmount: new Prisma.Decimal(4000000),
    });

    const settled = await service.markPaid("u1", "r1", "hotel-1", "exp-2", {
      version: 1,
      markFull: true,
      paymentMethod: "BANK_TRANSFER",
    });

    expect(settled).toEqual({ id: "exp-2", version: 2 });
    expect(mockTx.hotelExpense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paidAmount: 4000000,
          paymentStatus: "PAID",
          paymentMethod: "BANK_TRANSFER",
        }),
      }),
    );

    mockTx.hotelExpense.findFirst.mockResolvedValue({
      id: "exp-2",
      hotelId: "hotel-1",
      roomId: null,
      amount: new Prisma.Decimal(4000000),
      paidAmount: new Prisma.Decimal(1500000),
      paymentStatus: "PARTIAL",
      version: 1,
      voidedAt: null,
    });

    await expect(
      service.markPaid("u1", "r1", "hotel-1", "exp-2", {
        version: 1,
        markFull: false,
        payAmount: 3000000,
        paymentMethod: "CASH",
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
