import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { TenantUserStatus, UserType } from "@prisma/client";
import { HotelUsersRepository } from "../infrastructure/repositories/hotel-users.repository";
import { HotelUsersService } from "../application/hotel-users.service";
import { AuthService } from "../application/authentication.service";

describe("HotelUsersService", () => {
  let service: HotelUsersService;
  let hotelUsersRepository: {
    findActorById: jest.Mock;
    listTenantUsers: jest.Mock;
    findTenantUserMembership: jest.Mock;
    findRolesByIds: jest.Mock;
    revokeActiveUserRole: jest.Mock;
  };

  beforeEach(() => {
    hotelUsersRepository = {
      findActorById: jest.fn(),
      listTenantUsers: jest.fn(),
      findTenantUserMembership: jest.fn(),
      findRolesByIds: jest.fn(),
      revokeActiveUserRole: jest.fn(),
    };

    service = new HotelUsersService(
      hotelUsersRepository as unknown as HotelUsersRepository,
      { revokeUserRoleSessions: jest.fn() } as unknown as AuthService,
    );
  });

  it("defaults list filter status to ACTIVE", async () => {
    hotelUsersRepository.findActorById.mockResolvedValue({
      id: "actor-1",
      userRoles: [{ role: { code: "HOTEL_MANAGER" } }],
      tenantUsers: [{ tenantId: "tenant-1" }],
    });

    hotelUsersRepository.listTenantUsers.mockResolvedValue([
      1,
      [
        {
          tenantId: "tenant-1",
          status: TenantUserStatus.ACTIVE,
          joinedAt: new Date("2026-01-01T00:00:00.000Z"),
          user: {
            id: "u1",
            email: "u1@example.com",
            fullName: "User 1",
            status: "ACTIVE",
            userType: UserType.HOTEL_STAFF,
            userRoles: [],
          },
        },
      ],
    ]);

    await service.listHotelUsers("actor-1", undefined, {});

    expect(hotelUsersRepository.listTenantUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TenantUserStatus.ACTIVE,
      }),
      0,
      20,
    );
  });

  it("requires tenantId when super admin request has no tenant hint", async () => {
    hotelUsersRepository.findActorById.mockResolvedValue({
      id: "actor-1",
      userRoles: [{ role: { code: "SUPER_ADMIN" } }],
      tenantUsers: [],
    });

    await expect(service.listHotelUsers("actor-1", undefined, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("blocks assigning protected roles", async () => {
    hotelUsersRepository.findActorById.mockResolvedValue({
      id: "actor-1",
      userRoles: [{ role: { code: "HOTEL_OWNER" } }],
      tenantUsers: [{ tenantId: "tenant-1" }],
    });
    hotelUsersRepository.findTenantUserMembership.mockResolvedValue({
      joinedAt: null,
      user: {
        userType: UserType.HOTEL_STAFF,
      },
    });
    hotelUsersRepository.findRolesByIds.mockResolvedValue([
      {
        id: "role-1",
        code: "SUPER_ADMIN",
        name: "Super Admin",
      },
    ]);

    await expect(
      service.assignHotelUserRoles("actor-1", "tenant-1", "target-user", {
        roleIds: ["role-1"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("revokes role by soft status transition", async () => {
    hotelUsersRepository.findActorById.mockResolvedValue({
      id: "actor-1",
      userRoles: [{ role: { code: "HOTEL_MANAGER" } }],
      tenantUsers: [{ tenantId: "tenant-1" }],
    });
    hotelUsersRepository.findTenantUserMembership.mockResolvedValue({
      joinedAt: null,
      user: {
        userType: UserType.HOTEL_STAFF,
      },
    });
    hotelUsersRepository.findRolesByIds.mockResolvedValue([
      {
        id: "role-1",
        code: "HOTEL_FRONTDESK",
        name: "Frontdesk",
      },
    ]);
    hotelUsersRepository.revokeActiveUserRole.mockResolvedValue({ count: 1 });

    const result = await service.revokeHotelUserRole(
      "actor-1",
      "tenant-1",
      "target-user",
      "role-1",
    );

    expect(result).toEqual({
      revoked: true,
      userId: "target-user",
      roleId: "role-1",
    });
    expect(hotelUsersRepository.revokeActiveUserRole).toHaveBeenCalledWith(
      "target-user",
      "role-1",
      "actor-1",
    );
  });

  it("returns not found when revoke target has no active membership", async () => {
    hotelUsersRepository.findActorById.mockResolvedValue({
      id: "actor-1",
      userRoles: [{ role: { code: "HOTEL_MANAGER" } }],
      tenantUsers: [{ tenantId: "tenant-1" }],
    });
    hotelUsersRepository.findTenantUserMembership.mockResolvedValue({
      joinedAt: null,
      user: {
        userType: UserType.HOTEL_STAFF,
      },
    });
    hotelUsersRepository.findRolesByIds.mockResolvedValue([
      {
        id: "role-1",
        code: "HOTEL_FRONTDESK",
        name: "Frontdesk",
      },
    ]);
    hotelUsersRepository.revokeActiveUserRole.mockResolvedValue({ count: 0 });

    await expect(
      service.revokeHotelUserRole("actor-1", "tenant-1", "target-user", "role-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
