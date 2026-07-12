import { NotFoundException } from "@nestjs/common";
import { EmergencyCallLifecycleStatus, EmergencyLocationConfidence } from "@prisma/client";
import { EmergencyService } from "../application/emergency.service";

describe("EmergencyService", () => {
  const createRepository = () => ({
    findLocation: jest.fn(),
    findFallbackLocation: jest.fn(),
    createCallEvent: jest.fn().mockResolvedValue({ id: "call-1" }),
    findOpenIncident: jest.fn().mockResolvedValue(null),
    createIncident: jest.fn().mockResolvedValue({ id: "incident-1" }),
    linkCallToIncident: jest.fn().mockResolvedValue(undefined),
    refreshIncidentRollup: jest.fn().mockResolvedValue({ id: "incident-1", severity: "LOW" }),
    createTimeline: jest.fn().mockResolvedValue({ id: "timeline-1" }),
    createNotification: jest.fn().mockResolvedValue({ id: "notification-1" }),
  });

  const guestContext = {
    sessionId: "session-1",
    guestSessionId: "session-1",
    tenantId: "tenant-1",
    hotelId: "hotel-1",
    roomId: "room-1",
    roomNumber: "1201",
    roomFloor: "12",
    stayGuestPhone: "+84900000000",
  };

  it("throws NotFoundException when the guest session context is missing", async () => {
    const repository = createRepository();
    const guestEmergencyContextService = {
      findBySessionId: jest.fn().mockResolvedValue(null),
    };
    const service = new EmergencyService(
      repository as never,
      guestEmergencyContextService as never,
    );

    await expect(
      service.createGuestEmergencyCall("missing-session", { dialedNumber: "112" }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.createCallEvent).not.toHaveBeenCalled();
  });

  it("creates and links an emergency call using the public guest context DTO", async () => {
    const repository = createRepository();
    repository.findLocation.mockResolvedValue({
      id: "location-1",
      dispatchableAddress: "12F, Room 1201",
    });
    const guestEmergencyContextService = {
      findBySessionId: jest.fn().mockResolvedValue(guestContext),
    };
    const service = new EmergencyService(
      repository as never,
      guestEmergencyContextService as never,
    );

    await expect(
      service.createGuestEmergencyCall("session-1", {
        dialedNumber: "112",
        callerReference: "guest-app",
        location: {
          emergencyLocationId: "location-1",
          confidence: EmergencyLocationConfidence.HIGH,
        },
        metadata: { source: "guest-home-emergency-card" },
      }),
    ).resolves.toEqual({
      callEvent: { id: "call-1" },
      incident: { id: "incident-1", severity: "LOW" },
    });

    expect(repository.createCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        sessionId: "session-1",
        emergencyLocationId: "location-1",
        callerReference: "guest-app",
        dialedNumber: "112",
        callbackNumber: "+84900000000",
        lifecycleStatus: EmergencyCallLifecycleStatus.ATTEMPTED,
        metadata: expect.objectContaining({
          roomId: "room-1",
          roomNumber: "1201",
          roomFloor: "12",
        }),
      }),
    );
    expect(repository.linkCallToIncident).toHaveBeenCalledWith("call-1", "incident-1");
    expect(repository.createNotification).toHaveBeenCalledWith(
      "incident-1",
      "call-1",
      expect.objectContaining({
        tenantId: "tenant-1",
        hotelId: "hotel-1",
        roomId: "room-1",
        roomNumber: "1201",
      }),
    );
  });
});
