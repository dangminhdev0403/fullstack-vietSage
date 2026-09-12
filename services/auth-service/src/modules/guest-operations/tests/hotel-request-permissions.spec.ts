process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/vietsage_auth?schema=public";
process.env.NODE_ENV = "test";
process.env.PORT = "3000";
process.env.JWT_ACCESS_SECRET = "test-access-secret-with-32-characters";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-with-32-characters";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL = "7d";

jest.mock("../../../common/config/env.config", () => ({
  envConfig: {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/vietsage_auth?schema=public",
    NODE_ENV: "test",
    PORT: "3000",
    JWT_ACCESS_SECRET: "test-access-secret-with-32-characters",
    JWT_REFRESH_SECRET: "test-refresh-secret-with-32-characters",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
  },
}));

import { BadRequestException } from "@nestjs/common";
import {
  GuestRequestPriority,
  GuestRequestStatus,
  GuestStayStatus,
  HotelStaffAssignmentStatus,
  TenantUserStatus,
  UserStatus,
} from "@prisma/client";
import { REQUIRED_PERMISSION_KEY } from "../../../shared/decorators/require-permission.decorator";
import { HotelRequestsController } from "../api/hotel-requests.controller";
import { HotelRequestsService } from "../application/hotel-requests.service";
import type { HotelAccessService } from "../../property/property-public";
import { HotelRequestsRepository } from "../infrastructure/repositories/hotel-requests.repository";
import type { GuestRequestEventPublisher } from "../../../shared/events";

