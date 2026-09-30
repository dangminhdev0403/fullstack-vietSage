import { BadRequestException, NotFoundException } from "@nestjs/common";
import { HotelFeatureStatus } from "@prisma/client";
import { HotelFeatureEntitlementsService } from "../application/hotel-feature-entitlements.service";
import {
  CANONICAL_HOTEL_FEATURE_KEYS,
  HOTEL_FEATURE_DEFINITIONS,
  isHotelFeatureKey,
} from "../../../common/config/hotel-features.registry";
import { HotelCoreRepository } from "../infrastructure/repositories/hotel-core.repository";

function createMockRepository(overrides: Record<string, jest.Mock> = {}) {
  return {
    findHotelById: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
    findHotelFeatureEntitlements: jest.fn().mockResolvedValue([]),
    findEnabledHotelFeatureKeys: jest.fn().mockResolvedValue([]),
    setHotelFeatureStatus: jest.fn(),
    ...overrides,
  };
}

describe("HotelFeatureRegistry", () => {
  it("defines exactly the 3 canonical feature keys", () => {
    expect(CANONICAL_HOTEL_FEATURE_KEYS).toEqual([
      "guest.ai_floating_chat",
      "frontdesk.hn2n_cccd_scanner",
      "hotel.channel_manager",
    ]);
  });

  it("keeps exactly one definition for each canonical feature", () => {
    expect(HOTEL_FEATURE_DEFINITIONS.map(({ key }) => key)).toEqual(CANONICAL_HOTEL_FEATURE_KEYS);
  });

  it("validates known keys and rejects arbitrary keys", () => {
    expect(isHotelFeatureKey("guest.ai_floating_chat")).toBe(true);
    expect(isHotelFeatureKey("frontdesk.hn2n_cccd_scanner")).toBe(true);
    expect(isHotelFeatureKey("hotel.channel_manager")).toBe(true);
    expect(isHotelFeatureKey("ai_chat")).toBe(false);
    expect(isHotelFeatureKey("unknown_feature")).toBe(false);
  });
});

