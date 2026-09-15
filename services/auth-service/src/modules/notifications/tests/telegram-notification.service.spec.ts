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

  describe("KBTT auto-submit summary notification", () => {
    it("formats summary message with HTML escaping and counts", () => {
      const service = new TelegramNotificationService({} as never, { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never);
      const msg = service.formatKbttSummaryMessage({
        hotelName: "Khách sạn Sài Gòn <Test>",
        scheduledTime: "2026-09-15 04:30:00",
        totalEligible: 10,
        successCount: 8,
        failureCount: 1,
        unknownCount: 1,
        isDryRun: true,
      });

      expect(msg).toContain("🧪 [DRY RUN - THỬ NGHIỆM]");
      expect(msg).toContain("Khách sạn Sài Gòn &lt;Test&gt;");
      expect(msg).toContain("Tổng số hồ sơ đủ điều kiện: <b>10</b>");
      expect(msg).toContain("Thành công: <b>8</b> ✅");
      expect(msg).toContain("Thất bại / Lỗi nghiệp vụ: <b>1</b> ❌");
      expect(msg).toContain("Chưa rõ trạng thái (Timeout): <b>1</b> ⚠️");
    });

    it("sends message to dedicated KBTT route if configured", async () => {
      const prisma = {
        notificationRoute: {
          findFirst: jest.fn().mockResolvedValue({
            id: "route-kbtt",
            telegramChatId: "-100123456789",
            purpose: "KBTT_AUTO_SUBMIT",
          }),
        },
      };
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const service = new TelegramNotificationService(prisma as never, logger as never);
      const callTelegramSpy = jest.spyOn(service as any, "callTelegram").mockResolvedValue({ ok: true });

      const sent = await service.sendKbttAutoSubmitSummary("hotel-1", {
        hotelName: "Grand Hotel",
        scheduledTime: "2026-09-15 04:30:00",
        totalEligible: 5,
        successCount: 5,
        failureCount: 0,
        unknownCount: 0,
        isDryRun: false,
      });

      expect(sent).toBe(true);
      expect(prisma.notificationRoute.findFirst).toHaveBeenCalledWith({
        where: { hotelId: "hotel-1", isActive: true, purpose: "KBTT_AUTO_SUBMIT" },
      });
      expect(callTelegramSpy).toHaveBeenCalledWith("sendMessage", {
        chat_id: "-100123456789",
        text: expect.stringContaining("🚀 [TỰ ĐỘNG NỘP C06 BCA]"),
        parse_mode: "HTML",
      });
    });

    it("returns false and logs warning if no route exists", async () => {
      const prisma = {
        notificationRoute: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const service = new TelegramNotificationService(prisma as never, logger as never);

      const sent = await service.sendKbttAutoSubmitSummary("hotel-1", {
        hotelName: "Grand Hotel",
        scheduledTime: "2026-09-15 04:30:00",
        totalEligible: 5,
        successCount: 5,
        failureCount: 0,
        unknownCount: 0,
        isDryRun: false,
      });

      expect(sent).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});

