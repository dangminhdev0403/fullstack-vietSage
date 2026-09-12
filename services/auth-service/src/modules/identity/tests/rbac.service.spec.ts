import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { HttpMethod, RoleStatus, RoleType } from "@prisma/client";
import { RbacRepository } from "../infrastructure/repositories/rbac.repository";
import { RbacService } from "../application/rbac.service";

describe("RbacService", () => {
  let service: RbacService;
  let rbacRepository: {
    listRolesWithRelations: jest.Mock;
    findRoleWithRelationsById: jest.Mock;
    findRoleWithRelationsByName: jest.Mock;
    findRoleById: jest.Mock;
    findRoleByCode: jest.Mock;
    createRoleWithPermissions: jest.Mock;
    updateRoleWithPermissions: jest.Mock;
    deleteRole: jest.Mock;
    countUserRolesByRoleId: jest.Mock;
    replaceRolePermissions: jest.Mock;
    listPermissions: jest.Mock;
    listPermissionTotalsByModule: jest.Mock;
    listRolePermissionModuleKeys: jest.Mock;
    countPermissionsByModuleKey: jest.Mock;
    countRolePermissionsByModuleKey: jest.Mock;
    listPermissionsByModuleKey: jest.Mock;
    listRolePermissionIdsByRoleAndPermissionIds: jest.Mock;
    findPermissionById: jest.Mock;
    findPermissionsByIds: jest.Mock;
    listRolePermissions: jest.Mock;
    listBusinessPermissionsForRole: jest.Mock;
  };

  beforeEach(() => {
    rbacRepository = {
      listRolesWithRelations: jest.fn(),
      findRoleWithRelationsById: jest.fn(),
      findRoleWithRelationsByName: jest.fn(),
      findRoleById: jest.fn(),
      findRoleByCode: jest.fn(),
      createRoleWithPermissions: jest.fn(),
      updateRoleWithPermissions: jest.fn(),
      deleteRole: jest.fn(),
      countUserRolesByRoleId: jest.fn(),
      replaceRolePermissions: jest.fn(),
      listPermissions: jest.fn(),
      listPermissionTotalsByModule: jest.fn(),
      listRolePermissionModuleKeys: jest.fn(),
      countPermissionsByModuleKey: jest.fn(),
      countRolePermissionsByModuleKey: jest.fn(),
      listPermissionsByModuleKey: jest.fn(),
      listRolePermissionIdsByRoleAndPermissionIds: jest.fn(),
      findPermissionById: jest.fn(),
      findPermissionsByIds: jest.fn(),
      listRolePermissions: jest.fn(),
      listBusinessPermissionsForRole: jest.fn(),
    };

    service = new RbacService(rbacRepository as unknown as RbacRepository);
  });

  it("returns frontend navigation roles with mapped menus", async () => {
    rbacRepository.listRolesWithRelations.mockResolvedValue([
      {
        id: "r1",
        code: "HOTEL_MANAGER",
        name: "Hotel Manager",
        description: null,
        status: RoleStatus.ACTIVE,
        type: "SYSTEM_TEMPLATE",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        _count: { rolePermissions: 6 },
        rolePermissions: [
          { permission: { path: "/roles" } },
          { permission: { path: "/roles/:id/permissions" } },
          { permission: { path: "/hotel-users/:id" } },
          { permission: { path: "/v1/bookings/:id" } },
          { permission: { path: "/permissions" } },
          { permission: { path: "/auth/login" } },
          { permission: { path: "platform.roles.view" } },
        ],
      },
      {
        id: "r2",
        code: "HOTEL_STAFF",
        name: "Hotel Staff",
        description: null,
        status: RoleStatus.ACTIVE,
        type: "CUSTOM",
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
        baseRoleId: null,
        menus: ["/dashboard", "/users", "/roles", "/bookings", "/admin/roles", "/permissions"],
        enabledCount: 1,
        type: "SYSTEM_TEMPLATE",
      },
      {
        id: "r2",
        code: "HOTEL_STAFF",
        description: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        name: "Hotel Staff",
        status: RoleStatus.ACTIVE,
        baseRoleId: null,
        menus: ["/dashboard"],
        enabledCount: 0,
        type: "CUSTOM",
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
        baseRoleId: null,
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

  it("lists only business capabilities with role selection state", async () => {
    rbacRepository.findRoleById.mockResolvedValue({ id: "r2", code: "CUSTOM_MANAGER" });
    rbacRepository.listBusinessPermissionsForRole.mockResolvedValue([
      {
        id: "p1",
        path: "hotel.rooms.view",
        moduleKey: "hotel-rooms",
        description: "Xem phòng",
        rolePermissions: [{ roleId: "r2" }],
      },
    ]);

    await expect(service.listRoleCapabilities("r2")).resolves.toEqual([
      {
        id: "p1",
        key: "hotel.rooms.view",
        domain: "hotel-rooms",
        label: "Xem danh sách phòng",
        description: "Xem danh sách phòng",
        risk: "LOW",
        enabled: true,
      },
    ]);
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

  describe("Custom role CRUD and base-role subset constraints", () => {
    it("creates custom role constrained by allowed base role permission ceiling", async () => {
      const baseRole = {
        id: "base_frontdesk_id",
        code: "HOTEL_FRONTDESK",
        name: "Lễ tân",
        type: RoleType.SYSTEM_TEMPLATE,
        status: RoleStatus.ACTIVE,
        rolePermissions: [
          { permissionId: "p_view" },
          { permissionId: "p_edit" },
        ],
      };

      rbacRepository.findRoleByCode.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsByName.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsById.mockResolvedValue(baseRole);
      rbacRepository.findPermissionsByIds.mockResolvedValue([{ id: "p_view" }]);
      rbacRepository.createRoleWithPermissions.mockResolvedValue({
        id: "custom_role_1",
        code: "FRONTDESK_NIGHT",
        name: "Lễ tân ca đêm",
        description: "Ca đêm chỉ xem",
        type: RoleType.CUSTOM,
        status: RoleStatus.ACTIVE,
        baseRoleId: "base_frontdesk_id",
      });

      const result = await service.createRole({
        code: "FRONTDESK_NIGHT",
        name: "Lễ tân ca đêm",
        description: "Ca đêm chỉ xem",
        baseRoleId: "base_frontdesk_id",
        permissionIds: ["p_view"],
      });

      expect(result).toEqual(
        expect.objectContaining({
          id: "custom_role_1",
          code: "FRONTDESK_NIGHT",
          type: RoleType.CUSTOM,
          baseRoleId: "base_frontdesk_id",
        }),
      );
      expect(rbacRepository.createRoleWithPermissions).toHaveBeenCalledWith({
        code: "FRONTDESK_NIGHT",
        name: "Lễ tân ca đêm",
        description: "Ca đêm chỉ xem",
        baseRoleId: "base_frontdesk_id",
        permissionIds: ["p_view"],
      });
    });

    it("rejects creating custom role with permission outside base role ceiling", async () => {
      const baseRole = {
        id: "base_frontdesk_id",
        code: "HOTEL_FRONTDESK",
        type: RoleType.SYSTEM_TEMPLATE,
        status: RoleStatus.ACTIVE,
        rolePermissions: [{ permissionId: "p_view" }],
      };

      rbacRepository.findRoleByCode.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsByName.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsById.mockResolvedValue(baseRole);
      rbacRepository.findPermissionsByIds.mockResolvedValue([
        { id: "p_view" },
        { id: "p_admin_delete" },
      ]);

      await expect(
        service.createRole({
          code: "FRONTDESK_NIGHT",
          name: "Lễ tân ca đêm",
          baseRoleId: "base_frontdesk_id",
          permissionIds: ["p_view", "p_admin_delete"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects creating custom role with non-existent permission id", async () => {
      const baseRole = {
        id: "base_frontdesk_id",
        code: "HOTEL_FRONTDESK",
        type: RoleType.SYSTEM_TEMPLATE,
        status: RoleStatus.ACTIVE,
        rolePermissions: [{ permissionId: "p_view" }],
      };

      rbacRepository.findRoleByCode.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsByName.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsById.mockResolvedValue(baseRole);
      rbacRepository.findPermissionsByIds.mockResolvedValue([]);

      await expect(
        service.createRole({
          code: "FRONTDESK_NIGHT",
          name: "Lễ tân ca đêm",
          baseRoleId: "base_frontdesk_id",
          permissionIds: ["p_non_existent"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects creating custom role with duplicate permission ids", async () => {
      const baseRole = {
        id: "base_frontdesk_id",
        code: "HOTEL_FRONTDESK",
        type: RoleType.SYSTEM_TEMPLATE,
        status: RoleStatus.ACTIVE,
        rolePermissions: [{ permissionId: "p_view" }],
      };

      rbacRepository.findRoleByCode.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsByName.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsById.mockResolvedValue(baseRole);

      await expect(
        service.createRole({
          code: "FRONTDESK_NIGHT",
          name: "Lễ tân ca đêm",
          baseRoleId: "base_frontdesk_id",
          permissionIds: ["p_view", "p_view"],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects creating custom role with SUPER_ADMIN base role", async () => {
      const superAdminRole = {
        id: "super_admin_id",
        code: "SUPER_ADMIN",
        type: RoleType.SYSTEM_TEMPLATE,
        status: RoleStatus.ACTIVE,
        rolePermissions: [],
      };

      rbacRepository.findRoleByCode.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsByName.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsById.mockResolvedValue(superAdminRole);

      await expect(
        service.createRole({
          code: "CUSTOM_ADMIN",
          name: "Custom Admin",
          baseRoleId: "super_admin_id",
          permissionIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects creating custom role with non-system base role", async () => {
      const customRole = {
        id: "custom_role_base_id",
        code: "ANOTHER_CUSTOM",
        type: RoleType.CUSTOM,
        status: RoleStatus.ACTIVE,
        rolePermissions: [],
      };

      rbacRepository.findRoleByCode.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsByName.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsById.mockResolvedValue(customRole);

      await expect(
        service.createRole({
          code: "CUSTOM_SUBROLE",
          name: "Custom Subrole",
          baseRoleId: "custom_role_base_id",
          permissionIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects creating custom role when code or name already exists", async () => {
      rbacRepository.findRoleByCode.mockResolvedValue({ id: "existing_id" });

      await expect(
        service.createRole({
          code: "FRONTDESK_NIGHT",
          name: "Lễ tân ca đêm",
          baseRoleId: "base_frontdesk_id",
          permissionIds: [],
        }),
      ).rejects.toThrow(ConflictException);

      rbacRepository.findRoleByCode.mockResolvedValue(null);
      rbacRepository.findRoleWithRelationsByName.mockResolvedValue({ id: "existing_name_id" });

      await expect(
        service.createRole({
          code: "FRONTDESK_NIGHT",
          name: "Lễ tân ca đêm",
          baseRoleId: "base_frontdesk_id",
          permissionIds: [],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("rejects updating or mutating default system template role", async () => {
      rbacRepository.findRoleWithRelationsById.mockResolvedValue({
        id: "template_id",
        code: "HOTEL_FRONTDESK",
        type: RoleType.SYSTEM_TEMPLATE,
        rolePermissions: [],
      });

      await expect(
        service.updateRole("template_id", {
          name: "Renamed Frontdesk",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("updates custom role metadata and subsets permissions within base ceiling", async () => {
      const customRole = {
        id: "custom_role_1",
        code: "CUSTOM_ROLE",
        name: "Custom Role Old",
        type: RoleType.CUSTOM,
        baseRoleId: "base_frontdesk_id",
        rolePermissions: [{ permissionId: "p_view" }],
      };

      const baseRole = {
        id: "base_frontdesk_id",
        code: "HOTEL_FRONTDESK",
        type: RoleType.SYSTEM_TEMPLATE,
        status: RoleStatus.ACTIVE,
        rolePermissions: [
          { permissionId: "p_view" },
          { permissionId: "p_edit" },
        ],
      };

      rbacRepository.findRoleWithRelationsById
        .mockResolvedValueOnce(customRole)
        .mockResolvedValueOnce(baseRole);
      rbacRepository.findRoleWithRelationsByName.mockResolvedValue(null);
      rbacRepository.findPermissionsByIds.mockResolvedValue([
        { id: "p_view" },
        { id: "p_edit" },
      ]);
      rbacRepository.updateRoleWithPermissions.mockResolvedValue({
        ...customRole,
        name: "Custom Role New",
      });

      const result = await service.updateRole("custom_role_1", {
        name: "Custom Role New",
        permissionIds: ["p_view", "p_edit"],
      });

      expect(result.name).toBe("Custom Role New");
      expect(rbacRepository.updateRoleWithPermissions).toHaveBeenCalledWith(
        "custom_role_1",
        {
          name: "Custom Role New",
          description: undefined,
          baseRoleId: undefined,
        },
        ["p_view", "p_edit"],
      );
    });

    it("blocks deleting custom role when assigned users exist", async () => {
      rbacRepository.findRoleById.mockResolvedValue({
        id: "custom_role_1",
        code: "CUSTOM_ROLE",
        type: RoleType.CUSTOM,
      });
      rbacRepository.countUserRolesByRoleId.mockResolvedValue(3);

      await expect(service.deleteRole("custom_role_1")).rejects.toThrow(ConflictException);
      expect(rbacRepository.deleteRole).not.toHaveBeenCalled();
    });

    it("deletes custom role when no users are assigned", async () => {
      rbacRepository.findRoleById.mockResolvedValue({
        id: "custom_role_1",
        code: "CUSTOM_ROLE",
        type: RoleType.CUSTOM,
      });
      rbacRepository.countUserRolesByRoleId.mockResolvedValue(0);
      rbacRepository.deleteRole.mockResolvedValue(undefined);

      const result = await service.deleteRole("custom_role_1");

      expect(result).toEqual({ deleted: true });
      expect(rbacRepository.deleteRole).toHaveBeenCalledWith("custom_role_1");
    });

    it("blocks deleting default system template role", async () => {
      rbacRepository.findRoleById.mockResolvedValue({
        id: "default_role_1",
        code: "TENANT_OWNER",
        type: RoleType.SYSTEM_TEMPLATE,
      });

      await expect(service.deleteRole("default_role_1")).rejects.toThrow(ForbiddenException);
      expect(rbacRepository.deleteRole).not.toHaveBeenCalled();
    });
  });
});
