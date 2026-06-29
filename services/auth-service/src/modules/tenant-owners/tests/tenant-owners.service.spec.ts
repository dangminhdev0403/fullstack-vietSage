import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { TenantUserStatus, UserStatus, UserType } from "@prisma/client";
import {
  TenantOwnerRoleNotConfiguredError,
  TenantOwnersRepository,
} from "../tenant-owners.repository";
import { TenantOwnersService } from "../tenant-owners.service";

describe("TenantOwnersService", () => {
  let service: TenantOwnersService;
  let codesService: {
    generateEntityCode: jest.Mock;
  };
  let tenantOwnersRepository: {
    findActorRoleCodes: jest.Mock;
    buildTenantOwnerWhere: jest.Mock;
    buildTenantUserWhere: jest.Mock;
    listTenantOwners: jest.Mock;
    findTenantOwnerByUserId: jest.Mock;
    createTenantOwner: jest.Mock;
    updateTenantOwner: jest.Mock;
  };

  const tenantOwnerRow = {
    id: "user-1",
    email: "owner@example.com",
    fullName: "Tenant Owner",
    status: UserStatus.ACTIVE,
    userType: UserType.PARTNER,
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
    updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    tenantUsers: [
      {
        id: "tenant-user-1",
        tenantId: "tenant-1",
        userId: "user-1",
        status: TenantUserStatus.ACTIVE,
        joinedAt: new Date("2026-06-04T00:00:00.000Z"),
        createdAt: new Date("2026-06-04T00:00:00.000Z"),
        updatedAt: new Date("2026-06-04T00:00:00.000Z"),
        tenant: {
          id: "tenant-1",
          code: "RIVERSIDE",
          name: "Riverside Hotel Group",
          createdAt: new Date("2026-06-04T00:00:00.000Z"),
          updatedAt: new Date("2026-06-04T00:00:00.000Z"),
        },
      },
    ],
    userRoles: [
      {
        assignedAt: new Date("2026-06-04T00:00:00.000Z"),
        assignedById: "super-admin-1",
        role: {
          id: "role-tenant-owner",
          code: "TENANT_OWNER",
          name: "Tenant Owner",
        },
      },
    ],
  };

  beforeEach(() => {
    tenantOwnersRepository = {
      findActorRoleCodes: jest.fn().mockResolvedValue(["SUPER_ADMIN"]),
      buildTenantOwnerWhere: jest.fn().mockReturnValue({ owner: true }),
      buildTenantUserWhere: jest.fn().mockReturnValue({ tenantUser: true }),
      listTenantOwners: jest.fn().mockResolvedValue([1, [tenantOwnerRow]]),
      findTenantOwnerByUserId: jest.fn().mockResolvedValue(tenantOwnerRow),
      createTenantOwner: jest.fn().mockResolvedValue(tenantOwnerRow),
      updateTenantOwner: jest.fn().mockResolvedValue(tenantOwnerRow),
    };
    codesService = {
      generateEntityCode: jest.fn().mockResolvedValue("VSH_TENANT_0001"),
    };

    service = new TenantOwnersService(
      tenantOwnersRepository as unknown as TenantOwnersRepository,
      codesService as never,
    );
  });

  it("lists tenant owners with defaults and user-centric items", async () => {
    const result = await service.listTenantOwners("actor-1", {});

    expect(tenantOwnersRepository.listTenantOwners).toHaveBeenCalledWith(
      { owner: true },
      { tenantUser: true },
      0,
      20,
    );
    expect(result.items[0]).toMatchObject({
      id: "user-1",
      userType: UserType.PARTNER,
      tenant: { id: "tenant-1", code: "RIVERSIDE" },
      tenantUser: { id: "tenant-user-1", status: TenantUserStatus.ACTIVE },
      role: { code: "TENANT_OWNER" },
    });
  });

  it("blocks non SUPER_ADMIN actors", async () => {
    tenantOwnersRepository.findActorRoleCodes.mockResolvedValue(["TENANT_OWNER"]);

    await expect(service.listTenantOwners("actor-1", {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("creates tenant owner using normalized email and PARTNER userType", async () => {
    await service.createTenantOwner("super-admin-1", {
      owner: {
        fullName: " Tenant Owner ",
        email: "OWNER@Example.COM",
        password: "ChangeMe123!",
      },
      tenant: {
        name: " Riverside Hotel Group ",
      },
    });

    expect(codesService.generateEntityCode).toHaveBeenCalledWith("TENANT");
    expect(tenantOwnersRepository.createTenantOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedEmail: "owner@example.com",
        fullName: "Tenant Owner",
        tenantCode: "VSH_TENANT_0001",
        tenantName: "Riverside Hotel Group",
        assignedById: "super-admin-1",
      }),
    );
    expect(tenantOwnersRepository.createTenantOwner.mock.calls[0][0].passwordHash).toEqual(
      expect.stringContaining("$argon2"),
    );
  });

  it("returns conflict when TENANT_OWNER role is not configured", async () => {
    tenantOwnersRepository.createTenantOwner.mockRejectedValue(
      new TenantOwnerRoleNotConfiguredError(),
    );

    await expect(
      service.createTenantOwner("super-admin-1", {
        owner: {
          fullName: "Tenant Owner",
          email: "owner@example.com",
          password: "ChangeMe123!",
        },
        tenant: {
          name: "Riverside Hotel Group",
        },
      }),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      message: "Vai trò TENANT_OWNER chưa được cấu hình",
    });
  });

  it("gets tenant owner by User.id", async () => {
    await service.getTenantOwner("actor-1", "user-1");

    expect(tenantOwnersRepository.findTenantOwnerByUserId).toHaveBeenCalledWith("user-1");
  });

  it("returns not found for missing tenant owner", async () => {
    tenantOwnersRepository.findTenantOwnerByUserId.mockResolvedValue(null);

    await expect(service.getTenantOwner("actor-1", "missing-user")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("updates owner, tenant, and tenant link fields", async () => {
    await service.updateTenantOwner("actor-1", "user-1", {
      owner: { fullName: "Updated Owner", status: UserStatus.LOCKED },
      tenant: { name: "Updated Tenant" },
      tenantUserStatus: TenantUserStatus.DISABLED,
    });

    expect(tenantOwnersRepository.updateTenantOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        tenantUserId: "tenant-user-1",
        tenantId: "tenant-1",
        owner: { fullName: "Updated Owner", status: UserStatus.LOCKED },
        tenant: { name: "Updated Tenant" },
        tenantUserStatus: TenantUserStatus.DISABLED,
      }),
    );
  });
});
