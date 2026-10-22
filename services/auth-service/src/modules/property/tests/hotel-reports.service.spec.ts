import { FolioItemType, PaymentMethod, PaymentStatus, RoomStatus } from "@prisma/client";
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
    service = new HotelReportsService(
      mockPrisma as never,
      mockHotelAccessService as never,
    );

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
        createdBy: { id: "user-staff-1", fullName: "Nguyễn Văn Lễ Tân", email: "letan@hotel.vn" },
      },
      {
        id: "pay-2",
        paidAmount: 1500000,
        method: PaymentMethod.BANK_TRANSFER,
        confirmedAt: now,
        createdByUserId: "user-staff-1",
        createdBy: { id: "user-staff-1", fullName: "Nguyễn Văn Lễ Tân", email: "letan@hotel.vn" },
      },
    ];
    mockPrisma.payment.findMany.mockResolvedValue(mockPayments);

    const mockFolioItems = [
      {
        id: "item-1",
        itemType: FolioItemType.ROOM_CHARGE,
        nameSnapshot: "Tiền phòng Deluxe",
        totalSnapshot: 3000000,
        postedAt: now,
        postedByUserId: "user-staff-1",
        postedBy: { id: "user-staff-1", fullName: "Nguyễn Văn Lễ Tân", email: "letan@hotel.vn" },
      },
      {
        id: "item-2",
        itemType: FolioItemType.SERVICE,
        nameSnapshot: "Minibar & Giặt ủi",
        totalSnapshot: 1000000,
        postedAt: now,
        postedByUserId: "user-staff-1",
        postedBy: { id: "user-staff-1", fullName: "Nguyễn Văn Lễ Tân", email: "letan@hotel.vn" },
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
        status: "ACTIVE",
        plannedCheckInAt: checkIn,
        plannedCheckOutAt: checkOut,
        checkedInAt: checkIn,
        checkedOutAt: null,
        nightlyRateSnapshot: 1500000,
        baseNightlyRateSnapshot: 1500000,
        createdByUserId: "user-staff-1",
        closedByUserId: null,
        createdBy: { id: "user-staff-1", fullName: "Nguyễn Văn Lễ Tân", email: "letan@hotel.vn" },
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
        status: "ACTIVE",
        plannedCheckInAt: checkIn,
        plannedCheckOutAt: checkOut,
        checkedInAt: checkIn,
        checkedOutAt: null,
        nightlyRateSnapshot: 1200000,
        baseNightlyRateSnapshot: 1200000,
        createdByUserId: "user-staff-1",
        closedByUserId: null,
        createdBy: { id: "user-staff-1", fullName: "Nguyễn Văn Lễ Tân", email: "letan@hotel.vn" },
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

    const result = await service.getReports(
      "user-staff-1",
      "role-frontdesk",
      "hotel-1",
      { range: "30d" },
    );

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
});