describe("HotelFeatureEntitlementsService", () => {
  it("returns all registry features with default DISABLED when no database rows exist", async () => {
    const repository = createMockRepository();
    const service = new HotelFeatureEntitlementsService(repository as never);

    const features = await service.getHotelFeatures("hotel-1");

    expect(features).toHaveLength(3);
    expect(features[0]).toEqual({
      key: "guest.ai_floating_chat",
      label: "Trợ lý AI nổi trên GuestOS",
      description: "Hiển thị và cho phép sử dụng trợ lý LocalMate AI trong GuestOS.",
      status: HotelFeatureStatus.DISABLED,
    });
    expect(features[1]).toEqual({
      key: "frontdesk.hn2n_cccd_scanner",
      label: "Máy quét CCCD HN2N/HN-212 tại lễ tân",
      description: "Kết nối và vận hành máy quét CCCD HN2N/HN-212 cho luồng check-in tại lễ tân.",
      status: HotelFeatureStatus.DISABLED,
    });
    expect(features[2]).toEqual({
      key: "hotel.channel_manager",
      label: "Kho phòng & kênh bán (Channel Manager)",
      description:
        "Bật/tắt tính năng quản lý tồn kho, giá bán và đồng bộ đa kênh OTA (Channex, Booking, Agoda, Airbnb...).",
      status: HotelFeatureStatus.DISABLED,
    });
  });

  it("merges persisted entitlement status with registry definitions", async () => {
    const repository = createMockRepository({
      findHotelFeatureEntitlements: jest.fn().mockResolvedValue([
        {
          hotelId: "hotel-1",
          featureKey: "guest.ai_floating_chat",
          status: HotelFeatureStatus.ENABLED,
        },
      ]),
    });
    const service = new HotelFeatureEntitlementsService(repository as never);

    const features = await service.getHotelFeatures("hotel-1");

    expect(features).toHaveLength(3);
    expect(features.find((f) => f.key === "guest.ai_floating_chat")?.status).toBe(
      HotelFeatureStatus.ENABLED,
    );
    expect(features.find((f) => f.key === "frontdesk.hn2n_cccd_scanner")?.status).toBe(
      HotelFeatureStatus.DISABLED,
    );
    expect(features.find((f) => f.key === "hotel.channel_manager")?.status).toBe(
      HotelFeatureStatus.DISABLED,
    );
  });

  it("throws NotFoundException when hotel does not exist on getHotelFeatures", async () => {
    const repository = createMockRepository({
      findHotelById: jest.fn().mockResolvedValue(null),
    });
    const service = new HotelFeatureEntitlementsService(repository as never);

    await expect(service.getHotelFeatures("non-existent")).rejects.toThrow(NotFoundException);
  });

  it("throws BadRequestException when setting unknown feature key", async () => {
    const repository = createMockRepository();
    const service = new HotelFeatureEntitlementsService(repository as never);

    await expect(
      service.setHotelFeatureStatus(
        "hotel-1",
        "invalid.key",
        HotelFeatureStatus.ENABLED,
        "actor-1",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws NotFoundException when hotel does not exist on setHotelFeatureStatus", async () => {
    const repository = createMockRepository({
      findHotelById: jest.fn().mockResolvedValue(null),
    });
    const service = new HotelFeatureEntitlementsService(repository as never);

    await expect(
      service.setHotelFeatureStatus(
        "missing-hotel",
        "guest.ai_floating_chat",
        HotelFeatureStatus.ENABLED,
        "actor-1",
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("updates feature status and returns updated feature DTO", async () => {
    const repository = createMockRepository({
      setHotelFeatureStatus: jest.fn().mockResolvedValue({
        status: HotelFeatureStatus.ENABLED,
        changed: true,
        previousStatus: HotelFeatureStatus.DISABLED,
      }),
    });
    const service = new HotelFeatureEntitlementsService(repository as never);

    const result = await service.setHotelFeatureStatus(
      "hotel-1",
      "guest.ai_floating_chat",
      HotelFeatureStatus.ENABLED,
      "actor-1",
    );

    expect(repository.setHotelFeatureStatus).toHaveBeenCalledWith({
      hotelId: "hotel-1",
      featureKey: "guest.ai_floating_chat",
      status: HotelFeatureStatus.ENABLED,
      actorId: "actor-1",
    });
    expect(result).toEqual({
      key: "guest.ai_floating_chat",
      label: "Trợ lý AI nổi trên GuestOS",
      description: "Hiển thị và cho phép sử dụng trợ lý LocalMate AI trong GuestOS.",
      status: HotelFeatureStatus.ENABLED,
    });
  });

  it("returns canonical enabled features sorted in stable registry order, filtering unknown keys", async () => {
    const repository = createMockRepository({
      findEnabledHotelFeatureKeys: jest
        .fn()
        .mockResolvedValue([
          "frontdesk.hn2n_cccd_scanner",
          "unknown.key",
          "guest.ai_floating_chat",
        ]),
    });
    const service = new HotelFeatureEntitlementsService(repository as never);

    const enabled = await service.getEnabledFeaturesForHotel("hotel-1");

    expect(enabled).toEqual(["guest.ai_floating_chat", "frontdesk.hn2n_cccd_scanner"]);
  });
});

describe("HotelCoreRepository entitlement transactional writes & audit logs", () => {
  it("writes AuditLog when entitlement status changes from DISABLED to ENABLED", async () => {
    const mockTx = {
      hotel: {
        findUnique: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
      },
      hotelFeatureEntitlement: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          hotelId: "hotel-1",
          featureKey: "guest.ai_floating_chat",
          status: HotelFeatureStatus.ENABLED,
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };

    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof mockTx) => Promise<unknown>) =>
        callback(mockTx),
      ),
    };

    const repo = new HotelCoreRepository(prisma as never);
    const result = await repo.setHotelFeatureStatus({
      hotelId: "hotel-1",
      featureKey: "guest.ai_floating_chat",
      status: HotelFeatureStatus.ENABLED,
      actorId: "admin-user-1",
    });

    expect(result?.changed).toBe(true);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: "admin-user-1",
        tenantId: "tenant-1",
        action: "HOTEL_FEATURE_STATUS_CHANGED",
        entityType: "HOTEL_FEATURE_ENTITLEMENT",
        entityId: "hotel-1:guest.ai_floating_chat",
        metadata: {
          featureKey: "guest.ai_floating_chat",
          previousStatus: HotelFeatureStatus.DISABLED,
          nextStatus: HotelFeatureStatus.ENABLED,
        },
      },
    });
  });

  it("does not write duplicate AuditLog for idempotent write with identical status", async () => {
    const mockTx = {
      hotel: {
        findUnique: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
      },
      hotelFeatureEntitlement: {
        findUnique: jest.fn().mockResolvedValue({
          hotelId: "hotel-1",
          featureKey: "guest.ai_floating_chat",
          status: HotelFeatureStatus.ENABLED,
        }),
        upsert: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof mockTx) => Promise<unknown>) =>
        callback(mockTx),
      ),
    };

    const repo = new HotelCoreRepository(prisma as never);
    const result = await repo.setHotelFeatureStatus({
      hotelId: "hotel-1",
      featureKey: "guest.ai_floating_chat",
      status: HotelFeatureStatus.ENABLED,
      actorId: "admin-user-1",
    });

    expect(result?.changed).toBe(false);
    expect(mockTx.hotelFeatureEntitlement.upsert).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
  });
});
