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
    service = new HotelReportsService(mockPrisma as never, mockHotelAccessService as never);

    mockHotelAccessService.resolveRoomScope.mockResolvedValue({
      allowedRoomId: null,
      hotel: {
        id: "hotel-1",
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

    // Headline revenue & collected
    expect(result.summary.totalRevenue).toBe(500000);
    expect(result.summary.collectedRevenue).toBe(500000);
    expect(result.summary.totalStays).toBe(0);
    expect(result.summary.totalRoomNights).toBe(0);

    // Phân bổ ngày thu: đúng ngày nhận 20/10, ngày 21/10 không thu lần hai
    const oct20 = result.revenueByDay.find((d) => d.date === "2026-10-20")!;
    expect(oct20.collectedRevenue).toBe(500000);
    expect(oct20.totalRevenue).toBe(500000);
    expect(oct20.roomsOccupied).toBe(0);

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
    expect(result.summary.totalRevenue).toBe(1000000);
    expect(result.summary.collectedRevenue).toBe(1000000);
  });
});