describe("Hotel Request Permissions & Coordination vs Execution (AGY 12)", () => {
  describe("1. Controller Capability Contract (@RequirePermission)", () => {
    it("enforces view permission for read-only query endpoints", () => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, HotelRequestsController.prototype.listRequests),
      ).toBe("hotel.requests.view");
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          HotelRequestsController.prototype.getRequestsSummary,
        ),
      ).toBe("hotel.requests.view");
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          HotelRequestsController.prototype.getRequestDetail,
        ),
      ).toBe("hotel.requests.view");
    });

    it("enforces hotel.requests.execute for operational status / guest-facing execution", () => {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          HotelRequestsController.prototype.updateRequestStatus,
        ),
      ).toBe("hotel.requests.execute");
    });

    it("enforces hotel.requests.coordinate for assignment, priority, and internal coordination", () => {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          HotelRequestsController.prototype.updateRequestAssignment,
        ),
      ).toBe("hotel.requests.coordinate");
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          HotelRequestsController.prototype.createRequestEvent,
        ),
      ).toBe("hotel.requests.coordinate");
    });
  });

  describe("2. Assignee Active/Assignable Validation Across Status & Assignment Paths", () => {
    let service: HotelRequestsService;
    let mockRepository: jest.Mocked<Partial<HotelRequestsRepository>>;
    let mockHotelAccessService: jest.Mocked<Partial<HotelAccessService>>;
    let mockEventPublisher: jest.Mocked<Partial<GuestRequestEventPublisher>>;

    const actorUserId = "actor-user-1";
    const activeRoleId = "role-frontdesk-1";
    const hotelId = "hotel-1";
    const tenantId = "tenant-1";
    const requestId = "req-1";

    const baseExistingRequest = {
      id: requestId,
      hotelId,
      stayId: "stay-1",
      roomId: "room-1",
      status: GuestRequestStatus.CREATED,
      priority: GuestRequestPriority.NORMAL,
      title: "Need towels",
      description: "2 extra towels",
      quantity: 2,
      serviceItemId: null,
      assignedToUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      stay: {
        id: "stay-1",
        status: GuestStayStatus.ACTIVE,
        guestDisplayName: "John Doe",
        checkedOutAt: null,
      },
      room: { roomNumber: "101" },
      session: { id: "sess-1" },
      events: [],
      serviceItem: null,
      assignedTo: null,
    };

    beforeEach(() => {
      mockRepository = {
        findRequestInHotel: jest.fn().mockResolvedValue({
          ...baseExistingRequest,
        } as never),
        findAssignableStaffInTenant: jest.fn(),
        updateRequestAssignment: jest.fn().mockImplementation((input) =>
          Promise.resolve({
            ...baseExistingRequest,
            assignedToUserId: input.assignedToUserId ?? null,
            priority: input.priority ?? baseExistingRequest.priority,
          }),
        ),
        updateRequestStatus: jest.fn().mockImplementation((input) =>
          Promise.resolve({
            ...baseExistingRequest,
            status: input.status,
            assignedToUserId: input.assignedToUserId ?? null,
            priority: input.priority ?? baseExistingRequest.priority,
          }),
        ),
      };

      mockHotelAccessService = {
        assertHotelAccess: jest.fn().mockResolvedValue({
          tenantId,
          userId: actorUserId,
          isSuperAdmin: false,
          isTenantOwner: false,
          roleCodes: new Set(["HOTEL_FRONTDESK"]),
          tenantIds: new Set([tenantId]),
        } as never),
      };

      mockEventPublisher = {
        publishGuestRequestUpdated: jest.fn(),
      };

      service = new HotelRequestsService(
        mockRepository as unknown as HotelRequestsRepository,
        mockHotelAccessService as unknown as HotelAccessService,
        mockEventPublisher as unknown as GuestRequestEventPublisher,
      );
    });

    describe("Assignment Path (updateRequestAssignment)", () => {
      it("rejects assignment if assigned user is inactive or not assignable in this hotel/tenant", async () => {
        mockRepository.findAssignableStaffInTenant = jest.fn().mockResolvedValue(null);

        await expect(
          service.updateRequestAssignment(actorUserId, activeRoleId, hotelId, requestId, {
            assignedToUserId: "invalid-user",
            note: "Assign to staff",
          }),
        ).rejects.toThrow(BadRequestException);

        expect(mockRepository.findAssignableStaffInTenant).toHaveBeenCalledWith(
          "invalid-user",
          tenantId,
          hotelId,
        );
      });

      it("allows assignment and updates priority when assigned user is active and assignable", async () => {
        mockRepository.findAssignableStaffInTenant = jest
          .fn()
          .mockResolvedValue({ id: "valid-staff-1" } as never);

        const result = await service.updateRequestAssignment(
          actorUserId,
          activeRoleId,
          hotelId,
          requestId,
          {
            assignedToUserId: "valid-staff-1",
            priority: "URGENT",
            note: "High priority assignment",
          },
        );

        expect(mockRepository.findAssignableStaffInTenant).toHaveBeenCalledWith(
          "valid-staff-1",
          tenantId,
          hotelId,
        );
        expect(mockRepository.updateRequestAssignment).toHaveBeenCalledWith(
          expect.objectContaining({
            assignedToUserId: "valid-staff-1",
            priority: "URGENT",
            tenantId,
          }),
        );
        expect(result.priority).toBe("URGENT");
      });

      it("allows unassigning (null assignedToUserId) without querying assignable staff", async () => {
        const result = await service.updateRequestAssignment(
          actorUserId,
          activeRoleId,
          hotelId,
          requestId,
          {
            assignedToUserId: null,
            note: "Unassigned",
          },
        );

        expect(mockRepository.findAssignableStaffInTenant).not.toHaveBeenCalled();
        expect(mockRepository.updateRequestAssignment).toHaveBeenCalledWith(
          expect.objectContaining({
            assignedToUserId: null,
          }),
        );
        expect(result).toBeDefined();
      });
    });

    describe("Status Path (updateRequestStatus)", () => {
      it("rejects status update when an assigned user is supplied but not active/assignable", async () => {
        mockRepository.findAssignableStaffInTenant = jest.fn().mockResolvedValue(null);

        await expect(
          service.updateRequestStatus(actorUserId, activeRoleId, hotelId, requestId, {
            status: GuestRequestStatus.ACKNOWLEDGED,
            assignedToUserId: "unassigned-or-inactive-user",
          }),
        ).rejects.toThrow(BadRequestException);

        expect(mockRepository.findAssignableStaffInTenant).toHaveBeenCalledWith(
          "unassigned-or-inactive-user",
          tenantId,
          hotelId,
        );
      });

      it("allows status update with valid assigned user", async () => {
        mockRepository.findAssignableStaffInTenant = jest
          .fn()
          .mockResolvedValue({ id: "valid-staff-2" } as never);

        const result = await service.updateRequestStatus(
          actorUserId,
          activeRoleId,
          hotelId,
          requestId,
          {
            status: GuestRequestStatus.ACKNOWLEDGED,
            assignedToUserId: "valid-staff-2",
            note: "Taking this request",
          },
        );

        expect(mockRepository.findAssignableStaffInTenant).toHaveBeenCalledWith(
          "valid-staff-2",
          tenantId,
          hotelId,
        );
        expect(mockRepository.updateRequestStatus).toHaveBeenCalledWith(
          expect.objectContaining({
            status: GuestRequestStatus.ACKNOWLEDGED,
            assignedToUserId: "valid-staff-2",
            tenantId,
          }),
        );
        expect(result.status).toBe(GuestRequestStatus.ACKNOWLEDGED);
      });
    });
  });

  describe("3. Transition Guarantees & Idempotency", () => {
    let service: HotelRequestsService;
    let mockRepository: jest.Mocked<Partial<HotelRequestsRepository>>;
    let mockHotelAccessService: jest.Mocked<Partial<HotelAccessService>>;

    beforeEach(() => {
      mockHotelAccessService = {
        assertHotelAccess: jest.fn().mockResolvedValue({
          tenantId: "tenant-1",
        } as never),
      };
      mockRepository = {
        findRequestInHotel: jest.fn(),
        updateRequestStatus: jest.fn(),
      };
      service = new HotelRequestsService(
        mockRepository as unknown as HotelRequestsRepository,
        mockHotelAccessService as unknown as HotelAccessService,
      );
    });

    it("rejects illegal transitions from COMPLETED, CANCELLED, or FAILED", async () => {
      mockRepository.findRequestInHotel = jest.fn().mockResolvedValue({
        id: "req-completed",
        status: GuestRequestStatus.COMPLETED,
        priority: GuestRequestPriority.NORMAL,
      } as never);

      await expect(
        service.updateRequestStatus("user-1", "role-1", "hotel-1", "req-completed", {
          status: GuestRequestStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("allows legal lifecycle transition (CREATED -> ACKNOWLEDGED)", async () => {
      mockRepository.findRequestInHotel = jest.fn().mockResolvedValue({
        id: "req-created",
        status: GuestRequestStatus.CREATED,
        priority: GuestRequestPriority.NORMAL,
        createdAt: new Date(),
        stay: { status: GuestStayStatus.ACTIVE, checkedOutAt: null },
        room: { roomNumber: "101" },
        events: [],
      } as never);

      mockRepository.updateRequestStatus = jest.fn().mockResolvedValue({
        id: "req-created",
        status: GuestRequestStatus.ACKNOWLEDGED,
        priority: GuestRequestPriority.NORMAL,
        createdAt: new Date(),
        stay: { status: GuestStayStatus.ACTIVE, checkedOutAt: null },
        room: { roomNumber: "101" },
        events: [],
      } as never);

      const updated = await service.updateRequestStatus("user-1", "role-1", "hotel-1", "req-created", {
        status: GuestRequestStatus.ACKNOWLEDGED,
      });

      expect(updated.status).toBe(GuestRequestStatus.ACKNOWLEDGED);
    });
  });

  describe("4. Prisma Repository Assignable Staff & Folio Idempotency Contract", () => {
    it("ensures UserStatus, TenantUserStatus, and HotelStaffAssignmentStatus enums exist", () => {
      expect(UserStatus.ACTIVE).toBe("ACTIVE");
      expect(TenantUserStatus.ACTIVE).toBe("ACTIVE");
      expect(HotelStaffAssignmentStatus.ACTIVE).toBe("ACTIVE");
    });

    it("filters findAssignableStaffInTenant with active user, tenant, and hotel assignment", async () => {
      const mockPrisma = {
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: "staff-1" }),
        },
      };

      const repo = new HotelRequestsRepository(mockPrisma as never);
      const staff = await repo.findAssignableStaffInTenant("staff-1", "tenant-1", "hotel-1");

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: "staff-1",
          status: UserStatus.ACTIVE,
          tenantUsers: { some: { tenantId: "tenant-1", status: TenantUserStatus.ACTIVE } },
          hotelAssignments: { some: { hotelId: "hotel-1", status: HotelStaffAssignmentStatus.ACTIVE } },
        },
        select: { id: true },
      });
      expect(staff).toEqual({ id: "staff-1" });
    });

    it("preserves folio idempotency on request completion when folio item already exists", async () => {
      const mockTx = {
        guestRequest: {
          findFirstOrThrow: jest.fn().mockResolvedValue({
            id: "req-1",
            hotelId: "hotel-1",
            status: GuestRequestStatus.IN_PROGRESS,
          }),
          update: jest.fn().mockResolvedValue({
            id: "req-1",
            status: GuestRequestStatus.COMPLETED,
          }),
        },
        folioItem: {
          findUnique: jest.fn().mockResolvedValue({ id: "existing-folio-item-1", folioId: "folio-1" }),
          create: jest.fn(),
          aggregate: jest.fn().mockResolvedValue({
            _sum: {
              subtotalSnapshot: null,
              taxAmountSnapshot: null,
              discountAmountSnapshot: null,
              totalSnapshot: null,
            },
          }),
        },
        folio: {
          update: jest.fn().mockResolvedValue({}),
        },
        guestRequestEvent: {
          create: jest.fn().mockResolvedValue({}),
        },
        domainEvent: {
          create: jest.fn().mockResolvedValue({}),
        },
      };

      const mockPrisma = {
        $transaction: jest.fn().mockImplementation((callback: (tx: typeof mockTx) => Promise<unknown>) =>
          callback(mockTx),
        ),
      };

      const repo = new HotelRequestsRepository(mockPrisma as never);
      const result = await repo.updateRequestStatus({
        hotelId: "hotel-1",
        requestId: "req-1",
        actorUserId: "user-1",
        expectedStatus: GuestRequestStatus.IN_PROGRESS,
        status: GuestRequestStatus.COMPLETED,
        tenantId: "tenant-1",
      });

      expect(mockTx.folioItem.findUnique).toHaveBeenCalledWith({
        where: { guestRequestId: "req-1" },
        select: { id: true, folioId: true },
      });
      expect(mockTx.folioItem.create).not.toHaveBeenCalled();
      expect(mockTx.folio.update).toHaveBeenCalled();
      expect(result.status).toBe(GuestRequestStatus.COMPLETED);
    });
  });
});
