import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { FolioItemType, GuestStayStatus, PaymentMethod, Prisma } from "@prisma/client";
import { Temporal } from "@js-temporal/polyfill";
import { HotelReportsService } from "../application/hotel-reports.service";

describe("HotelReportsService", () => {
  const mockPrisma = {
    room: {
      count: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
    },
    folioItem: {
      findMany: jest.fn(),
    },
    guestStay: {
      findMany: jest.fn(),
    },
    hotelStaffAssignment: {
      findMany: jest.fn(),
    },
  };

  const mockHotelAccessService = {
    resolveRoomScope: jest.fn(),
  };

  let service: HotelReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete (mockPrisma as any).hotelRevenueEntry;
    delete (mockPrisma as any).hotelExpense;
    delete (mockPrisma as any).platformBillableDay;
    delete (mockPrisma as any).receivableCollection;
    delete (mockPrisma as any).bookingPayment;
    delete (mockPrisma as any).hotelReceivable;
    delete (mockPrisma as any).hotel;
    delete (mockPrisma as any).$transaction;
    delete (mockHotelAccessService as any).loadActorContext;
    service = new HotelReportsService(mockPrisma as never, mockHotelAccessService as never);

    mockHotelAccessService.resolveRoomScope.mockResolvedValue({
      allowedRoomId: null,
      hotel: {
        id: "hotel-1",
        tenantId: "tenant-1",
        name: "Khách sạn Sài Gòn Star",
        timezone: "Asia/Ho_Chi_Minh",
      },
    });
  });

  it("tính toán các chỉ số báo cáo tổng quan, ADR, OCC và RevPAR chính xác", async () => {
    mockPrisma.room.count
      .mockResolvedValueOnce(20) // totalRooms
      .mockResolvedValueOnce(5); // occupiedRoomsNow

    const now = new Date();
    const mockPayments = [
      {
        id: "pay-1",
        paidAmount: 2500000,
        method: PaymentMethod.CASH,
        confirmedAt: now,
        createdByUserId: "user-staff-1",
        createdBy: {
          id: "user-staff-1",
          fullName: "Nguyễn Văn Lễ Tân",
          email: "letan@hotel.vn",
        },
      },
      {
        id: "pay-2",
        paidAmount: 1500000,
        method: PaymentMethod.BANK_TRANSFER,
        confirmedAt: now,
        createdByUserId: "user-staff-1",
        createdBy: {
          id: "user-staff-1",
          fullName: "Nguyễn Văn Lễ Tân",
          email: "letan@hotel.vn",
        },
      },
    ];
    mockPrisma.payment.findMany.mockResolvedValue(mockPayments);

    const mockFolioItems = [
      {
        id: "item-1",
        itemType: FolioItemType.ROOM_CHARGE,
        totalSnapshot: 3000000,
        postedAt: now,
        postedByUserId: "user-staff-1",
      },
      {
        id: "item-2",
        itemType: FolioItemType.SERVICE,
        totalSnapshot: 1000000,
        postedAt: now,
        postedByUserId: "user-staff-1",
      },
    ];
    mockPrisma.folioItem.findMany.mockResolvedValue(mockFolioItems);

    const checkIn = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const checkOut = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    const mockStays = [
      {
        id: "stay-1",
        reservationCode: "OTA-BOOKING-101",
        guestDisplayName: "Kim Min-soo",
        guestNationality: "Hàn Quốc",
        guestGender: "NAM",
        status: GuestStayStatus.ACTIVE,
        plannedCheckInAt: checkIn,
        plannedCheckOutAt: checkOut,
        checkedInAt: checkIn,
        checkedOutAt: null,
        nightlyRateSnapshot: 1500000,
        baseNightlyRateSnapshot: 1500000,
        createdByUserId: "user-staff-1",
        closedByUserId: null,
        createdBy: {
          id: "user-staff-1",
          fullName: "Nguyễn Văn Lễ Tân",
          email: "letan@hotel.vn",
        },
        occupants: [
          {
            id: "occ-1",
            fullName: "Kim Min-soo",
            nationality: "Hàn Quốc",
            gender: "NAM",
            isPrimary: true,
          },
        ],
        reservation: {
          id: "res-1",
          reservationCode: "OTA-BOOKING-101",
          groupCode: "CHANNEX:book-1",
          status: "CONFIRMED",
          guestCount: 1,
          createdByUserId: "user-staff-1",
        },
      },
      {
        id: "stay-2",
        reservationCode: "VSH_RES_002",
        guestDisplayName: "Trần Thị Lan",
        guestNationality: "Việt Nam",
        guestGender: "NỮ",
        status: GuestStayStatus.ACTIVE,
        plannedCheckInAt: checkIn,
        plannedCheckOutAt: checkOut,
        checkedInAt: checkIn,
        checkedOutAt: null,
        nightlyRateSnapshot: 1200000,
        baseNightlyRateSnapshot: 1200000,
        createdByUserId: "user-staff-1",
        closedByUserId: null,
        createdBy: {
          id: "user-staff-1",
          fullName: "Nguyễn Văn Lễ Tân",
          email: "letan@hotel.vn",
        },
        occupants: [
          {
            id: "occ-2",
            fullName: "Trần Thị Lan",
            nationality: "Việt Nam",
            gender: "NỮ",
            isPrimary: true,
          },
        ],
        reservation: {
          id: "res-2",
          reservationCode: "VSH_RES_002",
          groupCode: null,
          status: "CONFIRMED",
          guestCount: 1,
          createdByUserId: "user-staff-1",
        },
      },
    ];
    mockPrisma.guestStay.findMany.mockResolvedValue(mockStays);

    mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([
      {
        userId: "user-staff-1",
        user: {
          id: "user-staff-1",
          fullName: "Nguyễn Văn Lễ Tân",
          email: "letan@hotel.vn",
          userRoles: [{ role: { code: "HOTEL_FRONTDESK", name: "Lễ tân" } }],
        },
      },
    ]);

    const result = await service.getReports("user-staff-1", "role-frontdesk", "hotel-1", {
      range: "30d",
    });

    expect(result.hotelId).toBe("hotel-1");
    expect(result.hotelName).toBe("Khách sạn Sài Gòn Star");
    expect(result.summary.totalRooms).toBe(20);
    expect(result.summary.totalRevenue).toBe(4000000);
    expect(result.summary.roomRevenue).toBe(3000000);
    expect(result.summary.serviceRevenue).toBe(1000000);
    expect(result.summary.totalStays).toBe(2);
    expect(result.summary.totalGuests).toBe(2);
    expect(result.summary.adr).toBeGreaterThan(0);
    expect(result.summary.occupancyRate).toBeGreaterThan(0);

    // Kiểm tra phân bổ nguồn khách
    const bookingDotCom = result.revenueBySource.find((s) => s.sourceKey === "OTA_BOOKING");
    expect(bookingDotCom).toBeDefined();
    expect(bookingDotCom?.sourceName).toBe("Booking.com");

    const direct = result.revenueBySource.find((s) => s.sourceKey === "DIRECT");
    expect(direct).toBeDefined();

    // Kiểm tra phân bổ nhân viên thu ngân
    expect(result.revenueByStaff.length).toBeGreaterThan(0);
    expect(result.revenueByStaff[0].staffId).toBe("user-staff-1");
    expect(result.revenueByStaff[0].collectedAmount).toBe(4000000);
    expect(result.revenueByStaff[0].staffName).toBe("Nguyễn Văn Lễ Tân");

    // Kiểm tra phân bổ quốc tịch
    const korea = result.guestAnalytics.nationalities.find((n) => n.nationality === "Hàn Quốc");
    expect(korea).toBeDefined();
    const vn = result.guestAnalytics.nationalities.find((n) => n.nationality === "Việt Nam");
    expect(vn).toBeDefined();

    // Kiểm tra phương thức thanh toán
    expect(result.paymentMethods.length).toBe(2);
  });

  it("đồng bộ tuyệt đối date (YYYY-MM-DD) và dayLabel (D/M) theo múi giờ Asia/Ho_Chi_Minh nhờ Temporal", async () => {
    mockPrisma.room.count.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
    // Giao dịch lúc 01:15 sáng giờ Việt Nam ngày 2026-10-20 (tức 18:15 UTC ngày 2026-10-19)
    const earlyMorningVn = new Date("2026-10-20T01:15:00.000+07:00");

    mockPrisma.payment.findMany.mockResolvedValue([
      {
        id: "pay-early",
        paidAmount: 1800000,
        method: PaymentMethod.CASH,
        confirmedAt: earlyMorningVn,
        createdByUserId: "user-1",
        createdBy: { id: "user-1", fullName: "Thu Ngân Ca Đêm", email: "ca@vn" },
      },
    ]);
    mockPrisma.folioItem.findMany.mockResolvedValue([]);
    mockPrisma.guestStay.findMany.mockResolvedValue([
      {
        id: "stay-oct20",
        reservationCode: "VSH_OCT20",
        guestDisplayName: "Nguyễn Văn A",
        guestNationality: "VN",
        guestGender: "NAM",
        status: GuestStayStatus.CHECKED_IN,
        plannedCheckInAt: new Date("2026-10-20T14:00:00.000+07:00"),
        plannedCheckOutAt: new Date("2026-10-21T12:00:00.000+07:00"),
        checkedInAt: new Date("2026-10-20T14:00:00.000+07:00"),
        checkedOutAt: null,
        nightlyRateSnapshot: 1800000,
        baseNightlyRateSnapshot: 1800000,
        createdByUserId: "user-1",
        closedByUserId: null,
        createdBy: null,
        occupants: [],
        reservation: null,
      },
    ]);
    mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([]);

    const result = await service.getReports("user-1", "role-1", "hotel-1", {
      range: "30d",
      from: "2026-10-19",
      to: "2026-10-21",
    });

    expect(result.startDate).toBe("2026-10-19");
    expect(result.endDate).toBe("2026-10-21");
    expect(result.revenueByDay).toHaveLength(3);

    for (const dayItem of result.revenueByDay) {
      const pd = Temporal.PlainDate.from(dayItem.date);
      expect(dayItem.dayLabel).toBe(`${pd.day}/${pd.month}`);
    }

    const oct19 = result.revenueByDay.find((d) => d.date === "2026-10-19")!;
    const oct20 = result.revenueByDay.find((d) => d.date === "2026-10-20")!;
    const oct21 = result.revenueByDay.find((d) => d.date === "2026-10-21")!;

    expect(oct19.dayLabel).toBe("19/10");
    expect(oct19.totalRevenue).toBe(0);

    // Giao dịch 01:15 sáng ngày 20/10 giờ VN phải thuộc đúng ngày 2026-10-20 (20/10)
    expect(oct20.dayLabel).toBe("20/10");
    expect(oct20.totalRevenue).toBe(1800000);
    expect(oct20.roomRevenue).toBe(1800000);
    expect(oct20.roomsOccupied).toBe(1);

    // Ngày 21/10 là ngày check-out trưa (12:00), không tính lố thêm 1 đêm ở
    expect(oct21.dayLabel).toBe("21/10");
    expect(oct21.roomsOccupied).toBe(0);
  });

  it("tính đúng P&L (doanh thu folio + sổ phát sinh, chi phí vận hành, phí SaaS, lãi lỗ & dòng tiền)", async () => {
    mockPrisma.room.count.mockResolvedValueOnce(10).mockResolvedValueOnce(1);
    mockPrisma.payment.findMany.mockResolvedValue([
      {
        id: "pay-1",
        paidAmount: 3000000,
        method: PaymentMethod.BANK_TRANSFER,
        confirmedAt: new Date("2026-10-20T10:00:00.000+07:00"),
        createdByUserId: "user-1",
        createdBy: { id: "user-1", fullName: "Lễ tân", email: "lt@hotel.vn" },
      },
    ]);
    mockPrisma.folioItem.findMany.mockResolvedValue([
      {
        id: "fi-1",
        itemType: "ROOM_CHARGE",
        totalSnapshot: 4000000,
        postedAt: new Date("2026-10-20T10:00:00.000+07:00"),
        postedByUserId: "user-1",
      },
    ]);
    mockPrisma.guestStay.findMany.mockResolvedValue([]);
    mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([]);
    const extendedPrisma = mockPrisma as unknown as Record<string, unknown>;
    extendedPrisma.hotelRevenueEntry = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "rev-1",
          date: new Date("2026-10-20T00:00:00.000Z"),
          category: "OTHER",
          amount: new Prisma.Decimal(1000000),
          collections: [
            {
              amount: new Prisma.Decimal(1000000),
              receivedAt: new Date("2026-10-20T11:00:00.000+07:00"),
            },
          ],
        },
      ]),
    };
    extendedPrisma.hotelExpense = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "exp-1",
          expenseDate: new Date("2026-10-20T00:00:00.000Z"),
          category: "PAYROLL",
          amount: new Prisma.Decimal(2000000),
          paidAmount: new Prisma.Decimal(1500000),
          paymentStatus: "PARTIAL",
        },
        {
          id: "exp-2",
          expenseDate: new Date("2026-10-21T00:00:00.000Z"),
          category: "UTILITIES",
          amount: new Prisma.Decimal(500000),
          paidAmount: new Prisma.Decimal(0),
          paymentStatus: "UNPAID",
        },
      ]),
    };
    extendedPrisma.platformBillableDay = {
      findMany: jest.fn().mockResolvedValue([
        {
          serviceDate: new Date("2026-10-20T00:00:00.000Z"),
          amount: new Prisma.Decimal(150000),
        },
      ]),
    };
    extendedPrisma.receivableCollection = {
      findMany: jest.fn().mockResolvedValue([
        {
          collectedAmount: new Prisma.Decimal(500000),
          collectedAt: new Date("2026-10-20T14:00:00.000+07:00"),
        },
      ]),
    };

    const result = await service.getReports("user-1", "role-1", "hotel-1", {
      range: "30d",
      from: "2026-10-19",
      to: "2026-10-21",
    });

    // Doanh thu: 4,000,000 (folio) + 1,000,000 (manual) = 5,000,000
    expect(result.summary.manualRevenue).toBe(1000000);
    expect(result.summary.totalRevenue).toBe(5000000);
    // Thực thu: 3,000,000 (folio payment) + 500,000 (receivable) + 1,000,000 (manual) = 4,500,000
    expect(result.summary.collectedRevenue).toBe(4500000);
    expect(result.summary.uncollectedRevenue).toBe(500000);
    // Chi phí: 2,500,000 (operating: 1,500,000 paid + 1,000,000 unpaid) + 150,000 SaaS = 2,650,000
    expect(result.summary.operatingExpense).toBe(2500000);
    expect(result.summary.paidOperatingExpense).toBe(1500000);
    expect(result.summary.unpaidOperatingExpense).toBe(1000000);
    expect(result.summary.saasFeeExpense).toBe(150000);
    expect(result.summary.totalExpense).toBe(2650000);
    // Lãi ròng = 5,000,000 - 2,650,000 = 2,350,000 (47%)
    expect(result.summary.netProfit).toBe(2350000);
    expect(result.summary.profitMargin).toBe(47);
    // Dòng tiền thực = 4,500,000 - 1,500,000 = 3,000,000
    expect(result.summary.netCashFlow).toBe(3000000);
    expect(result.expenseByCategory.find((c) => c.category === "SAAS_FEE")?.amount).toBe(150000);

    const oct20 = result.revenueByDay.find((d) => d.date === "2026-10-20")!;
    expect(oct20.totalRevenue).toBe(5000000);
    expect(oct20.expense).toBe(2150000);
    expect(oct20.netProfit).toBe(2850000);
  });

  it("bảo toàn tiền cọc 500.000đ khi đặt phòng bị hủy / no-show: ghi nhận đúng tiền thu theo ngày nhận, không lưu trú/đêm phòng giả", async () => {
    mockPrisma.room.count.mockResolvedValueOnce(10).mockResolvedValueOnce(0);
    mockPrisma.payment.findMany.mockResolvedValue([]);
    mockPrisma.folioItem.findMany.mockResolvedValue([]);
    mockPrisma.guestStay.findMany.mockResolvedValue([]);
    mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([]);

    const extendedPrisma = mockPrisma as unknown as Record<string, unknown>;
    const receivedAt = new Date("2026-10-20T10:00:00.000+07:00");
    extendedPrisma.bookingPayment = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "bp-1",
          intent: "DEPOSIT",
          receivedAmount: new Prisma.Decimal(500000),
          requestedAmount: new Prisma.Decimal(500000),
          status: "COMPLETED",
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          receivedAt,
          createdAt: receivedAt,
          allocations: [],
        },
      ]),
    };

    const result = await service.getReports("user-1", "role-1", "hotel-1", {
      range: "30d",
      from: "2026-10-19",
      to: "2026-10-21",
    });

    // Thống kê cọc riêng
    expect(result.bookingPaymentsSummary).toBeDefined();
    expect(result.bookingPaymentsSummary?.totalReceived).toBe(500000);
    expect(result.bookingPaymentsSummary?.depositCount).toBe(1);

    // Deposits are cash receipts until an earned charge is recognized.
    expect(result.summary.totalRevenue).toBe(0);
    expect(result.summary.roomRevenue).toBe(0);
    expect(result.summary.otherRevenue).toBe(0);
    expect(result.summary.netProfit).toBe(0);
    expect(result.summary.collectedRevenue).toBe(500000);
    expect(result.summary.netCashFlow).toBe(500000);
    expect(result.summary.totalStays).toBe(0);
    expect(result.summary.totalRoomNights).toBe(0);

    // Phân bổ ngày thu: đúng ngày nhận 20/10, ngày 21/10 không thu lần hai
    const oct20 = result.revenueByDay.find((d) => d.date === "2026-10-20")!;
    expect(oct20.collectedRevenue).toBe(500000);
    expect(oct20.totalRevenue).toBe(0);
    expect(oct20.roomRevenue).toBe(0);
    expect(oct20.netProfit).toBe(0);
    expect(oct20.roomsOccupied).toBe(0);

    expect(result.revenueByMonth.find((m) => m.month === "2026-10")).toMatchObject({
      totalRevenue: 0,
      roomRevenue: 0,
      collectedRevenue: 500000,
      netProfit: 0,
    });

    const oct21 = result.revenueByDay.find((d) => d.date === "2026-10-21")!;
    expect(oct21.collectedRevenue).toBe(0);
    expect(oct21.totalRevenue).toBe(0);

    // Phương thức thanh toán
    expect(result.paymentMethods).toHaveLength(1);
    expect(result.paymentMethods[0].method).toBe(PaymentMethod.BANK_TRANSFER);
    expect(result.paymentMethods[0].amount).toBe(500000);
  });

  it("không tính trùng tiền cọc khi cọc đã được chuyển / phân bổ vào folio (allocated)", async () => {
    mockPrisma.room.count.mockResolvedValueOnce(10).mockResolvedValueOnce(1);
    const date = new Date("2026-10-20T10:00:00.000+07:00");

    // Succeeded payment đã được tạo từ billing khi chuyển cọc vào folio
    mockPrisma.payment.findMany.mockResolvedValue([
      {
        id: "pay-from-deposit",
        metadataJson: { source: "booking_deposit" },
        paidAmount: 500000,
        method: PaymentMethod.BANK_TRANSFER,
        confirmedAt: date,
        createdByUserId: "user-1",
        createdBy: null,
      },
    ]);
    mockPrisma.folioItem.findMany.mockResolvedValue([
      {
        id: "fi-room",
        itemType: FolioItemType.ROOM_CHARGE,
        totalSnapshot: 500000,
        postedAt: date,
        postedByUserId: "user-1",
      },
    ]);
    mockPrisma.guestStay.findMany.mockResolvedValue([]);
    mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([]);

    const extendedPrisma = mockPrisma as unknown as Record<string, unknown>;
    extendedPrisma.bookingPayment = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "bp-1",
          intent: "DEPOSIT",
          receivedAmount: new Prisma.Decimal(500000),
          requestedAmount: new Prisma.Decimal(500000),
          status: "ALLOCATED",
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          receivedAt: date,
          createdAt: date,
          allocations: [
            {
              id: "alloc-1",
              folioId: "folio-1",
              invoiceId: "inv-1",
              allocatedAmount: new Prisma.Decimal(500000),
              allocatedAt: date,
            },
          ],
        },
      ]),
    };

    const result = await service.getReports("user-1", "role-1", "hotel-1", {
      range: "30d",
      from: "2026-10-19",
      to: "2026-10-21",
    });

    // Cọc vẫn được ghi nhận trong headline cọc
    expect(result.bookingPaymentsSummary?.totalReceived).toBe(500000);
    // Không bị tính trùng: tổng thu đúng 500.000đ thay vì 1.000.000đ
    expect(result.summary.totalRevenue).toBe(500000);
    expect(result.summary.collectedRevenue).toBe(500000);
    expect(result.revenueByDay.find((d) => d.date === "2026-10-20")).toMatchObject({
      totalRevenue: 500000,
      collectedRevenue: 500000,
      netProfit: 500000,
    });
    expect(result.revenueByMonth.find((m) => m.month === "2026-10")).toMatchObject({
      totalRevenue: 500000,
      collectedRevenue: 500000,
      netProfit: 500000,
    });
  });

  it("cọc đoàn phân bổ một phần: bảo toàn đúng phần cọc chưa phân bổ khi có thành viên đoàn hủy", async () => {
    mockPrisma.room.count.mockResolvedValueOnce(10).mockResolvedValueOnce(1);
    const date = new Date("2026-10-20T10:00:00.000+07:00");

    // Room 1 của đoàn đã nhận phòng, folio payment nhận 500.000đ
    mockPrisma.payment.findMany.mockResolvedValue([
      {
        id: "pay-room-1",
        paidAmount: 500000,
        method: PaymentMethod.BANK_TRANSFER,
        confirmedAt: date,
        createdByUserId: "user-1",
        createdBy: null,
      },
    ]);
    mockPrisma.folioItem.findMany.mockResolvedValue([
      {
        id: "fi-room-1",
        itemType: FolioItemType.ROOM_CHARGE,
        totalSnapshot: 500000,
        postedAt: date,
        postedByUserId: "user-1",
      },
    ]);
    mockPrisma.guestStay.findMany.mockResolvedValue([]);
    mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([]);

    // Tổng cọc đoàn là 1.000.000đ, đã phân bổ 500.000đ cho Room 1, còn 500.000đ của Room 2 bị hủy
    const extendedPrisma = mockPrisma as unknown as Record<string, unknown>;
    extendedPrisma.bookingPayment = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "bp-group",
          intent: "DEPOSIT",
          receivedAmount: new Prisma.Decimal(1000000),
          requestedAmount: new Prisma.Decimal(1000000),
          status: "ALLOCATED",
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          receivedAt: date,
          createdAt: date,
          allocations: [
            {
              id: "alloc-room-1",
              folioId: "folio-1",
              invoiceId: "inv-1",
              allocatedAmount: new Prisma.Decimal(500000),
              allocatedAt: date,
            },
          ],
        },
      ]),
    };

    const result = await service.getReports("user-1", "role-1", "hotel-1", {
      range: "30d",
      from: "2026-10-19",
      to: "2026-10-21",
    });

    expect(result.bookingPaymentsSummary?.totalReceived).toBe(1000000);
    // Tổng thu: 500.000đ (folio Room 1) + 500.000đ (cọc chưa phân bổ được bảo toàn) = 1.000.000đ
    expect(result.summary.totalRevenue).toBe(500000);
    expect(result.summary.collectedRevenue).toBe(1000000);
    expect(result.summary.netProfit).toBe(500000);
    expect(result.revenueByDay.find((d) => d.date === "2026-10-20")).toMatchObject({
      totalRevenue: 500000,
      collectedRevenue: 1000000,
    });
    expect(result.revenueByMonth.find((m) => m.month === "2026-10")).toMatchObject({
      totalRevenue: 500000,
      collectedRevenue: 1000000,
    });
  });

  it.each([false, true])("recognizes October deposit cash and November revenue only once (allocated: %s)", async (allocated) => {
    mockPrisma.room.count.mockResolvedValue(10);
    mockPrisma.guestStay.findMany.mockResolvedValue([]);
    mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([]);
    const receivedAt = new Date("2026-10-20T01:15:00.000+07:00");
    const chargedAt = new Date("2026-11-13T14:00:00.000+07:00");
    mockPrisma.payment.findMany.mockResolvedValue(allocated ? [{
      id: "pay-allocated-deposit",
      paidAmount: 500000,
      method: PaymentMethod.BANK_TRANSFER,
      confirmedAt: receivedAt,
      metadataJson: { source: "booking_deposit" },
      createdByUserId: "user-1",
      createdBy: null,
    }] : []);
    mockPrisma.folioItem.findMany.mockImplementation(({ where }) => Promise.resolve(
      chargedAt <= where.postedAt.lte
        ? [{
            id: "fi-november-room",
            itemType: FolioItemType.ROOM_CHARGE,
            totalSnapshot: 500000,
            postedAt: chargedAt,
            postedByUserId: "user-1",
          }]
        : [],
    ));
    const extendedPrisma = mockPrisma as unknown as Record<string, unknown>;
    extendedPrisma.bookingPayment = {
      findMany: jest.fn().mockResolvedValue([{
        id: "bp-october-deposit",
        intent: "DEPOSIT",
        receivedAmount: new Prisma.Decimal(500000),
        requestedAmount: new Prisma.Decimal(500000),
        status: allocated ? "ALLOCATED" : "COMPLETED",
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        receivedAt,
        createdAt: new Date("2026-10-19T10:00:00.000+07:00"),
        allocations: allocated ? [{
          id: "alloc-november",
          folioId: "folio-november",
          invoiceId: "invoice-november",
          allocatedAmount: new Prisma.Decimal(500000),
          allocatedAt: chargedAt,
        }] : [],
      }]),
    };

    const october = await service.getReports("user-1", "role-1", "hotel-1", {
      range: "30d", from: "2026-10-01", to: "2026-10-31",
    });
    const november = await service.getReports("user-1", "role-1", "hotel-1", {
      range: "30d", from: "2026-11-01", to: "2026-11-13",
    });

    expect(october.summary).toMatchObject({
      totalRevenue: 0, roomRevenue: 0, otherRevenue: 0, collectedRevenue: 500000, netProfit: 0,
    });
    expect(october.bookingPaymentsSummary?.totalReceived).toBe(500000);
    expect(october.revenueByDay.find((d) => d.date === "2026-10-20")).toMatchObject({
      totalRevenue: 0, collectedRevenue: 500000, netProfit: 0,
    });
    expect(october.revenueByDay.find((d) => d.date === "2026-10-19")?.collectedRevenue).toBe(0);
    expect(november.summary).toMatchObject({
      totalRevenue: 500000, roomRevenue: 500000, collectedRevenue: 0, netProfit: 500000,
    });
    expect(november.bookingPaymentsSummary?.totalReceived).toBe(0);
    expect(november.revenueByDay.find((d) => d.date === "2026-11-13")).toMatchObject({
      totalRevenue: 500000, collectedRevenue: 0, netProfit: 500000,
    });
    expect(november.revenueByMonth.find((m) => m.month === "2026-10")).toMatchObject({
      totalRevenue: 0, roomRevenue: 0, collectedRevenue: 500000, netProfit: 0,
    });
    expect(november.revenueByMonth.find((m) => m.month === "2026-11")).toMatchObject({
      totalRevenue: 500000, roomRevenue: 500000, collectedRevenue: 0, netProfit: 500000,
    });
    expect(october.summary.totalRevenue + november.summary.totalRevenue).toBe(500000);
    expect(november.revenueByMonth.reduce((sum, month) => sum + month.totalRevenue, 0)).toBe(500000);
  });

  it.each(["2026-11-20", "2026-12-20", "2025-11-20"])(
    "includes November 13 receipts for a manual charge dated %s without moving its revenue date",
    async (chargeDate) => {
      mockPrisma.room.count.mockResolvedValue(10);
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.folioItem.findMany.mockResolvedValue([]);
      mockPrisma.guestStay.findMany.mockResolvedValue([]);
      mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([]);
      const receivedAt = new Date("2026-11-13T00:15:00.000+07:00");
      const findMany = jest.fn().mockResolvedValue([{
        id: "manual-laundry",
        date: new Date(`${chargeDate}T00:00:00.000Z`),
        category: "LAUNDRY",
        amount: new Prisma.Decimal(100),
        collections: [{ amount: new Prisma.Decimal(40), receivedAt }],
      }]);
      const extendedPrisma = mockPrisma as unknown as Record<string, unknown>;
      extendedPrisma.hotelRevenueEntry = { findMany };

      const result = await service.getReports("user-1", "role-1", "hotel-1", {
        range: "30d", from: "2026-11-13", to: "2026-11-13",
      });

      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          hotelId: "hotel-1",
          voidedAt: null,
          OR: [
            { date: { gte: new Date("2024-12-01T00:00:00.000Z"), lte: new Date("2026-11-13T00:00:00.000Z") } },
            { collections: { some: { receivedAt: {
              gte: new Date("2024-12-01T00:00:00.000+07:00"),
              lte: new Date("2026-11-13T23:59:59.999+07:00"),
            } } } },
          ],
        }),
      }));
      expect(result.summary).toMatchObject({
        totalRevenue: 0, manualRevenue: 0, collectedRevenue: 40, netProfit: 0, netCashFlow: 40,
      });
      expect(result.revenueByDay[0]).toMatchObject({
        date: "2026-11-13", totalRevenue: 0, manualRevenue: 0, collectedRevenue: 40, netProfit: 0,
      });
      expect(result.revenueByMonth.find((m) => m.month === "2026-11")).toMatchObject({
        totalRevenue: 0, manualRevenue: 0, collectedRevenue: 40, netProfit: 0,
      });

      if (chargeDate === "2026-11-20") {
        const charged = await service.getReports("user-1", "role-1", "hotel-1", {
          range: "30d", from: chargeDate, to: chargeDate,
        });
        expect(charged.summary).toMatchObject({ totalRevenue: 100, manualRevenue: 100, collectedRevenue: 0 });
        expect(charged.revenueByDay[0]).toMatchObject({ totalRevenue: 100, manualRevenue: 100, collectedRevenue: 0 });
        expect(charged.revenueByMonth.find((m) => m.month === "2026-11")).toMatchObject({
          totalRevenue: 100, manualRevenue: 100, collectedRevenue: 40,
        });
      }
    },
  );

  describe.each(["hotelRevenueEntry", "hotelExpense", "platformBillableDay", "receivableCollection"])(
    "%s query failures",
    (model) => {
      it.each(["rejected", "thrown"])("propagates a %s financial query error", async (failure) => {
        mockPrisma.room.count.mockResolvedValue(10);
        mockPrisma.payment.findMany.mockResolvedValue([]);
        mockPrisma.folioItem.findMany.mockResolvedValue([]);
        mockPrisma.guestStay.findMany.mockResolvedValue([]);
        mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([]);
        const error = new Error(`${model} unavailable`);
        const findMany = failure === "rejected"
          ? jest.fn().mockRejectedValue(error)
          : jest.fn().mockImplementation(() => { throw error; });
        const extendedPrisma = mockPrisma as unknown as Record<string, unknown>;
        extendedPrisma[model] = { findMany };

        await expect(service.getReports("user-1", "role-1", "hotel-1", {
          range: "30d", from: "2026-11-13", to: "2026-11-13",
        })).rejects.toBe(error);
      });
    },
  );

  it("tính đúng MoM, YoY (24 tháng lookback -> 12 tháng output), targetAchievement, quarterlySummary và canManageTargets", async () => {
    mockPrisma.room.count.mockResolvedValueOnce(10).mockResolvedValueOnce(3);
    mockPrisma.payment.findMany.mockResolvedValue([]);
    mockPrisma.guestStay.findMany.mockResolvedValue([]);
    mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([]);

    mockPrisma.folioItem.findMany.mockResolvedValue([
      // 2024-12 (YoY baseline cho 2025-12): 8,000,000
      { id: "fi-2024-12", itemType: FolioItemType.ROOM_CHARGE, totalSnapshot: 8000000, postedAt: new Date("2024-12-15T10:00:00.000+07:00"), postedByUserId: "u1" },
      // 2025-11 (MoM baseline cho 2025-12 & YoY baseline cho 2026-11): 10,000,000
      { id: "fi-2025-11", itemType: FolioItemType.ROOM_CHARGE, totalSnapshot: 10000000, postedAt: new Date("2025-11-10T10:00:00.000+07:00"), postedByUserId: "u1" },
      // 2025-12 (tháng đầu trong cửa sổ 12 tháng): 12,000,000 -> MoM +20%, YoY +50%
      { id: "fi-2025-12", itemType: FolioItemType.ROOM_CHARGE, totalSnapshot: 12000000, postedAt: new Date("2025-12-10T10:00:00.000+07:00"), postedByUserId: "u1" },
      // 2026-09 (prior month 2026-08 = 0 -> momChangePercent null): 5,000,000
      { id: "fi-2026-09", itemType: FolioItemType.ROOM_CHARGE, totalSnapshot: 5000000, postedAt: new Date("2026-09-12T10:00:00.000+07:00"), postedByUserId: "u1" },
      // 2026-10: 15,000,000 -> MoM vs 5M = +200%
      { id: "fi-2026-10", itemType: FolioItemType.ROOM_CHARGE, totalSnapshot: 15000000, postedAt: new Date("2026-10-15T10:00:00.000+07:00"), postedByUserId: "u1" },
      // 2026-11: 12,500,000 -> MoM vs 15M = -16.7%, YoY vs 10M = +25%
      { id: "fi-2026-11", itemType: FolioItemType.ROOM_CHARGE, totalSnapshot: 12500000, postedAt: new Date("2026-11-10T10:00:00.000+07:00"), postedByUserId: "u1" },
    ]);

    const extendedPrisma = mockPrisma as unknown as Record<string, unknown>;
    extendedPrisma.hotelExpense = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "exp-oct",
          expenseDate: new Date("2026-10-20T00:00:00.000Z"),
          category: "UTILITIES",
          amount: new Prisma.Decimal(2500000),
          paidAmount: new Prisma.Decimal(2500000),
          paymentStatus: "PAID",
        },
      ]),
    };
    extendedPrisma.hotel = {
      findUnique: jest.fn().mockResolvedValue({
        brandSettings: {
          primaryColor: "#0f172a",
          revenueTargets: {
            "2026-10": 10000000,
            "2026-11": 20000000,
            "2026-01": 0,
            "2026-13": 999999,
          },
        },
      }),
    };
    (mockHotelAccessService as any).loadActorContext = jest.fn().mockResolvedValue({
      isSuperAdmin: false,
      permissions: new Set(["hotel.dashboard.view", "hotel.billing.manage"]),
    });

    const result = await service.getReports("user-1", "role-owner", "hotel-1", {
      range: "30d",
      from: "2026-11-01",
      to: "2026-11-13",
    });

    expect(result.revenueByMonth).toHaveLength(12);
    expect(result.revenueByMonth[0].month).toBe("2025-12");
    expect(result.revenueByMonth[11].month).toBe("2026-11");
    expect(result.canManageTargets).toBe(true);

    const dec2025 = result.revenueByMonth.find((m) => m.month === "2025-12")!;
    expect(dec2025).toMatchObject({
      totalRevenue: 12000000,
      previousMonthRevenue: 10000000,
      momChangePercent: 20,
      previousYearRevenue: 8000000,
      yoyChangePercent: 50,
      targetRevenue: null,
      targetAchievementPercent: null,
    });

    const sep2026 = result.revenueByMonth.find((m) => m.month === "2026-09")!;
    expect(sep2026).toMatchObject({
      totalRevenue: 5000000,
      previousMonthRevenue: 0,
      momChangePercent: null,
      previousYearRevenue: 0,
      yoyChangePercent: null,
    });

    const oct2026 = result.revenueByMonth.find((m) => m.month === "2026-10")!;
    expect(oct2026).toMatchObject({
      totalRevenue: 15000000,
      previousMonthRevenue: 5000000,
      momChangePercent: 200,
      targetRevenue: 10000000,
      targetAchievementPercent: 150,
    });

    const nov2026 = result.revenueByMonth.find((m) => m.month === "2026-11")!;
    expect(nov2026).toMatchObject({
      totalRevenue: 12500000,
      previousMonthRevenue: 15000000,
      momChangePercent: -16.7,
      previousYearRevenue: 10000000,
      yoyChangePercent: 25,
      targetRevenue: 20000000,
      targetAchievementPercent: 62.5,
    });

    const jan2026 = result.revenueByMonth.find((m) => m.month === "2026-01")!;
    expect(jan2026.targetRevenue).toBeNull();
    expect(jan2026.targetAchievementPercent).toBeNull();

    // Quarterly summary aggregates 2025-Q4 (1m), 2026-Q1 (3m), 2026-Q2 (3m), 2026-Q3 (3m), 2026-Q4 (2m)
    expect(result.quarterlySummary).toEqual([
      {
        quarter: "2025-Q4",
        label: "Quý 4/2025",
        actualRevenue: 12000000,
        targetRevenue: null,
        achievementPercent: null,
        netProfit: 12000000,
        monthsIncluded: 1,
      },
      {
        quarter: "2026-Q1",
        label: "Quý 1/2026",
        actualRevenue: 0,
        targetRevenue: null,
        achievementPercent: null,
        netProfit: 0,
        monthsIncluded: 3,
      },
      {
        quarter: "2026-Q2",
        label: "Quý 2/2026",
        actualRevenue: 0,
        targetRevenue: null,
        achievementPercent: null,
        netProfit: 0,
        monthsIncluded: 3,
      },
      {
        quarter: "2026-Q3",
        label: "Quý 3/2026",
        actualRevenue: 5000000,
        targetRevenue: null,
        achievementPercent: null,
        netProfit: 5000000,
        monthsIncluded: 3,
      },
      {
        quarter: "2026-Q4",
        label: "Quý 4/2026",
        actualRevenue: 27500000,
        targetRevenue: 30000000,
        achievementPercent: 91.7,
        netProfit: 25000000,
        monthsIncluded: 2,
      },
    ]);
  });

  it("canManageTargets trả về false khi thiếu quyền hoặc bị giới hạn theo phòng", async () => {
    mockPrisma.room.count.mockResolvedValue(5);
    mockPrisma.payment.findMany.mockResolvedValue([]);
    mockPrisma.folioItem.findMany.mockResolvedValue([]);
    mockPrisma.guestStay.findMany.mockResolvedValue([]);
    mockPrisma.hotelStaffAssignment.findMany.mockResolvedValue([]);

    (mockHotelAccessService as any).loadActorContext = jest.fn().mockResolvedValue({
      isSuperAdmin: false,
      permissions: new Set(["hotel.dashboard.view"]),
    });
    const noPerm = await service.getReports("user-1", "role-viewer", "hotel-1", {
      range: "7d",
    });
    expect(noPerm.canManageTargets).toBe(false);

    mockHotelAccessService.resolveRoomScope.mockResolvedValueOnce({
      allowedRoomId: "room-101",
      hotel: { id: "hotel-1", tenantId: "tenant-1", name: "Star", timezone: "Asia/Ho_Chi_Minh" },
    });
    (mockHotelAccessService as any).loadActorContext = jest.fn().mockResolvedValue({
      isSuperAdmin: true,
      permissions: new Set(["hotel.billing.manage"]),
    });
    const roomScoped = await service.getReports("user-2", "role-room", "hotel-1", {
      range: "7d",
    });
    expect(roomScoped.canManageTargets).toBe(false);
  });

  describe("upsertRevenueTarget", () => {
    it("lưu mục tiêu doanh thu tháng, bảo toàn các key brandSettings khác và ghi audit log", async () => {
      const tx = {
        hotel: {
          findUnique: jest.fn().mockResolvedValue({
            id: "hotel-1",
            tenantId: "tenant-1",
            brandSettings: {
              primaryColor: "#1d4ed8",
              logoUrl: "https://cdn.example.com/logo.png",
              revenueTargets: { "2026-10": 100000000 },
            },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: "audit-1" }),
        },
      };
      (mockPrisma as any).$transaction = jest.fn().mockImplementation(async (fn: any) => fn(tx));

      const result = await service.upsertRevenueTarget("user-1", "role-owner", "hotel-1", {
        month: "2026-11",
        targetAmount: 150000000.6,
      });

      expect(result).toEqual({
        hotelId: "hotel-1",
        month: "2026-11",
        targetAmount: 150000001,
        revenueTargets: {
          "2026-10": 100000000,
          "2026-11": 150000001,
        },
      });
      expect(tx.hotel.update).toHaveBeenCalledWith({
        where: { id: "hotel-1" },
        data: {
          brandSettings: {
            primaryColor: "#1d4ed8",
            logoUrl: "https://cdn.example.com/logo.png",
            revenueTargets: {
              "2026-10": 100000000,
              "2026-11": 150000001,
            },
          },
        },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: "user-1",
          tenantId: "tenant-1",
          entityType: "Hotel",
          entityId: "hotel-1",
          action: "HOTEL_REVENUE_TARGET_UPDATED",
          metadata: {
            hotelId: "hotel-1",
            month: "2026-11",
            previousTargetAmount: null,
            targetAmount: 150000001,
          },
        }),
      });
    });

    it("xóa khóa mục tiêu của tháng khi targetAmount === 0 mà vẫn giữ nguyên các tháng khác và brandSettings", async () => {
      const tx = {
        hotel: {
          findUnique: jest.fn().mockResolvedValue({
            id: "hotel-1",
            tenantId: "tenant-1",
            brandSettings: {
              primaryColor: "#1d4ed8",
              revenueTargets: {
                "2026-10": 100000000,
                "2026-11": 150000000,
              },
            },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({ id: "audit-2" }),
        },
      };
      (mockPrisma as any).$transaction = jest.fn().mockImplementation(async (fn: any) => fn(tx));

      const result = await service.upsertRevenueTarget("user-1", "role-owner", "hotel-1", {
        month: "2026-11",
        targetAmount: 0,
      });

      expect(result).toEqual({
        hotelId: "hotel-1",
        month: "2026-11",
        targetAmount: null,
        revenueTargets: { "2026-10": 100000000 },
      });
      expect(tx.hotel.update).toHaveBeenCalledWith({
        where: { id: "hotel-1" },
        data: {
          brandSettings: {
            primaryColor: "#1d4ed8",
            revenueTargets: { "2026-10": 100000000 },
          },
        },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: "Hotel",
          entityId: "hotel-1",
          action: "HOTEL_REVENUE_TARGET_UPDATED",
          metadata: expect.objectContaining({
            month: "2026-11",
            previousTargetAmount: 150000000,
            targetAmount: null,
          }),
        }),
      });
    });

    it("từ chối tài khoản bị phân quyền theo phòng bằng ForbiddenException", async () => {
      mockHotelAccessService.resolveRoomScope.mockResolvedValueOnce({
        allowedRoomId: "room-101",
        hotel: { id: "hotel-1", tenantId: "tenant-1", name: "Star", timezone: "Asia/Ho_Chi_Minh" },
      });
      const txSpy = jest.fn();
      (mockPrisma as any).$transaction = txSpy;

      await expect(
        service.upsertRevenueTarget("user-room", "role-room", "hotel-1", {
          month: "2026-11",
          targetAmount: 120000000,
        }),
      ).rejects.toThrow(
        new ForbiddenException(
          "Tài khoản chỉ được phân quyền theo phòng nên không thể cập nhật mục tiêu doanh thu khách sạn",
        ),
      );
      expect(txSpy).not.toHaveBeenCalled();
    });

    it("ném NotFoundException nếu không tìm thấy khách sạn trong transaction", async () => {
      const tx = {
        hotel: {
          findUnique: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
        auditLog: { create: jest.fn() },
      };
      (mockPrisma as any).$transaction = jest.fn().mockImplementation(async (fn: any) => fn(tx));

      await expect(
        service.upsertRevenueTarget("user-1", "role-owner", "hotel-missing", {
          month: "2026-11",
          targetAmount: 120000000,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
