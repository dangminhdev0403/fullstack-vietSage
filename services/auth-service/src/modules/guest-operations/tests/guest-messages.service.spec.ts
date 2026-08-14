import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { GuestStayStatus } from "@prisma/client";
import { GuestMessagesRepository } from "../infrastructure/repositories/guest-messages.repository";
import { GuestMessagesService } from "../application/guest-messages.service";
import type { GuestSessionContext } from "../application/guest-os.service";

describe("GuestMessagesService Reliability and Unread Badges TDD", () => {
  let repository: any;
  let hotelAccessService: any;
  let eventPublisher: any;
  let service: GuestMessagesService;

  const mockContext: GuestSessionContext = {
    sessionId: "sess-123",
    hotelId: "hotel-1",
    roomId: "room-1",
    stayId: "stay-123",
    status: "ACTIVE",
    expiresAt: new Date("2026-08-05T12:00:00.000Z"),
    deviceFingerprintHash: "fp-hash-456",
  };

  beforeEach(() => {
    repository = {
      isActiveStay: jest.fn().mockResolvedValue(true),
      listGuestMessages: jest.fn(),
      appendGuestMessage: jest.fn(),
      listHotelThreads: jest.fn(),
      getHotelThread: jest.fn(),
      markReadForStaff: jest.fn(),
      markReadForGuest: jest.fn(),
      getStaffUnreadSummary: jest.fn(),
      getGuestUnreadSummary: jest.fn(),
      findGuestMessageByClientMessageId: jest.fn(),
      countRecentGuestMessages: jest.fn().mockResolvedValue(0),
      appendGuestMessageAtomic: jest.fn(),
    };
    hotelAccessService = {
      assertHotelAccess: jest.fn().mockResolvedValue(undefined),
    };
    eventPublisher = {
      publishGuestMessageCreated: jest.fn(),
      publishConversationClosed: jest.fn(),
    };

    service = new GuestMessagesService(repository, hotelAccessService, eventPublisher);
  });

  describe("1. Staff & Guest Unread Summaries", () => {
    it("returns staff unread count filtered by exact hotel and active stay", async () => {
      repository.getStaffUnreadSummary.mockResolvedValue({ unreadCount: 5 });

      const result = await service.getStaffUnreadSummary("user-1", "role-1", "hotel-1");

      expect(hotelAccessService.assertHotelAccess).toHaveBeenCalledWith(
        "user-1",
        "role-1",
        "hotel-1",
      );
      expect(repository.getStaffUnreadSummary).toHaveBeenCalledWith("hotel-1");
      expect(result).toEqual({ unreadCount: 5 });
    });

    it("returns guest unread count filtered by exact active stay", async () => {
      repository.getGuestUnreadSummary.mockResolvedValue({ unreadCount: 2 });

      const result = await service.getGuestUnreadSummary(mockContext);

      expect(repository.isActiveStay).toHaveBeenCalledWith("stay-123", "hotel-1");
      expect(repository.getGuestUnreadSummary).toHaveBeenCalledWith("stay-123", "hotel-1");
      expect(result).toEqual({ unreadCount: 2 });
    });

    it("rejects unread summary query if guest stay is inactive/checked out", async () => {
      repository.isActiveStay.mockResolvedValue(false);

      await expect(service.getGuestUnreadSummary(mockContext)).rejects.toThrow(BadRequestException);
    });
  });

  describe("2. Watermark Mark-Read (readThroughMessageId)", () => {
    it("rejects staff mark-read without a watermark", async () => {
      repository.getHotelThread.mockResolvedValue({
        thread: { id: "t-1", stay: { status: GuestStayStatus.ACTIVE, checkedOutAt: null } },
      });
      await expect(
        service.markReadForHotel("user-1", "role-1", "hotel-1", "t-1", undefined),
      ).rejects.toThrow(BadRequestException);
      expect(repository.markReadForStaff).not.toHaveBeenCalled();
    });

    it("rejects guest mark-read without a watermark", async () => {
      await expect(service.markReadForGuest(mockContext, undefined)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.markReadForGuest).not.toHaveBeenCalled();
    });

    it("staff marks read up to readThroughMessageId pivot without marking later messages read", async () => {
      repository.getHotelThread.mockResolvedValue({
        thread: { id: "t-1", stay: { status: GuestStayStatus.ACTIVE, checkedOutAt: null } },
      });
      repository.markReadForStaff.mockResolvedValue({ count: 3 });

      const result = await service.markReadForHotel(
        "user-1",
        "role-1",
        "hotel-1",
        "t-1",
        "msg-pivot",
      );

      expect(repository.markReadForStaff).toHaveBeenCalledWith("hotel-1", "t-1", "msg-pivot");
      expect(result).toEqual({ read: true, updatedCount: 3 });
    });

    it("guest marks read up to readThroughMessageId pivot", async () => {
      repository.markReadForGuest.mockResolvedValue({ count: 2 });

      const result = await service.markReadForGuest(mockContext, "msg-guest-pivot");

      expect(repository.markReadForGuest).toHaveBeenCalledWith(
        "hotel-1",
        "stay-123",
        "msg-guest-pivot",
      );
      expect(result).toEqual({ read: true, updatedCount: 2 });
    });
  });

  describe("3. ClientMessageId and Idempotent Retry", () => {
    it("guest send requires clientMessageId", async () => {
      await expect(service.sendFromGuest(mockContext, "Hello", new Date(), "")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("idempotent retry returns existing message without duplicate event publishing", async () => {
      const existingMsg = {
        thread: { id: "t-1", stayId: "stay-123", room: {}, stay: {} },
        message: { id: "msg-existing", body: "Hello retry", createdAt: new Date() },
      };
      repository.appendGuestMessageAtomic.mockResolvedValue({
        kind: "existing",
        value: existingMsg,
      });

      const response = await service.sendFromGuest(
        mockContext,
        "Hello retry",
        new Date(),
        "client-msg-001",
      );

      expect(repository.appendGuestMessageAtomic).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "sess-123", clientMessageId: "client-msg-001" }),
      );
      expect(repository.appendGuestMessage).not.toHaveBeenCalled();
      expect(eventPublisher.publishGuestMessageCreated).not.toHaveBeenCalled();
      expect(response).toBeDefined();
      expect(response.message.id).toBe("msg-existing");
    });

    it("uses one atomic repository operation for idempotency, rate limit and insert", async () => {
      repository.findGuestMessageByClientMessageId.mockResolvedValue(null);
      repository.appendGuestMessageAtomic.mockResolvedValue({
        kind: "created",
        value: {
          thread: { id: "thread-atomic", stayId: "stay-123", room: {}, stay: {} },
          message: { id: "msg-atomic", body: "Atomic", createdAt: new Date() },
        },
      });

      await service.sendFromGuest(mockContext, "Atomic", new Date(), "client-atomic");

      expect(repository.appendGuestMessageAtomic).toHaveBeenCalledWith(
        expect.objectContaining({
          stayId: "stay-123",
          sessionId: "sess-123",
          deviceFingerprintHash: "fp-hash-456",
          clientMessageId: "client-atomic",
        }),
      );
      expect(repository.countRecentGuestMessages).not.toHaveBeenCalled();
      expect(repository.appendGuestMessage).not.toHaveBeenCalled();
    });
  });

  describe("4. Rate Limiting", () => {
    it("throws 429 with Retry-After header when rate limit exceeded, without writing DB or publishing event", async () => {
      repository.appendGuestMessageAtomic.mockResolvedValue({
        kind: "rate-limited",
        retryAfterSeconds: 60,
      });

      let thrownError: any = null;
      try {
        await service.sendFromGuest(mockContext, "Spam message", new Date(), "client-msg-spam");
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(HttpException);
      expect(thrownError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(repository.appendGuestMessage).not.toHaveBeenCalled();
      expect(eventPublisher.publishGuestMessageCreated).not.toHaveBeenCalled();
    });

    it("returns 429 from the atomic decision without publishing an event", async () => {
      repository.findGuestMessageByClientMessageId.mockResolvedValue(null);
      repository.appendGuestMessageAtomic.mockResolvedValue({
        kind: "rate-limited",
        retryAfterSeconds: 27,
      });

      await expect(
        service.sendFromGuest(mockContext, "Spam", new Date(), "client-rate"),
      ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
      expect(eventPublisher.publishGuestMessageCreated).not.toHaveBeenCalled();
    });
  });

  describe("5. Event Envelope Structure", () => {
    it("includes eventId, messageId, hotelId, stayId, threadId in event envelope when message is published", async () => {
      repository.appendGuestMessageAtomic.mockResolvedValue({
        kind: "created",
        value: {
          thread: { id: "thread-999", stayId: "stay-123", room: {}, stay: {} },
          message: { id: "msg-999", body: "Valid", createdAt: new Date() },
        },
      });

      await service.sendFromGuest(mockContext, "Valid", new Date(), "client-msg-999");

      expect(eventPublisher.publishGuestMessageCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: expect.any(String),
          messageId: "msg-999",
          hotelId: "hotel-1",
          stayId: "stay-123",
          threadId: "thread-999",
        }),
      );
    });
  });

  describe("6. Checkout Conversation Close Isolation", () => {
    it("rejects guest operations when stay is inactive or checked out", async () => {
      repository.isActiveStay.mockResolvedValue(false);

      await expect(service.listForGuest(mockContext)).rejects.toThrow(BadRequestException);
      await expect(service.markReadForGuest(mockContext)).rejects.toThrow(BadRequestException);
    });
  });

  describe("7. Repository Pivot Fail-Closed and Post-Pivot Concurrency", () => {
    it("returns zero updates when readThroughMessageId pivot is invalid or not found", async () => {
      const mockPrisma: any = {
        guestMessage: {
          findFirst: jest.fn().mockResolvedValue(null),
          updateMany: jest.fn(),
        },
      };
      const realRepo = new GuestMessagesRepository(mockPrisma);

      const staffResult = await realRepo.markReadForStaff("hotel-1", "t-1", "invalid-pivot");
      expect(staffResult).toEqual({ count: 0 });
      expect(mockPrisma.guestMessage.updateMany).not.toHaveBeenCalled();

      const guestResult = await realRepo.markReadForGuest("hotel-1", "stay-123", "invalid-pivot");
      expect(guestResult).toEqual({ count: 0 });
      expect(mockPrisma.guestMessage.updateMany).not.toHaveBeenCalled();
    });

    it("marks read up to pivot message and excludes post-pivot messages", async () => {
      const pivotDate = new Date("2026-08-02T08:00:00.000Z");
      const mockPrisma: any = {
        guestMessage: {
          findFirst: jest.fn().mockResolvedValue({ id: "msg-pivot", createdAt: pivotDate }),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      const realRepo = new GuestMessagesRepository(mockPrisma);

      const result = await realRepo.markReadForStaff("hotel-1", "t-1", "msg-pivot");
      expect(result).toEqual({ count: 2 });
      expect(mockPrisma.guestMessage.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          threadId: "t-1",
          OR: [
            { createdAt: { lt: pivotDate } },
            { createdAt: pivotDate, id: { lte: "msg-pivot" } },
          ],
        }),
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
