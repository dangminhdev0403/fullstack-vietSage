import { GuestEmergencyContextService } from "../application/guest-emergency-context.service";

describe("GuestEmergencyContextService", () => {
  it("returns null when the guest session cannot be found", async () => {
    const prisma = {
      guestSession: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new GuestEmergencyContextService(prisma as never);

    await expect(service.findBySessionId("missing-session")).resolves.toBeNull();

    expect(prisma.guestSession.findUnique).toHaveBeenCalledWith({
      where: { id: "missing-session" },
      include: { hotel: true, room: true, stay: true },
    });
  });

  it("maps a guest session to the small Emergency context DTO", async () => {
    const prisma = {
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: "session-1",
          hotelId: "hotel-1",
          roomId: "room-1",
          hotel: { tenantId: "tenant-1", name: "Hotel" },
          room: { roomNumber: "1201", floor: "12", status: "OCCUPIED" },
          stay: { guestPhone: "+84900000000", guestDisplayName: "Guest" },
          sessionTokenHash: "not-public",
        }),
      },
    };
    const service = new GuestEmergencyContextService(prisma as never);

    await expect(service.findBySessionId("session-1")).resolves.toEqual({
      sessionId: "session-1",
      guestSessionId: "session-1",
      tenantId: "tenant-1",
      hotelId: "hotel-1",
      roomId: "room-1",
      roomNumber: "1201",
      roomFloor: "12",
      stayGuestPhone: "+84900000000",
    });
  });
});
