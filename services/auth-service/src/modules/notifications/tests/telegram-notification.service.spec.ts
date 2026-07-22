import { DomainEventStatus, GuestRequestActorType, GuestRequestStatus } from "@prisma/client";
import { TelegramNotificationService } from "../application/telegram-notification.service";

describe("TelegramNotificationService request acknowledgement", () => {
  it("writes the canonical status, timeline event, and domain event atomically", async () => {
    const updatedRequest = {
      id: "request-1",
      hotelId: "hotel-1",
      sessionId: "session-1",
      status: GuestRequestStatus.ACKNOWLEDGED,
      confirmedBy: "Front Desk",
      confirmedAt: new Date("2026-07-14T10:00:00.000Z"),
      quantity: 1,
      description: null,
      title: "Extra towel",
      createdAt: new Date("2026-07-14T09:59:00.000Z"),
      serviceItem: null,
      hotel: { tenantId: "tenant-1" },
      room: { roomNumber: "101" },
    };
    const tx = {
      guestRequest: {
        findUnique: jest.fn().mockResolvedValue({
          status: GuestRequestStatus.NEW,
          hotelId: "hotel-1",
          hotel: { tenantId: "tenant-1" },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestRequestEvent: {
        create: jest.fn().mockResolvedValue({ id: "event-1" }),
      },
      domainEvent: {
        create: jest.fn().mockResolvedValue({ id: "domain-event-1" }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
      guestRequest: {
        findUnique: jest.fn().mockResolvedValue(updatedRequest),
      },
      guestRequestNotification: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const publisher = {
      publishGuestRequestCreated: jest.fn(),
      publishGuestRequestUpdated: jest.fn(),
      publishGuestMessageCreated: jest.fn(),
      publishConversationClosed: jest.fn(),
    };
    const service = new TelegramNotificationService(prisma as never, logger as never, publisher);
    jest.spyOn(service, "answerCallbackQuery").mockResolvedValue();

    await service.handleCallback({
      id: "callback-1",
      data: "guest_request:confirm:request-1",
      from: { first_name: "Front", last_name: "Desk" },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.guestRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-1",
        status: { in: [GuestRequestStatus.CREATED, GuestRequestStatus.NEW] },
      },
      data: expect.objectContaining({
        status: GuestRequestStatus.ACKNOWLEDGED,
        confirmedBy: "Front Desk",
        confirmedAt: expect.any(Date),
      }),
    });
    expect(tx.guestRequestEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: "request-1",
        hotelId: "hotel-1",
        actorType: GuestRequestActorType.SYSTEM,
        eventType: "REQUEST_UPDATED",
        fromStatus: GuestRequestStatus.NEW,
        toStatus: GuestRequestStatus.ACKNOWLEDGED,
      }),
    });
    expect(tx.domainEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "REQUEST_UPDATED",
        aggregateType: "GuestRequest",
        aggregateId: "request-1",
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        payload: {
          requestId: "request-1",
          fromStatus: GuestRequestStatus.NEW,
          toStatus: GuestRequestStatus.ACKNOWLEDGED,
          source: "TELEGRAM",
        },
        status: DomainEventStatus.PENDING,
      }),
    });
  });
});
