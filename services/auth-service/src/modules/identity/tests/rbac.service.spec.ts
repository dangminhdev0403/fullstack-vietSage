import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { HttpMethod, RoleStatus } from "@prisma/client";
import { RbacRepository } from "../infrastructure/repositories/rbac.repository";
import { RbacService } from "../application/rbac.service";

describe("RbacService", () => {
  let service: RbacService;
  let rbacRepository: {
    createRole: jest.Mock;
    listRolesWithRelations: jest.Mock;
    findRoleWithRelationsById: jest.Mock;
    findRoleWithRelationsByName: jest.Mock;
    findRoleById: jest.Mock;
    updateRole: jest.Mock;
    disableRole: jest.Mock;
    deleteRole: jest.Mock;
    listPermissions: jest.Mock;
    listPermissionTotalsByModule: jest.Mock;
    listRolePermissionModuleKeys: jest.Mock;
    countPermissionsByModuleKey: jest.Mock;
    countRolePermissionsByModuleKey: jest.Mock;
    listPermissionsByModuleKey: jest.Mock;
    listRolePermissionIdsByRoleAndPermissionIds: jest.Mock;
    findPermissionById: jest.Mock;
    listRolePermissions: jest.Mock;
    createRolePermissions: jest.Mock;
    deleteRolePermissions: jest.Mock;
    clearRolePermissions: jest.Mock;
    replaceRolePermissions: jest.Mock;
    findPermissionsByIds: jest.Mock;
    findPermissionsByIdsWithModuleKey: jest.Mock;
    listActiveSystemRoleCodesByUserId: jest.Mock;
    listActivePermissionIdsByUserId: jest.Mock;
  };

  beforeEach(() => {
    rbacRepository = {
      createRole: jest.fn(),
      listRolesWithRelations: jest.fn(),
      findRoleWithRelationsById: jest.fn(),
      findRoleWithRelationsByName: jest.fn(),
      findRoleById: jest.fn(),
      updateRole: jest.fn(),
      disableRole: jest.fn(),
      deleteRole: jest.fn(),
      listPermissions: jest.fn(),
      listPermissionTotalsByModule: jest.fn(),
      listRolePermissionModuleKeys: jest.fn(),
      countPermissionsByModuleKey: jest.fn(),
      countRolePermissionsByModuleKey: jest.fn(),
      listPermissionsByModuleKey: jest.fn(),
      listRolePermissionIdsByRoleAndPermissionIds: jest.fn(),
      findPermissionById: jest.fn(),
      listRolePermissions: jest.fn(),
      createRolePermissions: jest.fn(),
      deleteRolePermissions: jest.fn(),
      clearRolePermissions: jest.fn(),
      replaceRolePermissions: jest.fn(),
      findPermissionsByIds: jest.fn(),
      findPermissionsByIdsWithModuleKey: jest.fn(),
      listActiveSystemRoleCodesByUserId: jest.fn(),
      listActivePermissionIdsByUserId: jest.fn(),
    };

    service = new RbacService(rbacRepository as unknown as RbacRepository);
  });

  it("creates role with normalized code", async () => {
    rbacRepository.createRole.mockResolvedValue({ id: "r1", code: "HOTEL_STAFF" });

    await service.createRole({
      code: "hotel_staff",
      name: "Hotel Staff",
      description: "Operational role",
    });

    expect(rbacRepository.createRole).toHaveBeenCalledWith({
      code: "HOTEL_STAFF",
      name: "Hotel Staff",
      description: "Operational role",
    });
  });

  it("returns frontend navigation roles with mapped menus", async () => {
    rbacRepository.listRolesWithRelations.mockResolvedValue([
      {
        id: "r1",
        code: "HOTEL_MANAGER",
        name: "Hotel Manager",
        description: null,
        status: RoleStatus.ACTIVE,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        _count: { rolePermissions: 6 },
        rolePermissions: [
          { permission: { path: "/roles" } },
          { permission: { path: "/roles/:id/permissions" } },
          { permission: { path: "/hotel-users/:id" } },
          { permission: { path: "/v1/bookings/:id" } },
          { permission: { path: "/permissions" } },
          { permission: { path: "/auth/login" } },
        ],
      },
      {
        id: "r2",
        code: "HOTEL_STAFF",
        name: "Hotel Staff",
        description: null,
        status: RoleStatus.ACTIVE,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        _count: { rolePermissions: 0 },
        rolePermissions: [],
      },
    ]);

    const result = await service.listRoles();

    expect(result).toEqual([
      {
        id: "r1",
        code: "HOTEL_MANAGER",
        description: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        name: "Hotel Manager",
        status: RoleStatus.ACTIVE,
        menus: ["/dashboard", "/users", "/roles", "/bookings", "/permissions"],
        enabledCount: 6,
      },
      {
        id: "r2",
        code: "HOTEL_STAFF",
        description: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        name: "Hotel Staff",
        status: RoleStatus.ACTIVE,
        menus: ["/dashboard"],
        enabledCount: 0,
      },
    ]);
  });

  it("normalizes role code into navigation id slug", async () => {
    rbacRepository.listRolesWithRelations.mockResolvedValue([
      {
        id: "r3",
        code: "HOTEL  MANAGER++",
        name: "Hotel Manager",
        description: null,
        status: RoleStatus.ACTIVE,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        _count: { rolePermissions: 0 },
        rolePermissions: [],
      },
    ]);

    const result = await service.listRoles();

    expect(result).toEqual([
      {
        id: "r3",
        code: "HOTEL  MANAGER++",
        description: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        name: "Hotel Manager",
        status: RoleStatus.ACTIVE,
        menus: ["/dashboard"],
        enabledCount: 0,
      },
    ]);
  });

  it("returns menus for a hidden super admin role by id", async () => {
    rbacRepository.findRoleWithRelationsById.mockResolvedValue({
      id: "role_super_admin_001",
      code: "SUPER_ADMIN",
      name: "Super Admin",
      description: null,
      status: RoleStatus.ACTIVE,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      _count: { rolePermissions: 5 },
      rolePermissions: [
        { permission: { path: "/hotels" } },
        { permission: { path: "/hotel-users" } },
        { permission: { path: "/roles" } },
        { permission: { path: "/permissions" } },
        { permission: { path: "/auth/me" } },
      ],
    });

    await expect(service.getRoleMenus("role_super_admin_001")).resolves.toEqual([
      "/dashboard",
      "/hotels",
      "/users",
      "/roles",
      "/permissions",
    ]);
  });

  it("does not expose roles nav from hidden roles menus permission alone", async () => {
    rbacRepository.findRoleWithRelationsById.mockResolvedValue({
      id: "role_super_admin_001",
      code: "SUPER_ADMIN",
      name: "Super Admin",
      description: null,
      status: RoleStatus.ACTIVE,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      _count: { rolePermissions: 1 },
      rolePermissions: [{ permission: { path: "/roles/menus" } }],
    });

    await expect(service.getRoleMenus("role_super_admin_001")).resolves.toEqual(["/dashboard"]);
  });

  it("blocks updating protected role", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r1", code: "SUPER_ADMIN" });

    await expect(service.updateRole("r1", { name: "Renamed" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("blocks deleting protected role", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r1", code: "HOTEL_OWNER" });

    await expect(service.deleteRole("r1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("disables mutable role", async () => {
    rbacRepository.findRoleById.mockResolvedValue({
      id: "r1",
      code: "HOTEL_MANAGER",
      status: RoleStatus.ACTIVE,
    });
    rbacRepository.disableRole.mockResolvedValue({
      id: "r1",
      code: "HOTEL_MANAGER",
      status: RoleStatus.DISABLED,
    });

    await expect(service.disableRole("r1")).resolves.toEqual({
      id: "r1",
      code: "HOTEL_MANAGER",
      status: RoleStatus.DISABLED,
    });

    expect(rbacRepository.disableRole).toHaveBeenCalledWith("r1");
  });

  it("returns disabled role without rewriting it", async () => {
    const role = {
      id: "r1",
      code: "HOTEL_MANAGER",
      status: RoleStatus.DISABLED,
    };
    rbacRepository.findRoleById.mockResolvedValue(role);

    await expect(service.disableRole("r1")).resolves.toBe(role);

    expect(rbacRepository.disableRole).not.toHaveBeenCalled();
  });

  it("throws not found when role is missing", async () => {
    rbacRepository.findRoleWithRelationsById.mockResolvedValue(null);

    await expect(service.getRole("missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("gets role by trimmed name", async () => {
    const role = {
      id: "r1",
      code: "HOTEL_MANAGER",
      name: "Hotel Manager",
      rolePermissions: [],
      _count: { userRoles: 0, rolePermissions: 0 },
    };
    rbacRepository.findRoleWithRelationsByName.mockResolvedValue(role);

    await expect(service.getRoleByName(" Hotel Manager ")).resolves.toBe(role);

    expect(rbacRepository.findRoleWithRelationsByName).toHaveBeenCalledWith("Hotel Manager");
  });

  it("throws not found when role name is missing", async () => {
    rbacRepository.findRoleWithRelationsByName.mockResolvedValue(null);

    await expect(service.getRoleByName("Missing Role")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns role permission modules summary with counters", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r2", code: "HOTEL_MANAGER" });
    rbacRepository.listPermissionTotalsByModule.mockResolvedValue([
      { moduleKey: "permissions", _count: { _all: 1 } },
      { moduleKey: "auth", _count: { _all: 2 } },
      { moduleKey: "users", _count: { _all: 3 } },
      { moduleKey: "roles", _count: { _all: 2 } },
    ]);
    rbacRepository.listRolePermissionModuleKeys.mockResolvedValue([
      { permission: { moduleKey: "users" } },
      { permission: { moduleKey: "users" } },
      { permission: { moduleKey: "roles" } },
    ]);

    const result = await service.listRolePermissionModules("r2");

    expect(result).toEqual([
      {
        moduleKey: "users",
        moduleName: "Người dùng",
        totalPermissions: 3,
        enabledCount: 2,
        disabledCount: 1,
        allSelected: false,
        allDisabled: false,
      },
      {
        moduleKey: "roles",
        moduleName: "Vai trò",
        totalPermissions: 2,
        enabledCount: 1,
        disabledCount: 1,
        allSelected: false,
        allDisabled: false,
      },
      {
        moduleKey: "permissions",
        moduleName: "Quyền",
        totalPermissions: 1,
        enabledCount: 0,
        disabledCount: 1,
        allSelected: false,
        allDisabled: true,
      },
    ]);
  });

  it("lists paginated role permission module permissions", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r2", code: "HOTEL_MANAGER" });
    rbacRepository.countPermissionsByModuleKey.mockResolvedValue(3);
    rbacRepository.listPermissionsByModuleKey.mockResolvedValue([
      {
        id: "p1",
        method: HttpMethod.GET,
        description: "List users",
      },
      {
        id: "p2",
        method: HttpMethod.POST,
        description: "Create user",
      },
    ]);
    rbacRepository.listRolePermissionIdsByRoleAndPermissionIds.mockResolvedValue([
      { permissionId: "p2" },
    ]);

    const result = await service.listRolePermissionModulePermissions("r2", "users", {
      page: 1,
      limit: 2,
    });

    expect(result).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      items: [
        {
          permissionId: "p1",
          method: HttpMethod.GET,
          description: "List users",
          enabled: false,
        },
        {
          permissionId: "p2",
          method: HttpMethod.POST,
          description: "Create user",
          enabled: true,
        },
      ],
    });
  });

  it("throws not found when listing hidden module permissions", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r2", code: "HOTEL_MANAGER" });

    await expect(
      service.listRolePermissionModulePermissions("r2", "auth", { page: 1, limit: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("grants selected permissions in one module and returns updated summary", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r2", code: "HOTEL_MANAGER" });
    rbacRepository.countPermissionsByModuleKey.mockResolvedValue(2);
    rbacRepository.findPermissionsByIdsWithModuleKey.mockResolvedValue([
      { id: "p1", moduleKey: "users" },
      { id: "p2", moduleKey: "users" },
    ]);
    rbacRepository.listActiveSystemRoleCodesByUserId.mockResolvedValue(["SUPER_ADMIN"]);
    rbacRepository.createRolePermissions.mockResolvedValue({ count: 2 });
    rbacRepository.countRolePermissionsByModuleKey.mockResolvedValue(2);

    const result = await service.grantRolePermissionModulePermissions("actor-1", "r2", "users", {
      permissionIds: ["p1", "p1", "p2"],
    });

    expect(rbacRepository.createRolePermissions).toHaveBeenCalledWith("r2", ["p1", "p2"]);
    expect(result).toEqual({
      moduleKey: "users",
      moduleName: "Người dùng",
      totalPermissions: 2,
      enabledCount: 2,
      disabledCount: 0,
      allSelected: true,
      allDisabled: false,
    });
  });

  it("rejects granting permission ids outside the requested module", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r2", code: "HOTEL_MANAGER" });
    rbacRepository.countPermissionsByModuleKey.mockResolvedValue(2);
    rbacRepository.findPermissionsByIdsWithModuleKey.mockResolvedValue([
      { id: "p1", moduleKey: "users" },
      { id: "p2", moduleKey: "roles" },
    ]);

    await expect(
      service.grantRolePermissionModulePermissions("actor-1", "r2", "users", {
        permissionIds: ["p1", "p2"],
      }),
    ).rejects.toThrow("Các id quyền không thuộc nhóm users: p2");
  });

  it("allows super admin to change module permissions for tenant owner", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r1", code: "TENANT_OWNER" });
    rbacRepository.countPermissionsByModuleKey.mockResolvedValue(1);
    rbacRepository.findPermissionsByIdsWithModuleKey.mockResolvedValue([
      { id: "p1", moduleKey: "users" },
    ]);
    rbacRepository.listActiveSystemRoleCodesByUserId.mockResolvedValue(["SUPER_ADMIN"]);
    rbacRepository.deleteRolePermissions.mockResolvedValue({ count: 1 });
    rbacRepository.countRolePermissionsByModuleKey.mockResolvedValue(0);

    await expect(
      service.revokeRolePermissionModulePermissions("actor-1", "r1", "users", {
        permissionIds: ["p1"],
      }),
    ).resolves.toEqual({
      moduleKey: "users",
      moduleName: "Người dùng",
      totalPermissions: 1,
      enabledCount: 0,
      disabledCount: 1,
      allSelected: false,
      allDisabled: true,
    });

    expect(rbacRepository.deleteRolePermissions).toHaveBeenCalledWith("r1", ["p1"]);
  });

  it("blocks module permission changes for super admin role", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r1", code: "SUPER_ADMIN" });

    await expect(
      service.revokeRolePermissionModulePermissions("actor-1", "r1", "users", {
        permissionIds: ["p1"],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("replaces permissions with repository transaction method", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r2", code: "HOTEL_MANAGER" });
    rbacRepository.findPermissionsByIds.mockResolvedValue([{ id: "p1" }]);
    rbacRepository.replaceRolePermissions.mockResolvedValue(undefined);
    rbacRepository.listRolePermissions.mockResolvedValue([
      {
        permission: {
          id: "p1",
          method: HttpMethod.GET,
          path: "/users",
          moduleKey: "users",
          description: "List users",
        },
      },
    ]);

    await service.replacePermissions("r2", { permissionIds: ["p1"] });

    expect(rbacRepository.replaceRolePermissions).toHaveBeenCalledWith("r2", ["p1"]);
  });

  it("builds permission filters by method/path/search", async () => {
    rbacRepository.listPermissions.mockResolvedValue([]);

    await service.listPermissions({
      method: HttpMethod.GET,
      path: "/users",
      q: "detail",
    });

    expect(rbacRepository.listPermissions).toHaveBeenCalledWith(
      expect.objectContaining({
        AND: expect.any(Array),
      }),
    );
  });

  it("returns compact module lookup for permissions endpoint", async () => {
    rbacRepository.listPermissions.mockResolvedValue([
      {
        id: "p1",
        method: HttpMethod.GET,
        moduleKey: "roles",
        path: "/roles",
        description: "List roles",
      },
      {
        id: "p2",
        method: HttpMethod.POST,
        moduleKey: "roles",
        path: "/roles",
        description: "Create role",
      },
      {
        id: "p3",
        method: HttpMethod.GET,
        moduleKey: "users",
        path: "/hotel-users",
        description: "List hotel users",
      },
      {
        id: "p4",
        method: HttpMethod.GET,
        moduleKey: "permissions",
        path: "/v1/permissions",
        description: "List permissions",
      },
      {
        id: "p5",
        method: HttpMethod.POST,
        moduleKey: "auth",
        path: "/auth/login",
        description: "Auth login",
      },
    ]);

    const result = await service.listPermissions({});

    expect(result).toEqual([
      { id: "users", module: "users", name: "Người dùng" },
      { id: "roles", module: "roles", name: "Vai trò" },
      { id: "permissions", module: "permissions", name: "Quyền" },
    ]);
  });
});
