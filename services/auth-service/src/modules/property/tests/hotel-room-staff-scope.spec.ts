import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { HotelAccessService } from "../application/hotel-access.service";
import { HotelRoomsService } from "../application/hotel-rooms.service";
import { ReservationsService } from "../application/reservations.service";
import { HotelRequestsService } from "../../guest-operations/application/hotel-requests.service";
import { GuestMessagesService } from "../../guest-operations/application/guest-messages.service";
import { BillingService } from "../../billing/application/billing.service";
import { RequestRealtimeTicketService } from "../../request-realtime/application/request-realtime-ticket.service";

function createRepository(overrides: Record<string, jest.Mock> = {}) {
  return {
    findActorById: jest.fn(),
    findHotelById: jest.fn(),
    findHotelByIdAndTenantIds: jest.fn(),
    findTenantById: jest.fn().mockResolvedValue({ id: "tenant-1" }),
    findRoomStaffAssignment: jest.fn(),
    findRoomById: jest.fn(),
    ...overrides,
  };
}

describe("HotelRoomStaffScope (Phase 1)", () => {
  describe("resolveRoomScope", () => {
    it("1. khách sạn mặc định (HOTEL_WIDE) cho phép phạm vi toàn khách sạn (allowedRoomId: null)", async () => {
      const repository = createRepository({
        findActorById: jest.fn().mockResolvedValue({
          id: "staff-1",
          userRoles: [{ role: { code: "HOTEL_FRONTDESK" } }],
          tenantUsers: [{ tenantId: "tenant-1" }],
          hotelAssignments: [{ hotelId: "hotel-1" }],
        }),
        findHotelById: jest.fn().mockResolvedValue({
          id: "hotel-1",
          tenantId: "tenant-1",
          staffScopeMode: "HOTEL_WIDE",
        }),
      });
      const service = new HotelAccessService(repository as never);

      const scope = await service.resolveRoomScope("staff-1", "role-frontdesk", "hotel-1");

      expect(scope.allowedRoomId).toBeNull();
      expect(scope.hotel.id).toBe("hotel-1");
      expect(repository.findRoomStaffAssignment).not.toHaveBeenCalled();
    });

    it("2. tại khách sạn ROOM_EXCLUSIVE, HOTEL_FRONTDESK nhận đúng allowedRoomId từ phân công phòng", async () => {
      const repository = createRepository({
        findActorById: jest.fn().mockResolvedValue({
          id: "staff-1",
          userRoles: [{ role: { code: "HOTEL_FRONTDESK" } }],
          tenantUsers: [{ tenantId: "tenant-1" }],
          hotelAssignments: [{ hotelId: "hotel-1" }],
        }),
        findHotelById: jest.fn().mockResolvedValue({
          id: "hotel-1",
          tenantId: "tenant-1",
          staffScopeMode: "ROOM_EXCLUSIVE",
        }),
        findRoomStaffAssignment: jest.fn().mockResolvedValue({
          id: "assign-1",
          hotelId: "hotel-1",
          roomId: "room-101",
          userId: "staff-1",
        }),
      });
      const service = new HotelAccessService(repository as never);

      const scope = await service.resolveRoomScope("staff-1", "role-frontdesk", "hotel-1");

      expect(scope.allowedRoomId).toBe("room-101");
      expect(repository.findRoomStaffAssignment).toHaveBeenCalledWith("staff-1", "hotel-1");
    });

    it("3. tại khách sạn ROOM_EXCLUSIVE, vai trò tùy chỉnh có baseRole HOTEL_FRONTDESK cũng nhận đúng allowedRoomId", async () => {
      const repository = createRepository({
        findActorById: jest.fn().mockResolvedValue({
          id: "staff-1",
          userRoles: [
            {
              role: {
                code: "CUSTOM_SALE",
                baseRole: { code: "HOTEL_FRONTDESK" },
              },
            },
          ],
          tenantUsers: [{ tenantId: "tenant-1" }],
          hotelAssignments: [{ hotelId: "hotel-1" }],
        }),
        findHotelById: jest.fn().mockResolvedValue({
          id: "hotel-1",
          tenantId: "tenant-1",
          staffScopeMode: "ROOM_EXCLUSIVE",
        }),
        findRoomStaffAssignment: jest.fn().mockResolvedValue({
          id: "assign-1",
          hotelId: "hotel-1",
          roomId: "room-102",
          userId: "staff-1",
        }),
      });
      const service = new HotelAccessService(repository as never);

      const scope = await service.resolveRoomScope("staff-1", "role-custom-sale", "hotel-1");

      expect(scope.allowedRoomId).toBe("room-102");
    });

    it("4. tại khách sạn ROOM_EXCLUSIVE, HOTEL_FRONTDESK chưa được gán phòng phải fail-closed (ném ForbiddenException)", async () => {
      const repository = createRepository({
        findActorById: jest.fn().mockResolvedValue({
          id: "staff-unassigned",
          userRoles: [{ role: { code: "HOTEL_FRONTDESK" } }],
          tenantUsers: [{ tenantId: "tenant-1" }],
          hotelAssignments: [{ hotelId: "hotel-1" }],
        }),
        findHotelById: jest.fn().mockResolvedValue({
          id: "hotel-1",
          tenantId: "tenant-1",
          staffScopeMode: "ROOM_EXCLUSIVE",
        }),
        findRoomStaffAssignment: jest.fn().mockResolvedValue(null),
      });
      const service = new HotelAccessService(repository as never);

      await expect(
        service.resolveRoomScope("staff-unassigned", "role-frontdesk", "hotel-1"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("5. vai trò chủ/quản lý (TENANT_OWNER, SUPER_ADMIN, HOTEL_OWNER, HOTEL_MANAGER) giữ nguyên phạm vi toàn khách sạn (allowedRoomId: null) kể cả tại ROOM_EXCLUSIVE", async () => {
      const repository = createRepository({
        findActorById: jest.fn().mockResolvedValue({
          id: "owner-1",
          userRoles: [{ role: { code: "TENANT_OWNER" } }],
          tenantUsers: [{ tenantId: "tenant-1" }],
          hotelAssignments: [],
        }),
        findHotelByIdAndTenantIds: jest.fn().mockResolvedValue({
          id: "hotel-1",
          tenantId: "tenant-1",
          staffScopeMode: "ROOM_EXCLUSIVE",
        }),
      });
      const service = new HotelAccessService(repository as never);

      const scope = await service.resolveRoomScope("owner-1", "role-tenant-owner", "hotel-1");

      expect(scope.allowedRoomId).toBeNull();
      expect(repository.findRoomStaffAssignment).not.toHaveBeenCalled();
    });

    it("6. cách ly vai trò phiên (session role isolation): vai trò hoạt động là HOTEL_FRONTDESK không được kế thừa quyền chủ sở hữu từ vai trò khác của user", async () => {
      // User có 2 role trong hệ thống, nhưng activeRoleId gửi lên chỉ là HOTEL_FRONTDESK
      const repository = createRepository({
        findActorById: jest.fn().mockResolvedValue({
          id: "user-with-multiple-roles",
          // findActorById lọc theo activeRoleId nên chỉ trả về role đang hoạt động
          userRoles: [{ role: { code: "HOTEL_FRONTDESK" } }],
          tenantUsers: [{ tenantId: "tenant-1" }],
          hotelAssignments: [{ hotelId: "hotel-1" }],
        }),
        findHotelById: jest.fn().mockResolvedValue({
          id: "hotel-1",
          tenantId: "tenant-1",
          staffScopeMode: "ROOM_EXCLUSIVE",
        }),
        findRoomStaffAssignment: jest.fn().mockResolvedValue({
          id: "assign-1",
          hotelId: "hotel-1",
          roomId: "room-101",
          userId: "user-with-multiple-roles",
        }),
      });
      const service = new HotelAccessService(repository as never);

      const scope = await service.resolveRoomScope(
        "user-with-multiple-roles",
        "role-frontdesk-id",
        "hotel-1",
      );

      // Phạm vi phải bị giới hạn vào room-101, không thể thành hotel-wide
      expect(scope.allowedRoomId).toBe("room-101");
    });
  });

  describe("assertRoomAccess", () => {
    it("7. tại khách sạn ROOM_EXCLUSIVE, cho phép truy cập đúng phòng được phân công", async () => {
      const repository = createRepository({
        findActorById: jest.fn().mockResolvedValue({
          id: "staff-1",
          userRoles: [{ role: { code: "HOTEL_FRONTDESK" } }],
          tenantUsers: [{ tenantId: "tenant-1" }],
          hotelAssignments: [{ hotelId: "hotel-1" }],
        }),
        findHotelById: jest.fn().mockResolvedValue({
          id: "hotel-1",
          tenantId: "tenant-1",
          staffScopeMode: "ROOM_EXCLUSIVE",
        }),
        findRoomStaffAssignment: jest.fn().mockResolvedValue({
          id: "assign-1",
          hotelId: "hotel-1",
          roomId: "room-101",
          userId: "staff-1",
        }),
        findRoomById: jest.fn().mockResolvedValue({
          id: "room-101",
          hotelId: "hotel-1",
          roomNumber: "101",
        }),
      });
      const service = new HotelAccessService(repository as never);

      const hotel = await service.assertRoomAccess(
        "staff-1",
        "role-frontdesk",
        "hotel-1",
        "room-101",
      );

      expect(hotel.id).toBe("hotel-1");
    });

    it("8. tại khách sạn ROOM_EXCLUSIVE, từ chối khi truy cập phòng của sale khác (guessed ID) bằng NotFoundException", async () => {
      const repository = createRepository({
        findActorById: jest.fn().mockResolvedValue({
          id: "staff-1",
          userRoles: [{ role: { code: "HOTEL_FRONTDESK" } }],
          tenantUsers: [{ tenantId: "tenant-1" }],
          hotelAssignments: [{ hotelId: "hotel-1" }],
        }),
        findHotelById: jest.fn().mockResolvedValue({
          id: "hotel-1",
          tenantId: "tenant-1",
          staffScopeMode: "ROOM_EXCLUSIVE",
        }),
        findRoomStaffAssignment: jest.fn().mockResolvedValue({
          id: "assign-1",
          hotelId: "hotel-1",
          roomId: "room-101",
          userId: "staff-1",
        }),
      });
      const service = new HotelAccessService(repository as never);

      await expect(
        service.assertRoomAccess("staff-1", "role-frontdesk", "hotel-1", "room-102"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("9. tại khách sạn HOTEL_WIDE, cho phép truy cập bất kỳ phòng nào thuộc khách sạn", async () => {
      const repository = createRepository({
        findActorById: jest.fn().mockResolvedValue({
          id: "staff-1",
          userRoles: [{ role: { code: "HOTEL_FRONTDESK" } }],
          tenantUsers: [{ tenantId: "tenant-1" }],
          hotelAssignments: [{ hotelId: "hotel-1" }],
        }),
        findHotelById: jest.fn().mockResolvedValue({
          id: "hotel-1",
          tenantId: "tenant-1",
          staffScopeMode: "HOTEL_WIDE",
        }),
        findRoomById: jest.fn().mockResolvedValue({
          id: "room-any",
          hotelId: "hotel-1",
          roomNumber: "201",
        }),
      });
      const service = new HotelAccessService(repository as never);

      const hotel = await service.assertRoomAccess(
        "staff-1",
        "role-frontdesk",
        "hotel-1",
        "room-any",
      );

      expect(hotel.id).toBe("hotel-1");
      expect(repository.findRoomById).toHaveBeenCalledWith("room-any");
    });

    it("10. từ chối khi phòng không thuộc khách sạn hoặc không tồn tại", async () => {
      const repository = createRepository({
        findActorById: jest.fn().mockResolvedValue({
          id: "staff-1",
          userRoles: [{ role: { code: "HOTEL_FRONTDESK" } }],
          tenantUsers: [{ tenantId: "tenant-1" }],
          hotelAssignments: [{ hotelId: "hotel-1" }],
        }),
        findHotelById: jest.fn().mockResolvedValue({
          id: "hotel-1",
          tenantId: "tenant-1",
          staffScopeMode: "HOTEL_WIDE",
        }),
        findRoomById: jest.fn().mockResolvedValue({
          id: "room-foreign",
          hotelId: "hotel-2",
          roomNumber: "999",
        }),
      });
      const service = new HotelAccessService(repository as never);

      await expect(
        service.assertRoomAccess("staff-1", "role-frontdesk", "hotel-1", "room-foreign"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("Phase 3: HotelRoomsService & ReservationsService Room Scope", () => {
    const mockHotelAccessService = {
      assertHotelAccess: jest.fn(),
      resolveRoomScope: jest.fn(),
      assertRoomAccess: jest.fn(),
    };
    const mockHotelRoomsRepo = {
      listRooms: jest.fn(),
      findRoomInHotel: jest.fn(),
      updateRoom: jest.fn(),
      createStay: jest.fn(),
      findStayInHotel: jest.fn(),
      checkInStay: jest.fn(),
      checkOutStay: jest.fn(),
      findBlockingBillingFolio: jest.fn(),
    };
    const mockCodesService = {
      generateEntityCode: jest.fn().mockResolvedValue("CODE_1"),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("11. HotelRoomsService.listRooms: chỉ lọc phòng được phân công khi sale bị giới hạn room scope", async () => {
      mockHotelAccessService.resolveRoomScope.mockResolvedValue({
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-101",
      });
      mockHotelRoomsRepo.listRooms.mockResolvedValue({
        total: 1,
        items: [
          {
            id: "room-101",
            roomNumber: "101",
            floor: "1",
            type: "DELUXE",
            status: "AVAILABLE",
            price: null,
            maxActiveGuestDevices: null,
            qrCodes: [],
            guestStays: [],
            activeGuestDeviceCount: 0,
          },
        ],
        floors: [{ floor: "1" }],
        types: [{ type: "DELUXE" }],
      });

      const service = new HotelRoomsService(
        mockHotelRoomsRepo as any,
        mockCodesService as any,
        mockHotelAccessService as any,
      );

      const result = await service.listRooms("sale-1", "role-fd", "hotel-1", {
        page: 1,
        limit: 20,
      });

      expect(mockHotelAccessService.resolveRoomScope).toHaveBeenCalledWith(
        "sale-1",
        "role-fd",
        "hotel-1",
      );
      expect(mockHotelRoomsRepo.listRooms).toHaveBeenCalledWith(
        expect.objectContaining({
          hotelId: "hotel-1",
          id: "room-101",
        }),
        0,
        20,
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("room-101");
    });

    it("12. HotelRoomsService.updateRoom: gọi assertRoomAccess trước khi cập nhật phòng", async () => {
      mockHotelAccessService.assertRoomAccess.mockRejectedValue(
        new NotFoundException("Không tìm thấy phòng"),
      );

      const service = new HotelRoomsService(
        mockHotelRoomsRepo as any,
        mockCodesService as any,
        mockHotelAccessService as any,
      );

      await expect(
        service.updateRoom("sale-1", "role-fd", "hotel-1", "room-other", { roomNumber: "999" }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockHotelAccessService.assertRoomAccess).toHaveBeenCalledWith(
        "sale-1",
        "role-fd",
        "hotel-1",
        "room-other",
      );
    });

    it("13. HotelRoomsService.checkInStay: từ chối check-in khi stay thuộc phòng khác", async () => {
      mockHotelRoomsRepo.findStayInHotel.mockResolvedValue({
        id: "stay-other",
        roomId: "room-other",
        status: "RESERVED",
      });
      mockHotelAccessService.assertRoomAccess.mockRejectedValue(
        new NotFoundException("Không tìm thấy phòng"),
      );

      const service = new HotelRoomsService(
        mockHotelRoomsRepo as any,
        mockCodesService as any,
        mockHotelAccessService as any,
      );

      await expect(
        service.checkInStay("sale-1", "role-fd", "hotel-1", "stay-other"),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockHotelAccessService.assertRoomAccess).toHaveBeenCalledWith(
        "sale-1",
        "role-fd",
        "hotel-1",
        "room-other",
      );
    });

    it("14. ReservationsService.createReservation: tự động gán allowedRoomId cho đặt phòng của scoped sale", async () => {
      mockHotelAccessService.resolveRoomScope.mockResolvedValue({
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-101",
      });
      const mockReservationsRepo = {
        createReservation: jest.fn().mockResolvedValue({
          id: "res-1",
          hotelId: "hotel-1",
          roomId: "room-101",
          status: "CONFIRMED",
        }),
      };

      const resService = new ReservationsService(
        mockReservationsRepo as any,
        mockCodesService as any,
        mockHotelAccessService as any,
      );

      await resService.createReservation("sale-1", "role-fd", "hotel-1", {
        guestDisplayName: "Khach Hang A",
        plannedCheckInAt: new Date("2026-10-01T12:00:00Z"),
        plannedCheckOutAt: new Date("2026-10-03T12:00:00Z"),
      });

      expect(mockReservationsRepo.createReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          hotelId: "hotel-1",
          roomId: "room-101",
        }),
      );
    });

    it("15. HotelRequestsService.listRequests: giới hạn where.roomId theo allowedRoomId khi ROOM_EXCLUSIVE", async () => {
      const mockRequestsRepo = {
        listRequests: jest.fn().mockResolvedValue([0, []]),
        summarizeRequests: jest.fn().mockResolvedValue({ total: 0, statuses: {} }),
      };
      mockHotelAccessService.resolveRoomScope.mockResolvedValue({
        mode: "ROOM_EXCLUSIVE",
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-101",
      });

      const service = new HotelRequestsService(
        mockRequestsRepo as any,
        mockHotelAccessService as any,
      );

      await service.listRequests("sale-1", "role-fd", "hotel-1", {});

      expect(mockRequestsRepo.listRequests).toHaveBeenCalledWith(
        expect.objectContaining({
          hotelId: "hotel-1",
          roomId: "room-101",
        }),
        expect.any(Number),
        expect.any(Number),
      );
    });

    it("16. HotelRequestsService.getRequestDetail: từ chối khi request thuộc phòng khác", async () => {
      const mockRequestsRepo = {
        findRequestDetailInHotel: jest.fn().mockResolvedValue({
          id: "req-1",
          hotelId: "hotel-1",
          roomId: "room-other",
          status: "CREATED",
          priority: "NORMAL",
          createdAt: new Date(),
          events: [],
          stay: { room: { roomNumber: "999" } },
        }),
      };
      mockHotelAccessService.resolveRoomScope.mockResolvedValue({
        mode: "ROOM_EXCLUSIVE",
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-101",
      });
      mockHotelAccessService.assertRoomAccess.mockImplementation((scope: any, roomId: string) => {
        if (scope.mode === "ROOM_EXCLUSIVE" && scope.allowedRoomId !== roomId) {
          throw new NotFoundException("Không tìm thấy phòng");
        }
      });

      const service = new HotelRequestsService(
        mockRequestsRepo as any,
        mockHotelAccessService as any,
      );

      await expect(
        service.getRequestDetail("sale-1", "role-fd", "hotel-1", "req-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("17. GuestMessagesService.listForHotel: truyền roomId theo allowedRoomId", async () => {
      const mockMessagesRepo = {
        listHotelThreads: jest.fn().mockResolvedValue({ total: 0, items: [], hasMore: false }),
      };
      mockHotelAccessService.resolveRoomScope.mockResolvedValue({
        mode: "ROOM_EXCLUSIVE",
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-101",
      });

      const service = new GuestMessagesService(
        mockMessagesRepo as any,
        mockHotelAccessService as any,
      );

      await service.listForHotel("sale-1", "role-fd", "hotel-1");

      expect(mockMessagesRepo.listHotelThreads).toHaveBeenCalledWith(
        "hotel-1",
        expect.any(Number),
        undefined,
        undefined,
        "room-101",
      );
    });

    it("18. BillingService.listFolios: truyền roomId theo allowedRoomId", async () => {
      const mockBillingRepo = {
        listFolios: jest.fn().mockResolvedValue({ total: 0, rows: [] }),
      };
      mockHotelAccessService.resolveRoomScope.mockResolvedValue({
        mode: "ROOM_EXCLUSIVE",
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-101",
      });

      const service = new BillingService(
        mockBillingRepo as any,
        mockHotelAccessService as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.listFolios("sale-1", "role-fd", "hotel-1", {});

      expect(mockBillingRepo.listFolios).toHaveBeenCalledWith(
        expect.objectContaining({
          hotelId: "hotel-1",
          roomId: "room-101",
        }),
      );
    });

    it("19. RequestRealtimeTicketService.issueOwnerTicket: ký payload chứa roomId cho nhân viên phòng cố định", async () => {
      mockHotelAccessService.resolveRoomScope.mockResolvedValue({
        mode: "ROOM_EXCLUSIVE",
        hotel: { id: "hotel-1", tenantId: "tenant-1" },
        allowedRoomId: "room-101",
      });
      const mockJwt = {
        signAsync: jest.fn().mockResolvedValue("mocked-ticket"),
      };

      const service = new RequestRealtimeTicketService(
        mockHotelAccessService as any,
        mockJwt as any,
        {} as any,
        { enabled: true, ticketSecret: "test-secret", audience: "request-realtime" as const, ticketTtlSeconds: 300 },
      );

      await service.issueOwnerTicket("sale-1", "role-fd", "hotel-1");

      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          hotelId: "hotel-1",
          roomId: "room-101",
          type: "request_realtime_owner",
        }),
        expect.any(Object),
      );
    });
  });
});
