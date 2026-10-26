import { ReservationStatus } from "@prisma/client";
import { HotelRoomsRepository } from "../../property/infrastructure/repositories/hotel-rooms.repository";

describe("KBTT Daily Movements Arrivals (AUD-09)", () => {
  it("includes CHECKED_IN arrivals, active stayId, actualCheckInAt, and preserves occupantCount from stay occupants or reservation guestCount", async () => {
    let capturedWhere: any = null;
    const checkInTime = new Date("2026-10-27T07:30:00.000Z");

    const mockPrisma: any = {
      reservation: {
        count: async ({ where }: any) => {
          capturedWhere = where;
          return 2;
        },
        findMany: async () => [
          {
            id: "res-checked-in",
            hotelId: "hotel-1",
            roomId: "room-101",
            reservationCode: "RES-101",
            groupCode: null,
            guestDisplayName: "Lê Văn C",
            guestPhone: "0909111222",
            guestCount: 2,
            status: ReservationStatus.CHECKED_IN,
            plannedCheckInAt: new Date("2026-10-27T07:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-10-28T05:00:00.000Z"),
            checkedInAt: checkInTime,
            stay: {
              id: "stay-101",
              checkedInAt: checkInTime,
              _count: {
                occupants: 3,
              },
            },
          },
          {
            id: "res-confirmed",
            hotelId: "hotel-1",
            roomId: "room-102",
            reservationCode: "RES-102",
            groupCode: "GRP-01",
            guestDisplayName: "Phạm Thị D",
            guestPhone: "0909333444",
            guestCount: 4,
            status: ReservationStatus.CONFIRMED,
            plannedCheckInAt: new Date("2026-10-27T07:00:00.000Z"),
            plannedCheckOutAt: new Date("2026-10-29T05:00:00.000Z"),
            checkedInAt: null,
            stay: null,
          },
        ],
      },
      room: {
        findMany: async () => [
          { id: "room-101", roomNumber: "101" },
          { id: "room-102", roomNumber: "102" },
        ],
      },
    };

    const repo = new HotelRoomsRepository(mockPrisma);
    const result = await repo.findDailyMovementsByHotel("hotel-1", {
      kind: "ARRIVAL",
      start: new Date("2026-10-26T17:00:00.000Z"),
      end: new Date("2026-10-27T17:00:00.000Z"),
      page: 1,
      limit: 20,
    });

    expect(capturedWhere?.AND?.[1]?.status?.in).toEqual([
      ReservationStatus.CONFIRMED,
      ReservationStatus.ARRIVAL_READY,
      ReservationStatus.CHECKED_IN,
    ]);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      reservationId: "res-checked-in",
      stayId: "stay-101",
      actualCheckInAt: checkInTime.toISOString(),
      occupantCount: 3,
      canCheckIn: false,
    });
    expect(result.items[1]).toMatchObject({
      reservationId: "res-confirmed",
      stayId: null,
      actualCheckInAt: null,
      occupantCount: 4,
      canCheckIn: true,
    });
  });
});
