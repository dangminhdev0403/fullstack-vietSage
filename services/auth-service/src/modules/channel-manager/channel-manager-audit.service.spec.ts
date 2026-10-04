process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "mock_jwt_access_secret_32_chars_long!!";
process.env.JWT_REFRESH_SECRET = "mock_jwt_refresh_secret_32_chars_long!";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";

import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import { ChannelManagerController } from "./controllers/channel-manager.controller";
import { ChannelManagerAuditService } from "./services/channel-manager-audit.service";

describe("ChannelManagerAuditService", () => {
  let service: ChannelManagerAuditService;
  let prisma: {
    auditLog: { create: jest.Mock };
    hotel: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "audit-1", ...data })),
      },
      hotel: {
        findUnique: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelManagerAuditService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ChannelManagerAuditService>(ChannelManagerAuditService);
  });

  describe("Actor and Tenant Attribution", () => {
    it("records audit entry with correct actorId, tenantId, action, and entity", async () => {
      await service.record({
        actorId: "user-123",
        tenantId: "tenant-456",
        action: "CHANNEX_CONTENT_SYNC",
        entityType: "Hotel",
        entityId: "hotel-789",
        metadata: { roomTypesCount: 5 },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: "user-123",
          tenantId: "tenant-456",
          action: "CHANNEX_CONTENT_SYNC",
          entityType: "Hotel",
          entityId: "hotel-789",
          metadata: { roomTypesCount: 5 },
        },
      });
    });

    it("resolves tenantId from hotel when using recordHotelAction", async () => {
      await service.recordHotelAction({
        actorId: "user-admin",
        hotelId: "hotel-1",
        action: "CHANNEX_PROPERTY_CONFIGURE",
        metadata: { channexPropertyId: "prop-uuid" },
      });

      expect(prisma.hotel.findUnique).toHaveBeenCalledWith({
        where: { id: "hotel-1" },
        select: { id: true, tenantId: true },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: "user-admin",
          tenantId: "tenant-1",
          action: "CHANNEX_PROPERTY_CONFIGURE",
          entityType: "Hotel",
          entityId: "hotel-1",
          metadata: { channexPropertyId: "prop-uuid" },
        },
      });
    });

    it("throws NotFoundException when hotel does not exist during recordHotelAction", async () => {
      prisma.hotel.findUnique.mockResolvedValue(null);

      await expect(
        service.recordHotelAction({
          actorId: "user-admin",
          hotelId: "hotel-missing",
          action: "CHANNEX_PROPERTY_CONFIGURE",
        }),
      ).rejects.toThrow("Không tìm thấy khách sạn hotel-missing");
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe("Payload Redaction and Sanitization", () => {
    it("redacts sensitive fields like apiKey, token, secret, webhookSecret, iframeUrl, password, credentials", async () => {
      await service.record({
        actorId: "user-1",
        tenantId: "tenant-1",
        action: "CHANNEX_CHANNEL_CREATE",
        entityType: "ChannexChannel",
        entityId: "chan-1",
        metadata: {
          apiKey: "channex-live-key-xyz",
          api_key: "channex-key-2",
          sessionToken: "secret-token-abc",
          webhookSecret: "super-secret-webhook",
          iframeUrl: "https://channex.io/session/one-time-url",
          password: "my-password",
          credentials: { secret: "nested-secret" },
          safeField: "safe-value",
        },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: {
            apiKey: "[REDACTED]",
            api_key: "[REDACTED]",
            sessionToken: "[REDACTED]",
            webhookSecret: "[REDACTED]",
            iframeUrl: "[REDACTED]",
            password: "[REDACTED]",
            credentials: "[REDACTED]",
            safeField: "safe-value",
          },
        }),
      });
    });

    it("sanitizes Error instances to safe shape without leaking raw error object", () => {
      const err = new Error("Something sensitive happened in DB query");
      const sanitized = service.sanitizeMetadata({ error: err });
      expect(sanitized).toEqual({
        error: {
          name: "Error",
          message: "Something sensitive happened in DB query",
        },
      });
    });
  });

  describe("Observable Audit Failure", () => {
    it("bubbles audit creation failure without suppressing the error", async () => {
      prisma.auditLog.create.mockRejectedValue(new Error("Database connection dropped"));

      await expect(
        service.record({
          actorId: "user-1",
          tenantId: "tenant-1",
          action: "CHANNEX_CHANNEL_DELETE",
          entityType: "ChannexChannel",
          entityId: "chan-1",
        }),
      ).rejects.toThrow("Database connection dropped");
    });
  });
});

