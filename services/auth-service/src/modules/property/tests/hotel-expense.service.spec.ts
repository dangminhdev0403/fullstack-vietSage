import { BadRequestException, ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { HotelExpenseService } from "../application/hotel-expense.service";
import {
  createHotelExpenseSchema,
  listHotelExpensesQuerySchema,
  payHotelExpenseSchema,
  updateHotelExpenseSchema,
} from "../domain/schemas/hotel-expense.schema";

describe("Hotel expense validation", () => {
  const payload = {
    expenseDate: "2026-11-10",
    category: "UTILITIES",
    title: "Tiền điện tháng 11",
    amount: 100,
    paymentStatus: "PAID",
  };

  it.each([
    "2026-02-30",
    "2026-04-31",
    "2025-02-29",
    "1900-02-29",
    "2026-13-01",
    "2026-00-01",
    "2026-2-28",
  ])("rejects invalid calendar date %s on every date input", (expenseDate) => {
    expect(() => parseWithZod(createHotelExpenseSchema, {
      ...payload, expenseDate, idempotencyKey: "date-validation",
    })).toThrow(BadRequestException);
    expect(() => parseWithZod(updateHotelExpenseSchema, {
      ...payload, expenseDate, version: 0,
    })).toThrow(BadRequestException);
    expect(() => parseWithZod(listHotelExpensesQuerySchema, { from: expenseDate }))
      .toThrow(BadRequestException);
    expect(() => parseWithZod(listHotelExpensesQuerySchema, { to: expenseDate }))
      .toThrow(BadRequestException);
  });

  it.each(["2024-02-29", "2000-02-29", "2026-02-28"])(
    "accepts valid calendar date %s, including leap centuries",
    (expenseDate) => {
      expect(createHotelExpenseSchema.safeParse({
        ...payload, expenseDate, idempotencyKey: "valid-date",
      }).success).toBe(true);
      expect(updateHotelExpenseSchema.safeParse({
        ...payload, expenseDate, version: 0,
      }).success).toBe(true);
      expect(listHotelExpensesQuerySchema.safeParse({
        from: expenseDate, to: expenseDate,
      }).success).toBe(true);
    },
  );

  it.each([0.001, "0.001", 1.999, 9_999_999_999.991, 10_000_000_000, "10000000000"])(
    "rejects money outside DECIMAL(12, 2): %s",
    (value) => {
      for (const field of ["amount", "paidAmount"]) {
        const input = { ...payload, amount: 9_999_999_999.99, [field]: value };
        expect(createHotelExpenseSchema.safeParse({
          ...input, idempotencyKey: "invalid-money",
        }).success).toBe(false);
        expect(updateHotelExpenseSchema.safeParse({ ...input, version: 0 }).success).toBe(false);
      }
      expect(payHotelExpenseSchema.safeParse({ version: 0, payAmount: value }).success).toBe(false);
    },
  );

  it.each([0.01, 0.1, 0.29, 12.34, 9_999_999_999.99, "9999999999.99"])(
    "accepts exactly representable stored money %s",
    (value) => {
      expect(createHotelExpenseSchema.safeParse({
        ...payload, amount: value, paidAmount: value, idempotencyKey: "valid-money",
      }).success).toBe(true);
      expect(updateHotelExpenseSchema.safeParse({
        ...payload, amount: value, paidAmount: value, version: 0,
      }).success).toBe(true);
      expect(payHotelExpenseSchema.safeParse({ version: 0, payAmount: value }).success).toBe(true);
    },
  );

  it("allows zero paid amount for unpaid expenses while requiring a positive expense", () => {
    expect(createHotelExpenseSchema.safeParse({
      ...payload, paidAmount: 0, paymentStatus: "UNPAID", idempotencyKey: "unpaid",
    }).success).toBe(true);
    expect(createHotelExpenseSchema.safeParse({
      ...payload, amount: 0, idempotencyKey: "zero-expense",
    }).success).toBe(false);
  });
});

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

  it.each([
    ["hotelExpense", "P2021"],
    ["hotelExpense", "P2022"],
    ["platformBillableDay", "P2021"],
    ["platformBillableDay", "P2022"],
  ])("reports unavailable when %s fails with %s instead of returning zero totals", async (model, code) => {
    mockPrisma[model].findMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "Required financial storage is unavailable",
      { code, clientVersion: "7.9.1" },
    ));

    await expect(service.listExpenses("u1", "r1", "hotel-1", {
      from: "2026-11-01", to: "2026-11-30", includeVoided: false,
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each(["hotelExpense", "platformBillableDay", "room"])(
    "propagates unexpected %s read errors instead of fabricating financial totals",
    async (model) => {
      const error = new Error("Storage connection lost");
      mockPrisma[model].findMany.mockRejectedValue(error);

      await expect(service.listExpenses("u1", "r1", "hotel-1", {
        from: "2026-11-01", to: "2026-11-30", includeVoided: false,
      })).rejects.toBe(error);
    },
  );

  it("returns zero totals only after successful empty financial reads", async () => {
    const result = await service.listExpenses("u1", "r1", "hotel-1", {
      from: "2026-11-01", to: "2026-11-30", includeVoided: false,
    });

    expect(result.summary).toEqual({
      totalExpense: 0,
      paidExpense: 0,
      unpaidExpense: 0,
      saasFeeInPeriod: 0,
      totalWithSaas: 0,
      entryCount: 0,
      unpaidCount: 0,
    });
    expect(mockPrisma.hotelExpense.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.platformBillableDay.findMany).toHaveBeenCalledTimes(1);
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
