import { GuestStayStatus } from "@prisma/client";
import { HotelRoomsService } from "../application/hotel-rooms.service";
import { roomFilterStatusSchema } from "../domain/schemas/rooms.schema";

describe("Hotel rooms in-house filter", () => {
  it("normalizes the front-desk in-house status", () => {
    expect(roomFilterStatusSchema.parse("in_house")).toBe("IN_HOUSE");
  });

  it("filters by active stay rather than room reservation status", async () => {
    const listRooms = jest.fn().mockResolvedValue({
      total: 0,
      floors: [],
      types: [],
      totalAvailable: 0,
      byStatus: {},
      items: [],
    });
    const service = new HotelRoomsService(
      { listRooms } as never,
      {} as never,
      {
        resolveRoomScope: jest.fn().mockResolvedValue({
          hotel: { timezone: "Asia/Ho_Chi_Minh" },
          allowedRoomId: null,
          mode: "HOTEL_WIDE",
        }),
        loadActorContext: jest.fn().mockResolvedValue({
          permissions: new Set(["hotel.stays.view"]),
        }),
      } as never,
      {} as never,
    );

    await service.listRooms("user-1", "role-1", "hotel-1", {
      status: "IN_HOUSE",
      page: 1,
      limit: 20,
    } as never);

    expect(listRooms).toHaveBeenCalledWith(
      {
        hotelId: "hotel-1",
        AND: [
          {
            guestStays: {
              some: {
                status: {
                  in: [
                    GuestStayStatus.ACTIVE,
                    GuestStayStatus.CHECKED_IN,
                    GuestStayStatus.CHECKOUT_PENDING,
                  ],
                },
                checkedOutAt: null,
              },
            },
          },
        ],
      },
      0,
      20,
    );
  });

  it("searches in-house guests, reservation codes, phone numbers, and rooms", async () => {
    const listRooms = jest.fn().mockResolvedValue({
      total: 0,
      floors: [],
      types: [],
      totalAvailable: 0,
      byStatus: {},
      items: [],
    });
    const service = new HotelRoomsService(
      { listRooms } as never,
      {} as never,
      {
        resolveRoomScope: jest.fn().mockResolvedValue({
          hotel: { timezone: "Asia/Ho_Chi_Minh" },
          allowedRoomId: null,
          mode: "HOTEL_WIDE",
        }),
        loadActorContext: jest.fn().mockResolvedValue({ permissions: new Set(["hotel.stays.view"]) }),
      } as never,
      {} as never,
    );

    await service.listRooms("user-1", "role-1", "hotel-1", {
      status: "IN_HOUSE",
      q: " Minh ",
      page: 1,
      limit: 20,
    } as never);

    expect(listRooms).toHaveBeenCalledWith(
      expect.objectContaining({
        AND: expect.arrayContaining([
          {
            OR: [
              { roomNumber: { contains: "Minh", mode: "insensitive" } },
              {
                guestStays: {
                  some: {
                    status: {
                      in: [
                        GuestStayStatus.ACTIVE,
                        GuestStayStatus.CHECKED_IN,
                        GuestStayStatus.CHECKOUT_PENDING,
                      ],
                    },
                    checkedOutAt: null,
                    OR: [
                      { guestDisplayName: { contains: "Minh", mode: "insensitive" } },
                      { guestPhone: { contains: "Minh" } },
                      { reservationCode: { contains: "Minh", mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          },
        ]),
      }),
      0,
      20,
    );
  });

  it("searches guest stays, occupants, reservations, and room numbers when status is omitted", async () => {
    const listRooms = jest.fn().mockResolvedValue({
      total: 0,
      floors: [],
      types: [],
      totalAvailable: 0,
      byStatus: {},
      items: [],
    });
    const service = new HotelRoomsService(
      { listRooms } as never,
      {} as never,
      {
        resolveRoomScope: jest.fn().mockResolvedValue({
          hotel: { timezone: "Asia/Ho_Chi_Minh" },
          allowedRoomId: null,
          mode: "HOTEL_WIDE",
        }),
        loadActorContext: jest.fn().mockResolvedValue({ permissions: new Set(["hotel.stays.view"]) }),
      } as never,
      {} as never,
    );

    await service.listRooms("user-1", "role-1", "hotel-1", {
      q: "Lan",
      page: 1,
      limit: 20,
    } as never);

    expect(listRooms).toHaveBeenCalledWith(
      expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { roomNumber: { contains: "Lan", mode: "insensitive" } },
              expect.objectContaining({
                guestStays: expect.any(Object),
              }),
              expect.objectContaining({
                reservations: expect.any(Object),
              }),
            ]),
          }),
        ]),
      }),
      0,
      20,
    );
  });
});

