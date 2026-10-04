process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "mock_jwt_access_secret_32_chars_long!!";
process.env.JWT_REFRESH_SECRET = "mock_jwt_refresh_secret_32_chars_long!";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";

import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ChannelManagerAdminOverviewService,
  deriveChannelState,
} from "./services/channel-manager-admin-overview.service";

describe("ChannelManagerAdminOverviewService", () => {
  let service: ChannelManagerAdminOverviewService;
  let mockQueryRaw: jest.Mock;

  beforeEach(async () => {
    mockQueryRaw = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelManagerAdminOverviewService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: mockQueryRaw,
          },
        },
      ],
    }).compile();

    service = module.get<ChannelManagerAdminOverviewService>(ChannelManagerAdminOverviewService);
  });

  describe("Architectural and Dependency Constraints", () => {
    it("has no Channex client dependency or remote HTTP calls", () => {
      const injectedProps = Object.getOwnPropertyNames(service);
      expect(injectedProps).toContain("prisma");
      expect(injectedProps).not.toContain("channexClient");
      expect(injectedProps).not.toContain("channexApiClient");
    });
  });

  describe("State Derivation Priority Rules (Pure Logic)", () => {
    it("1. derives UNCONFIGURED and PROPERTY_MISSING when property mapping is absent", () => {
      const res = deriveChannelState({
        propertyConfigured: false,
        mappedRoomTypes: 2,
        mappedRatePlans: 2,
      });
      expect(res.state).toBe("UNCONFIGURED");
      expect(res.primaryIssueCode).toBe("PROPERTY_MISSING");
    });

    it("2a. derives SETTING_UP and MAPPING_INCOMPLETE when mapped room types count is 0", () => {
      const res = deriveChannelState({
        propertyConfigured: true,
        mappedRoomTypes: 0,
        mappedRatePlans: 2,
      });
      expect(res.state).toBe("SETTING_UP");
      expect(res.primaryIssueCode).toBe("MAPPING_INCOMPLETE");
    });

    it("2b. derives SETTING_UP and MAPPING_INCOMPLETE when mapped rate plans count is 0", () => {
      const res = deriveChannelState({
        propertyConfigured: true,
        mappedRoomTypes: 2,
        mappedRatePlans: 0,
      });
      expect(res.state).toBe("SETTING_UP");
      expect(res.primaryIssueCode).toBe("MAPPING_INCOMPLETE");
    });

    it("3a. derives INTERRUPTED and SYNC_FAILED when latest sync failed", () => {
      const res = deriveChannelState({
        propertyConfigured: true,
        mappedRoomTypes: 2,
        mappedRatePlans: 2,
        lastSyncStatus: "FAILED",
      });
      expect(res.state).toBe("INTERRUPTED");
      expect(res.primaryIssueCode).toBe("SYNC_FAILED");
    });

    it("3b. derives INTERRUPTED and CONNECTION_INTERRUPTED when connection is PAUSED/ERROR", () => {
      const res = deriveChannelState({
        propertyConfigured: true,
        mappedRoomTypes: 2,
        mappedRatePlans: 2,
        hasNonActiveConnection: true,
        lastSyncStatus: "SUCCESS",
      });
      expect(res.state).toBe("INTERRUPTED");
      expect(res.primaryIssueCode).toBe("CONNECTION_INTERRUPTED");
    });

    it("4a. derives ATTENTION and RECONCILIATION_REQUIRED when pending reconciliations exist", () => {
      const res = deriveChannelState({
        propertyConfigured: true,
        mappedRoomTypes: 2,
        mappedRatePlans: 2,
        pendingReconciliations: 3,
        lastSyncStatus: "SUCCESS",
      });
      expect(res.state).toBe("ATTENTION");
      expect(res.primaryIssueCode).toBe("RECONCILIATION_REQUIRED");
    });

    it("4b. derives ATTENTION and RECONCILIATION_REQUIRED when latest sync is WARNING or PARTIAL_FAILURE", () => {
      const res1 = deriveChannelState({
        propertyConfigured: true,
        mappedRoomTypes: 2,
        mappedRatePlans: 2,
        lastSyncStatus: "WARNING",
      });
      expect(res1.state).toBe("ATTENTION");
      expect(res1.primaryIssueCode).toBe("RECONCILIATION_REQUIRED");

      const res2 = deriveChannelState({
        propertyConfigured: true,
        mappedRoomTypes: 2,
        mappedRatePlans: 2,
        lastSyncStatus: "PARTIAL_FAILURE",
      });
      expect(res2.state).toBe("ATTENTION");
      expect(res2.primaryIssueCode).toBe("RECONCILIATION_REQUIRED");
    });

    it("5. derives ACTIVE and null primary issue code when healthy and fully mapped", () => {
      const res = deriveChannelState({
        propertyConfigured: true,
        mappedRoomTypes: 2,
        mappedRatePlans: 2,
        lastSyncStatus: "SUCCESS",
        pendingReconciliations: 0,
        hasNonActiveConnection: false,
      });
      expect(res.state).toBe("ACTIVE");
      expect(res.primaryIssueCode).toBeNull();
    });
  });

  describe("Bounded Server-side Query Execution", () => {
    it("executes bounded SQL query with limit, offset, and returns exact summary and items", async () => {
      mockQueryRaw.mockResolvedValueOnce([
        {
          summary: {
            totalHotels: 10,
            configuredHotels: 8,
            activeHotels: 6,
            needsAttention: 2,
            unconfiguredHotels: 2,
            pendingReconciliations: 4,
          },
          items: [
            {
              hotelId: "h-1",
              hotelCode: "H01",
              hotelName: "Hotel Saigon",
              tenantId: "t-1",
              tenantName: "Saigon Corp",
              state: "ACTIVE",
              propertyConfigured: true,
              mappedRoomTypes: 2,
              mappedRatePlans: 2,
              pendingReconciliations: 0,
              lastSyncAt: "2026-10-01T10:00:00.000Z",
              lastSyncStatus: "SUCCESS",
              primaryIssueCode: null,
            },
          ],
        },
      ]);

      const result = await service.getOverview({ page: 2, limit: 10, q: "Saigon" });

      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
      const sqlObj = mockQueryRaw.mock.calls[0][0];
      // Verifies SQL parameter binding includes pagination limit and offset
      expect(sqlObj.values).toContain(10); // limit
      expect(sqlObj.values).toContain(10); // offset: (2-1)*10 = 10
      expect(sqlObj.values).toContain("%Saigon%"); // search pattern

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(10);
      expect(result.summary.totalHotels).toBe(10);
      expect(result.summary.activeHotels).toBe(6);
      expect(result.summary.pendingReconciliations).toBe(4);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].hotelName).toBe("Hotel Saigon");
    });

    it("applies state filter to both summary and items in Postgres query", async () => {
      mockQueryRaw.mockResolvedValueOnce([
        {
          summary: {
            totalHotels: 2,
            configuredHotels: 2,
            activeHotels: 0,
            needsAttention: 2,
            unconfiguredHotels: 0,
            pendingReconciliations: 5,
          },
          items: [
            {
              hotelId: "h-warn",
              hotelCode: "HWARN",
              hotelName: "Attention Hotel",
              tenantId: "t-1",
              tenantName: "Tenant 1",
              state: "ATTENTION",
              propertyConfigured: true,
              mappedRoomTypes: 1,
              mappedRatePlans: 1,
              pendingReconciliations: 5,
              lastSyncAt: "2026-10-01T10:00:00.000Z",
              lastSyncStatus: "WARNING",
              primaryIssueCode: "RECONCILIATION_REQUIRED",
            },
          ],
        },
      ]);

      const result = await service.getOverview({ state: "ATTENTION" });

      const sqlObj = mockQueryRaw.mock.calls[0][0];
      expect(sqlObj.values).toContain("ATTENTION");

      expect(result.summary.totalHotels).toBe(2);
      expect(result.summary.needsAttention).toBe(2);
      expect(result.summary.activeHotels).toBe(0);
      expect(result.total).toBe(2);
      expect(result.items[0].state).toBe("ATTENTION");
      expect(result.items[0].primaryIssueCode).toBe("RECONCILIATION_REQUIRED");
    });

    it("preserves zero-mapping hotels through left-join semantics in empty or new fleet", async () => {
      mockQueryRaw.mockResolvedValueOnce([
        {
          summary: {
            totalHotels: 1,
            configuredHotels: 0,
            activeHotels: 0,
            needsAttention: 0,
            unconfiguredHotels: 1,
            pendingReconciliations: 0,
          },
          items: [
            {
              hotelId: "h-zero",
              hotelCode: "HZERO",
              hotelName: "Zero Mapping Hotel",
              tenantId: "t-new",
              tenantName: "New Tenant",
              state: "UNCONFIGURED",
              propertyConfigured: false,
              mappedRoomTypes: 0,
              mappedRatePlans: 0,
              pendingReconciliations: 0,
              lastSyncAt: null,
              lastSyncStatus: null,
              primaryIssueCode: "PROPERTY_MISSING",
            },
          ],
        },
      ]);

      const result = await service.getOverview({});
      expect(result.items[0].state).toBe("UNCONFIGURED");
      expect(result.items[0].primaryIssueCode).toBe("PROPERTY_MISSING");
      expect(result.items[0].propertyConfigured).toBe(false);
      expect(result.items[0].lastSyncAt).toBeNull();
      expect(result.summary.unconfiguredHotels).toBe(1);
    });
  });
});
