import { ChannelManagerService } from "./services/channel-manager.service";
import { AriCoreService } from "./services/ari-core.service";
import { IcalService } from "./services/ical.service";

describe("ChannelManager Module Core Services", () => {
  describe("ChannelManagerService", () => {
    let service: ChannelManagerService;
    let mockPrisma: any;
    let mockIcalService: any;

    beforeEach(() => {
      mockPrisma = {
        channelConnection: {
          create: jest.fn(),
          findMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        channelRoomMapping: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
        },
        $transaction: jest.fn(async (cb) => cb(mockPrisma)),
      };
      mockIcalService = {
        syncInboundIcal: jest.fn(),
        generateOutboundIcal: jest.fn(),
      };
      service = new ChannelManagerService(mockPrisma, mockIcalService);
    });

    it("tạo kết nối kênh thành công với outboundToken tự sinh", async () => {
      const hotelId = "hotel_123";
      const dto = {
        channelCode: "AIRBNB_ICAL" as const,
        title: "Airbnb Villa",
        inboundIcalUrl: "https://airbnb.com/calendar.ics",
        priceMultiplier: 1.15,
        roomMappings: [
          {
            roomId: "room_1",
            roomType: "VILLA",
            channelRoomCode: "ab_1",
            channelRoomName: "Villa Master",
          },
        ],
      };

      mockPrisma.channelConnection.create.mockResolvedValue({
        id: "conn_1",
        hotelId,
        channelCode: dto.channelCode,
        title: dto.title,
        outboundToken: "abcdef123456",
        priceMultiplier: dto.priceMultiplier,
        roomMappings: dto.roomMappings,
      });

      const result = await service.createConnection(hotelId, dto);

      expect(mockPrisma.channelConnection.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("conn_1");
      expect(result.channelCode).toBe("AIRBNB_ICAL");
    });

    it("lấy danh sách kết nối theo hotelId sắp xếp mới nhất", async () => {
      const hotelId = "hotel_123";
      mockPrisma.channelConnection.findMany.mockResolvedValue([
        { id: "conn_1", hotelId, title: "Booking.com" },
      ]);

      const result = await service.getConnections(hotelId);

      expect(mockPrisma.channelConnection.findMany).toHaveBeenCalledWith({
        where: { hotelId },
        include: {
          roomMappings: true,
          syncLogs: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe("AriCoreService", () => {
    let service: AriCoreService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        room: { findMany: jest.fn() },
        reservation: { findMany: jest.fn() },
        channelDailyAvailability: { findMany: jest.fn(), upsert: jest.fn() },
        channelDailyRestriction: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
      };
      service = new AriCoreService(mockPrisma);
    });

    it("không sinh hạng phòng hoặc giá giả khi DB rỗng", async () => {
      mockPrisma.room.findMany.mockResolvedValue([]);
      mockPrisma.reservation.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelDailyRestriction.findMany.mockResolvedValue([]);

      const result = await service.getInventoryGrid("hotel_1", "2026-10-01", "2026-10-02");

      expect(result.roomTypes).toEqual([]);
    });

    it("collapseDateRanges gộp chính xác các ngày liên tiếp có cùng giá trị", () => {
      const items = [
        { date: "2026-10-01", rate: 1000000, stopSell: false },
        { date: "2026-10-02", rate: 1000000, stopSell: false },
        { date: "2026-10-03", rate: 1000000, stopSell: false },
        { date: "2026-10-05", rate: 1200000, stopSell: true },
      ];

      const collapsed = service.collapseDateRanges(items);

      expect(collapsed).toHaveLength(2);
      expect(collapsed[0]).toEqual({
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        data: { rate: 1000000, stopSell: false },
      });
      expect(collapsed[1]).toEqual({
        startDate: "2026-10-05",
        endDate: "2026-10-05",
        data: { rate: 1200000, stopSell: true },
      });
    });

    it("updateAvailability cập nhật và tính toán availableRooms chính xác", async () => {
      mockPrisma.channelDailyAvailability.upsert.mockResolvedValue({});

      const result = await service.updateAvailability("hotel_1", [
        {
          roomType: "DELUXE",
          date: "2026-10-01",
          totalRooms: 10,
          bookedRooms: 3,
          blockedRooms: 2,
        },
      ]);

      expect(mockPrisma.channelDailyAvailability.upsert).toHaveBeenCalledTimes(1);
      const callArg = mockPrisma.channelDailyAvailability.upsert.mock.calls[0][0];
      expect(callArg.create.availableRooms).toBe(5); // 10 - 3 - 2
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });

    it("bulkUpdateRestrictions chỉ cập nhật các ngày thuộc thứ trong tuần được chọn", async () => {
      mockPrisma.channelDailyRestriction.upsert.mockResolvedValue({});
      mockPrisma.channelDailyRestriction.findUnique.mockResolvedValue(null);

      // 2026-10-01 là Thứ Năm (day 4), 2026-10-02 là Thứ Sáu (day 5), 2026-10-03 là Thứ Bảy (day 6)
      const result = await service.bulkUpdateRestrictions("hotel_1", {
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        roomTypes: ["DELUXE"],
        daysOfWeek: [5], // Chỉ thứ 6 (2026-10-02)
        rate: 1500000,
        minStayArrival: 2,
      });

      expect(result.success).toBe(true);
      expect(result.updatedDatesCount).toBe(1);
      expect(mockPrisma.channelDailyRestriction.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("IcalService", () => {
    let service: IcalService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        channelConnection: { findUnique: jest.fn(), update: jest.fn() },
        channelSyncLog: { create: jest.fn() },
        reservation: { findMany: jest.fn() },
        channelDailyAvailability: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
      };
      service = new IcalService(mockPrisma);
    });

    it("parseIcalFeed trích xuất đúng các VEVENT từ chuỗi iCal chuẩn", () => {
      const icalSample = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:airbnb_res_123@airbnb.com",
        "DTSTART;VALUE=DATE:20261010",
        "DTEND;VALUE=DATE:20261015",
        "SUMMARY:Reserved - John Doe",
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:cancelled_res_456@airbnb.com",
        "DTSTART;VALUE=DATE:20261016",
        "DTEND;VALUE=DATE:20261018",
        "SUMMARY:Cancelled Booking",
        "STATUS:CANCELLED",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      const events = service.parseIcalFeed(icalSample);

      expect(events).toHaveLength(1); // event cancelled bị bỏ qua
      expect(events[0]).toEqual({
        uid: "airbnb_res_123@airbnb.com",
        startDate: "2026-10-10",
        endDate: "2026-10-15",
        summary: "Reserved - John Doe",
        status: "CONFIRMED",
      });
    });

    it("generateOutboundIcal tạo file iCal chuẩn RFC 5545", async () => {
      mockPrisma.channelConnection.findUnique.mockResolvedValue({
        id: "conn_1",
        hotelId: "hotel_1",
        title: "Airbnb Calendar",
        status: "ACTIVE",
        roomMappings: [],
      });
      mockPrisma.reservation.findMany.mockResolvedValue([
        {
          id: "res_1",
          reservationCode: "RC001",
          guestDisplayName: "Nguyen Van A",
          plannedCheckInAt: new Date("2026-10-01T14:00:00.000Z"),
          plannedCheckOutAt: new Date("2026-10-03T12:00:00.000Z"),
          roomId: "room_1",
        },
      ]);
      mockPrisma.channelDailyAvailability.findMany.mockResolvedValue([]);
      mockPrisma.channelSyncLog.create.mockResolvedValue({});

      const icalContent = await service.generateOutboundIcal("hotel_1", "valid_token");

      expect(icalContent).toContain("BEGIN:VCALENDAR");
      expect(icalContent).toContain("VERSION:2.0");
      expect(icalContent).toContain("X-WR-CALNAME:VietSage - Airbnb Calendar");
      expect(icalContent).toContain("BEGIN:VEVENT");
      expect(icalContent).toContain("UID:res-res_1@vietsage.com");
      expect(icalContent).toContain("SUMMARY:Reserved - VietSage (RC001)");
      expect(icalContent).toContain("END:VCALENDAR");
    });
  });
});