describe("ChannelManagerController Behavioral Audit Contract", () => {
  const req = { user: { userId: "user-operator", roleId: "role-admin" } };
  let mockHotelAccessService: { assertHotelAccess: jest.Mock };
  let mockChannexSyncService: { syncContent: jest.Mock; configureProperty: jest.Mock };
  let mockChannexBookingIngestionService: { drainFeed: jest.Mock; recoverOutage: jest.Mock };
  let mockChannexChannelSessionService: { createNativeChannel: jest.Mock };
  let mockAuditService: { recordHotelAction: jest.Mock };
  let controller: ChannelManagerController;

  beforeEach(() => {
    mockHotelAccessService = {
      assertHotelAccess: jest.fn().mockResolvedValue(undefined),
    };
    mockChannexSyncService = {
      syncContent: jest.fn(),
      configureProperty: jest.fn(),
    };
    mockChannexBookingIngestionService = {
      drainFeed: jest.fn(),
      recoverOutage: jest.fn(),
    };
    mockChannexChannelSessionService = {
      createNativeChannel: jest.fn(),
    };
    mockAuditService = {
      recordHotelAction: jest.fn().mockResolvedValue({ id: "audit-1" }),
    };

    controller = new ChannelManagerController(
      {} as never, // channelManagerService
      {} as never, // ariCoreService
      {} as never, // icalService
      mockChannexSyncService as never,
      {} as never, // channexAriSyncService
      mockChannexBookingIngestionService as never,
      {} as never, // channexDoctorService
      mockChannexChannelSessionService as never,
      mockHotelAccessService as never,
      {} as never, // adminOverviewService
      mockAuditService as never,
    );
  });

  describe("Content Sync Audit Behavior", () => {
    it("skips audit when syncContent throws an error", async () => {
      mockChannexSyncService.syncContent.mockRejectedValue(new Error("Network timeout contacting Channex"));

      await expect(
        controller.syncChannexContent(req as never, "hotel-1", {}),
      ).rejects.toThrow("Network timeout contacting Channex");

      expect(mockAuditService.recordHotelAction).not.toHaveBeenCalled();
    });

    it("skips audit when syncContent returns incomplete/failure result", async () => {
      mockChannexSyncService.syncContent.mockResolvedValue({
        success: false,
        error: "Verification mismatched",
      });

      await expect(
        controller.syncChannexContent(req as never, "hotel-1", {}),
      ).rejects.toThrow(BadRequestException);

      expect(mockAuditService.recordHotelAction).not.toHaveBeenCalled();
    });

    it("records audit entry when syncContent succeeds", async () => {
      mockChannexSyncService.syncContent.mockResolvedValue({
        success: true,
        channexPropertyId: "prop-chx-123",
        roomTypesSynced: [{ localRoomType: "Deluxe" }],
        ratePlansSynced: [{ ratePlanCode: "STANDARD" }],
      });

      const res = await controller.syncChannexContent(req as never, "hotel-1", {});
      expect(res.success).toBe(true);

      expect(mockAuditService.recordHotelAction).toHaveBeenCalledWith({
        actorId: "user-operator",
        hotelId: "hotel-1",
        action: "CHANNEX_CONTENT_SYNC",
        metadata: {
          channexPropertyId: "prop-chx-123",
          roomTypesSyncedCount: 1,
          ratePlansSyncedCount: 1,
        },
      });
    });
  });

  describe("Feed Drain / Poll Audit Behavior", () => {
    it("skips audit when drainFeed fails", async () => {
      mockChannexBookingIngestionService.drainFeed.mockResolvedValue({ success: false });

      await expect(
        controller.pollChannexFeed(req as never, "hotel-1", { limit: 50 }),
      ).rejects.toThrow(BadRequestException);

      expect(mockAuditService.recordHotelAction).not.toHaveBeenCalled();
    });

    it("records audit entry when drainFeed succeeds", async () => {
      mockChannexBookingIngestionService.drainFeed.mockResolvedValue({ success: true, processed: 10 });

      const res = await controller.pollChannexFeed(req as never, "hotel-1", { limit: 50 });
      expect(res.success).toBe(true);

      expect(mockAuditService.recordHotelAction).toHaveBeenCalledWith({
        actorId: "user-operator",
        hotelId: "hotel-1",
        action: "CHANNEX_FEED_DRAIN",
        metadata: { limit: 50 },
      });
    });
  });

  describe("Property Configuration Audit Behavior", () => {
    it("skips audit when configureProperty throws", async () => {
      mockChannexSyncService.configureProperty.mockRejectedValue(new Error("Invalid property ID"));

      await expect(
        controller.configureChannexProperty(req as never, "hotel-1", {
          channexPropertyId: "11111111-1111-4111-8111-111111111111",
        }),
      ).rejects.toThrow("Invalid property ID");

      expect(mockAuditService.recordHotelAction).not.toHaveBeenCalled();
    });

    it("records audit entry when configureProperty succeeds", async () => {
      const propertyId = "11111111-1111-4111-8111-111111111111";
      mockChannexSyncService.configureProperty.mockResolvedValue({ id: "map-1" });

      await controller.configureChannexProperty(req as never, "hotel-1", {
        channexPropertyId: propertyId,
      });

      expect(mockAuditService.recordHotelAction).toHaveBeenCalledWith({
        actorId: "user-operator",
        hotelId: "hotel-1",
        action: "CHANNEX_PROPERTY_CONFIGURE",
        metadata: { channexPropertyId: propertyId },
      });
    });
  });

  describe("Feed Recovery Audit Behavior", () => {
    it("skips audit when recoverOutage returns failure", async () => {
      mockChannexBookingIngestionService.recoverOutage.mockResolvedValue({ success: false });

      await expect(
        controller.recoverChannexBookings(req as never, "hotel-1", {
          since: "2026-10-01T00:00:00.000Z",
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockAuditService.recordHotelAction).not.toHaveBeenCalled();
    });

    it("records audit entry when recoverOutage succeeds", async () => {
      mockChannexBookingIngestionService.recoverOutage.mockResolvedValue({ success: true });

      const since = "2026-10-01T00:00:00.000Z";
      await controller.recoverChannexBookings(req as never, "hotel-1", { since });

      expect(mockAuditService.recordHotelAction).toHaveBeenCalledWith({
        actorId: "user-operator",
        hotelId: "hotel-1",
        action: "CHANNEX_FEED_RECOVER",
        metadata: { since },
      });
    });
  });
});
