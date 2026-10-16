process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "mock_jwt_access_secret_32_chars_long!!";
process.env.JWT_REFRESH_SECRET = "mock_jwt_refresh_secret_32_chars_long!";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";

import { ConflictException } from "@nestjs/common";
import {
  ChannexMappingReadinessService,
  normalizeRoomTypeName,
} from "./services/channex-mapping-readiness.service";

describe("ChannexMappingReadinessService", () => {
  let service: ChannexMappingReadinessService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      channexMapping: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      roomType: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      room: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new ChannexMappingReadinessService(mockPrisma);
  });

  describe("normalizeRoomTypeName helper", () => {
    it("handles NFKC normalization, whitespace collapsing, trim, and lowercase", () => {
      // NFKC fullwidth characters
      expect(normalizeRoomTypeName("Ｄｅｌｕｘｅ")).toBe("deluxe");
      // Collapsed spaces and trim
      expect(normalizeRoomTypeName("   Deluxe   Ocean    View   ")).toBe("deluxe ocean view");
      // Uppercase to lowercase
      expect(normalizeRoomTypeName("STANDARD ROOM")).toBe("standard room");
      // Non-breaking spaces (\u00A0)
      expect(normalizeRoomTypeName("Suite\u00A0Premium")).toBe("suite premium");
    });
  });

  describe("resolveReadiness", () => {
    const hotelId = "hotel_test_1";

    it("detects PROPERTY_MAPPING_MISSING when hotel has no property mapping", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([]);
      mockPrisma.channexMapping.findUnique.mockResolvedValue(null);

      const result = await service.resolveReadiness(hotelId, ["Deluxe"]);

      expect(result.propertyReady).toBe(false);
      expect(result.propertyBlockers).toContain("PROPERTY_MAPPING_MISSING");
      expect(result.allReady).toBe(false);
      expect(result.roomTypes[0].blockers).toContain("PROPERTY_MAPPING_MISSING");
      expect(result.roomTypes[0].blockers).toContain("ROOM_TYPE_MAPPING_MISSING");
    });

    it("detects MAPPING_CONFLICT when property has multiple conflicting channex IDs", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { hotelId, kind: "property", localId: hotelId, channexId: "channex_prop_1" },
        { hotelId, kind: "property", localId: hotelId, channexId: "channex_prop_2" },
      ]);

      const result = await service.resolveReadiness(hotelId, ["Deluxe"]);

      expect(result.propertyReady).toBe(false);
      expect(result.propertyBlockers).toContain("MAPPING_CONFLICT");
      expect(result.roomTypes[0].blockers).toContain("MAPPING_CONFLICT");
    });

    it("detects ROOM_TYPE_MAPPING_MISSING and RATE_PLAN_MAPPING_MISSING", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { hotelId, kind: "property", localId: hotelId, channexId: "channex_prop_1" },
      ]);
      mockPrisma.roomType.findMany.mockResolvedValue([
        { id: "rt_deluxe_id", name: "Deluxe Room", normalizedKey: "deluxe room" },
      ]);

      const result = await service.resolveReadiness(hotelId, ["Deluxe Room"]);

      expect(result.propertyReady).toBe(true);
      expect(result.propertyBlockers).toHaveLength(0);
      expect(result.roomTypes[0].isReady).toBe(false);
      expect(result.roomTypes[0].blockers).toContain("ROOM_TYPE_MAPPING_MISSING");
      expect(result.roomTypes[0].blockers).toContain("RATE_PLAN_MAPPING_MISSING");
    });

    it("keeps RATE_PLAN_MAPPING_MISSING for availability-only ARI", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { hotelId, kind: "property", localId: hotelId, channexId: "channex_prop_1" },
        { hotelId, kind: "room_type", localId: "rt_deluxe_id", channexId: "cx_rt_deluxe" },
      ]);
      mockPrisma.roomType.findMany.mockResolvedValue([
        { id: "rt_deluxe_id", name: "Deluxe", normalizedKey: "deluxe" },
      ]);

      const result = await service.resolveReadiness(hotelId, ["Deluxe"]);

      expect(result.roomTypes[0].blockers).toContain("RATE_PLAN_MAPPING_MISSING");
      expect(result.roomTypes[0].isReady).toBe(false);
      expect(result.allReady).toBe(false);
    });

    it("detects MAPPING_CONFLICT when room type has conflicting remote IDs", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { hotelId, kind: "property", localId: hotelId, channexId: "channex_prop_1" },
        { hotelId, kind: "room_type", localId: "rt_deluxe_id", channexId: "cx_rt_1" },
        { hotelId, kind: "room_type", localId: "rt_deluxe_id", channexId: "cx_rt_2" },
      ]);
      mockPrisma.roomType.findMany.mockResolvedValue([
        { id: "rt_deluxe_id", name: "Deluxe", normalizedKey: "deluxe" },
      ]);

      const result = await service.resolveReadiness(hotelId, ["Deluxe"]);

      expect(result.roomTypes[0].blockers).toContain("MAPPING_CONFLICT");
      expect(result.roomTypes[0].isReady).toBe(false);
    });

    it("fails closed when ID and legacy-name mappings disagree", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { hotelId, kind: "property", localId: hotelId, channexId: "channex_prop_1" },
        { hotelId, kind: "room_type", localId: "rt_deluxe_id", channexId: "cx_rt_by_id" },
        { hotelId, kind: "rate_plan", localId: "rt_deluxe_id:STANDARD", channexId: "cx_rp_by_id" },
        { hotelId, kind: "room_type", localId: "Deluxe Suite", channexId: "cx_rt_legacy" },
        { hotelId, kind: "rate_plan", localId: "Deluxe Suite:STANDARD", channexId: "cx_rp_legacy" },
      ]);
      mockPrisma.roomType.findMany.mockResolvedValue([
        { id: "rt_deluxe_id", name: "Deluxe Suite", normalizedKey: "deluxe suite" },
      ]);

      const result = await service.resolveReadiness(hotelId, ["Deluxe Suite"]);

      expect(result.roomTypes[0].isReady).toBe(false);
      expect(result.roomTypes[0].blockers).toContain("MAPPING_CONFLICT");
      expect(result.roomTypes[0].channexRoomTypeId).toBeUndefined();
      expect(result.roomTypes[0].channexRatePlanId).toBeUndefined();
    });

    it("falls back to normalized name matching when RoomType.id mapping is absent", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { hotelId, kind: "property", localId: hotelId, channexId: "channex_prop_1" },
        // Mapped by normalized name
        { hotelId, kind: "room_type", localId: "deluxe suite", channexId: "cx_rt_normalized" },
        {
          hotelId,
          kind: "rate_plan",
          localId: "deluxe suite:STANDARD",
          channexId: "cx_rp_normalized",
        },
      ]);
      mockPrisma.roomType.findMany.mockResolvedValue([
        { id: "rt_deluxe_id", name: "Deluxe Suite", normalizedKey: "deluxe suite" },
      ]);

      const result = await service.resolveReadiness(hotelId, ["Deluxe Suite"]);

      expect(result.roomTypes[0].isReady).toBe(true);
      expect(result.roomTypes[0].channexRoomTypeId).toBe("cx_rt_normalized");
      expect(result.roomTypes[0].channexRatePlanId).toBe("cx_rp_normalized");
    });

    it("resolves all room types from catalog and rooms when targetRoomTypes is not provided", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { hotelId, kind: "property", localId: hotelId, channexId: "channex_prop_1" },
        { hotelId, kind: "room_type", localId: "rt_1", channexId: "cx_rt_1" },
        { hotelId, kind: "rate_plan", localId: "rt_1:STANDARD", channexId: "cx_rp_1" },
        { hotelId, kind: "room_type", localId: "rt_2", channexId: "cx_rt_2" },
        { hotelId, kind: "rate_plan", localId: "rt_2:STANDARD", channexId: "cx_rp_2" },
      ]);
      mockPrisma.roomType.findMany.mockResolvedValue([
        { id: "rt_1", name: "Standard Room", normalizedKey: "standard room" },
      ]);
      mockPrisma.room.findMany.mockResolvedValue([
        { id: "room_2", type: "Deluxe Room", roomTypeId: "rt_2" },
      ]);

      const result = await service.resolveReadiness(hotelId);

      expect(result.roomTypes).toHaveLength(2);
      expect(result.allReady).toBe(true);
    });
  });

  describe("assertReady", () => {
    const hotelId = "hotel_test_assert";

    it("throws ConflictException with code CHANNEX_MAPPING_REQUIRED and blocked targets when unmapped", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([]);
      mockPrisma.channexMapping.findUnique.mockResolvedValue(null);

      let caughtError: any;
      try {
        await service.assertReady(hotelId, ["Ocean Deluxe"]);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ConflictException);
      expect(caughtError.getStatus()).toBe(409);
      const res = caughtError.getResponse();
      expect(res.code).toBe("CHANNEX_MAPPING_REQUIRED");
      expect(res.blockedRoomTypes).toHaveLength(1);
      expect(res.blockedRoomTypes[0].roomType).toBe("Ocean Deluxe");
      expect(res.blockedRoomTypes[0].blockers).toContain("PROPERTY_MAPPING_MISSING");
      expect(res.blockedRoomTypes[0].blockers).toContain("ROOM_TYPE_MAPPING_MISSING");
    });

    it("succeeds and returns readiness when all requested targets are mapped", async () => {
      mockPrisma.channexMapping.findMany.mockResolvedValue([
        { hotelId, kind: "property", localId: hotelId, channexId: "cx_prop_ok" },
        { hotelId, kind: "room_type", localId: "DELUXE", channexId: "cx_rt_deluxe" },
        { hotelId, kind: "rate_plan", localId: "DELUXE:STANDARD", channexId: "cx_rp_deluxe" },
      ]);

      const result = await service.assertReady(hotelId, ["DELUXE"]);

      expect(result.allReady).toBe(true);
      expect(result.propertyReady).toBe(true);
      expect(result.roomTypes[0].isReady).toBe(true);
    });
  });
});
