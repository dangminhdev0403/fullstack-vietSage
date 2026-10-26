import { ReservationStatus } from "@prisma/client";
import { ReservationsService } from "./reservations.service";
import { ReservationsRepository } from "../infrastructure/repositories/reservations.repository";

describe("ReservationsService & ReservationsRepository (AUD-04, AUD-10)", () => {
  it("includes activeStayId, guestCount, and group room details in getGroupDetails / findGroupByCode", async () => {
    const mockPrisma: any = {
      reservationGroup: {
        findUnique: async () => ({
          id: "grp-1",
          hotelId: "hotel-1",
          groupCode: "GRP-001",
          groupName: "Đoàn Công Ty A",
          leadGuestName: "Nguyễn Văn A",
          leadGuestPhone: "0901234567",
          notes: "Ghi chú đoàn",
          createdAt: new Date("2026-10-20T00:00:00.000Z"),
          updatedAt: new Date("2026-10-20T00:00:00.000Z"),
        }),
      },
      reservation: {
        findMany: async () => [
          {
            id: "res-1",
            hotelId: "hotel-1",
            reservationCode: "RES-001",
            groupCode: "GRP-001",
            roomId: "room-101",
            roomTypeId: "rt-dlx",
            guestDisplayName: "Nguyễn Văn A",
            guestPhone: "0901234567",
            guestCount: 3,
            status: ReservationStatus.CHECKED_IN,
            plannedCheckInAt: new Date("2026-10-25T07:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-10-27T05:00:00.000Z"),
            nightlyRateSnapshot: "1500000.00",
            baseNightlyRateSnapshot: "1500000.00",
            notes: "Tầng cao",
            room: { id: "room-101", roomNumber: "101", price: "1500000.00" },
            roomType: {
              id: "rt-dlx",
              name: "Deluxe",
              normalizedKey: "deluxe",
              basePrice: "1500000.00",
            },
            stay: {
              id: "stay-active-1",
              roomId: "room-101",
              status: "ACTIVE",
            },
            createdAt: new Date("2026-10-20T00:00:00.000Z"),
            updatedAt: new Date("2026-10-20T00:00:00.000Z"),
          },
        ],
      },
    };

    const repo = new ReservationsRepository(mockPrisma);
    const mockHotelAccess: any = {
      assertHotelAccess: async () => ({ id: "hotel-1", tenantId: "tenant-1" }),
    };
    const mockCodes: any = {};
    const service = new ReservationsService(repo, mockCodes, mockHotelAccess);

    const details = await service.getGroupDetails("user-1", "role-1", "hotel-1", "GRP-001");

    expect(details.rooms).toHaveLength(1);
    expect(details.rooms[0]).toMatchObject({
      reservationId: "res-1",
      reservationCode: "RES-001",
      activeStayId: "stay-active-1",
      stayId: "stay-active-1",
      assignedRoomId: "room-101",
      assignedRoomNumber: "101",
      roomTypeId: "rt-dlx",
      roomTypeCode: "deluxe",
      guestCount: 3,
      ratePerNight: 1500000,
      nights: 2,
      totalAmount: 3000000,
      specialRequests: "Tầng cao",
    });
  });

  it("overrides hotel confirmation details with active confirmationTemplate when present (AUD-10)", async () => {
    const mockRepo: any = {
      findReservationConfirmation: async () => ({
        id: "res-1",
        hotelId: "hotel-1",
        reservationCode: "RES-001",
        status: ReservationStatus.CONFIRMED,
        guestDisplayName: "Trần Thị B",
        guestPhone: "0912345678",
        guestCount: 2,
        plannedCheckInAt: new Date("2026-10-25T07:00:00.000Z"),
        plannedCheckOutAt: new Date("2026-10-26T05:00:00.000Z"),
        nightlyRateSnapshot: "1200000.00",
        hotel: {
          id: "hotel-1",
          name: "Khách sạn Sao Mai",
          code: "SAOMAI",
          timezone: "Asia/Ho_Chi_Minh",
          brandSettings: {
            address: "Địa chỉ Brand",
            phone: "0280000000",
            email: "brand@saomai.vn",
            checkInTime: "14:00",
            checkOutTime: "12:00",
            cancellationPolicy: "Chính sách hủy Brand",
          },
          confirmationTemplates: [
            {
              id: "tpl-1",
              isActive: true,
              isDefault: true,
              hotelAddress: "123 Nguyễn Huệ, Quận 1, TP.HCM",
              hotelPhone: "02899998888",
              hotelEmail: "booking@saomai.vn",
              checkInTimeText: "15:00",
              checkOutTimeText: "11:30",
              cancellationPolicyText: "Miễn phí hủy trước 48 giờ theo mẫu xác nhận.",
              footerNoteText: "Cảm ơn quý khách đã lựa chọn Khách sạn Sao Mai.",
            },
          ],
        },
        chargeLines: [],
        bookingPayments: [],
      }),
    };

    const mockHotelAccess: any = {
      assertHotelAccess: async () => ({ id: "hotel-1", tenantId: "tenant-1" }),
    };
    const service = new ReservationsService(mockRepo, {} as any, mockHotelAccess);

    const confirmation = await service.getReservationConfirmation(
      "user-1",
      "role-1",
      "hotel-1",
      "res-1",
    );

    expect(confirmation.hotel.address).toBe("123 Nguyễn Huệ, Quận 1, TP.HCM");
    expect(confirmation.hotel.phone).toBe("02899998888");
    expect(confirmation.hotel.email).toBe("booking@saomai.vn");
    expect(confirmation.hotel.checkInTimePolicy).toBe("15:00");
    expect(confirmation.hotel.checkOutTimePolicy).toBe("11:30");
    expect(confirmation.policies.checkInTime).toBe("15:00");
    expect(confirmation.policies.checkOutTime).toBe("11:30");
    expect(confirmation.policies.cancellationPolicy).toBe(
      "Miễn phí hủy trước 48 giờ theo mẫu xác nhận.",
    );
    expect(confirmation.policies.footerNoteText).toBe(
      "Cảm ơn quý khách đã lựa chọn Khách sạn Sao Mai.",
    );
  });
});
