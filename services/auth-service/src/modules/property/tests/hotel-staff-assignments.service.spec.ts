import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { HotelStaffAssignmentsService } from "../application/hotel-staff-assignments.service";
import { HotelAccessService } from "../application/hotel-access.service";
import { HotelStaffAssignmentsRepository } from "../infrastructure/repositories/hotel-staff-assignments.repository";
import { HotelUserDirectoryService } from "../../identity/identity-public";

describe("HotelStaffAssignmentsService", () => {
  const hotelAccessService = {
    assertHotelAccess: jest.fn(),
  };
  const directory = {
    assertAssignableHotelUser: jest.fn(),
    listHotelUsersByIds: jest.fn(),
  };
  const repository = {
    listByHotel: jest.fn(),
    activateExclusive: jest.fn(),
    revoke: jest.fn(),
  };
  let service: HotelStaffAssignmentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HotelStaffAssignmentsService(
      hotelAccessService as unknown as HotelAccessService,
      directory as unknown as HotelUserDirectoryService,
      repository as unknown as HotelStaffAssignmentsRepository,
    );
  });

  it("binds assignment creation to active role hotel scope and tenant membership", async () => {
    hotelAccessService.assertHotelAccess.mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" });
    directory.assertAssignableHotelUser.mockResolvedValue({
      id: "staff-1",
      email: "staff@example.com",
      fullName: "Staff",
      roles: [{ id: "frontdesk", code: "HOTEL_FRONTDESK", name: "Lễ tân" }],
    });
    repository.activateExclusive.mockResolvedValue({
      id: "assignment-1",
      hotelId: "hotel-1",
      userId: "staff-1",
    });

    await service.assign("owner-1", "role-owner", "hotel-1", "staff-1");

    expect(hotelAccessService.assertHotelAccess).toHaveBeenCalledWith(
      "owner-1",
      "role-owner",
      "hotel-1",
    );
    expect(directory.assertAssignableHotelUser).toHaveBeenCalledWith("tenant-1", "staff-1");
    expect(repository.activateExclusive).toHaveBeenCalledWith("hotel-1", "staff-1", "owner-1");
  });

  it("fails closed when revoking a missing active assignment", async () => {
    hotelAccessService.assertHotelAccess.mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" });
    repository.revoke.mockResolvedValue({ count: 0 });

    await expect(
      service.revoke("owner-1", "role-owner", "hotel-1", "staff-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects self hotel assignment", async () => {
    await expect(
      service.assign("owner-1", "role-owner", "hotel-1", "owner-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects self assignment revocation", async () => {
    await expect(
      service.revoke("owner-1", "role-owner", "hotel-1", "owner-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe("Room Assignment (Phase 2)", () => {
    it("assignRoom: phân công nhân viên front-desk vào phòng trống thành công", async () => {
      hotelAccessService.assertHotelAccess.mockResolvedValue({
        id: "hotel-1",
        tenantId: "tenant-1",
      });
      (repository as any).assertEligibleFrontDeskStaff = jest.fn().mockResolvedValue(undefined);
      (repository as any).assignRoom = jest.fn().mockResolvedValue({
        id: "room-assign-1",
        hotelId: "hotel-1",
        userId: "staff-1",
        roomId: "room-101",
        roomNumber: "101",
        assignedAt: new Date(),
      });

      const result = await (service as any).assignRoom(
        "owner-1",
        "role-owner",
        "hotel-1",
        "staff-1",
        { roomId: "room-101" },
      );

      expect(hotelAccessService.assertHotelAccess).toHaveBeenCalledWith(
        "owner-1",
        "role-owner",
        "hotel-1",
      );
      expect((repository as any).assertEligibleFrontDeskStaff).toHaveBeenCalledWith(
        "hotel-1",
        "staff-1",
      );
      expect((repository as any).assignRoom).toHaveBeenCalledWith(
        "hotel-1",
        "staff-1",
        "room-101",
        "owner-1",
        "tenant-1",
      );
      expect(result.roomId).toBe("room-101");
    });

    it("unassignRoom: hủy phân công phòng thành công", async () => {
      hotelAccessService.assertHotelAccess.mockResolvedValue({
        id: "hotel-1",
        tenantId: "tenant-1",
      });
      (repository as any).unassignRoom = jest.fn().mockResolvedValue({
        unassigned: true,
        hotelId: "hotel-1",
        userId: "staff-1",
        roomId: "room-101",
      });

      const result = await (service as any).unassignRoom(
        "owner-1",
        "role-owner",
        "hotel-1",
        "staff-1",
      );

      expect(result).toEqual({
        unassigned: true,
        hotelId: "hotel-1",
        userId: "staff-1",
        roomId: "room-101",
      });
    });

    it("unassignRoom: ném NotFoundException khi nhân viên chưa có phòng được gán", async () => {
      hotelAccessService.assertHotelAccess.mockResolvedValue({
        id: "hotel-1",
        tenantId: "tenant-1",
      });
      (repository as any).unassignRoom = jest.fn().mockResolvedValue(null);

      await expect(
        (service as any).unassignRoom("owner-1", "role-owner", "hotel-1", "staff-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("list: trả về danh sách phân công bao gồm roomAssignment", async () => {
      hotelAccessService.assertHotelAccess.mockResolvedValue({
        id: "hotel-1",
        tenantId: "tenant-1",
      });
      repository.listByHotel.mockResolvedValue([
        1,
        [
          {
            id: "assignment-1",
            userId: "staff-1",
            hotelId: "hotel-1",
            status: "ACTIVE",
            assignedAt: new Date(),
            assignedById: "owner-1",
            revokedAt: null,
            revokedById: null,
          },
        ],
      ]);
      directory.listHotelUsersByIds.mockResolvedValue([
        {
          id: "staff-1",
          email: "staff1@example.com",
          fullName: "Staff 1",
          roles: [{ id: "role-fd", code: "HOTEL_FRONTDESK", name: "Lễ tân" }],
        },
      ]);
      (repository as any).listRoomAssignmentsByUserIds = jest.fn().mockResolvedValue([
        {
          id: "ra-1",
          userId: "staff-1",
          roomId: "room-101",
          assignedAt: new Date(),
          room: { id: "room-101", roomNumber: "101" },
        },
      ]);

      const result = await service.list("owner-1", "role-owner", "hotel-1", {
        page: 1,
        limit: 20,
        status: "ACTIVE",
      });

      expect(result.items[0]).toHaveProperty("roomAssignment");
      expect((result.items[0] as any).roomAssignment).toMatchObject({
        roomId: "room-101",
        roomNumber: "101",
      });
    });
  });
});
