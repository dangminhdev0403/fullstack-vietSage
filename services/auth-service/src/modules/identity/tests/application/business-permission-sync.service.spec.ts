import { BUSINESS_PERMISSIONS } from "../../../../common/config/business-permissions.registry";
import { REQUIRED_PERMISSION_KEY } from "../../../../shared/decorators/require-permission.decorator";
import { HotelNotificationRoutesController } from "../../../notifications/api/hotel-notification-routes.controller";
import { TenantOwnersController } from "../../../organization/api/tenant-owners.controller";
import { HotelServicesController } from "../../../property/api/hotel-services.controller";
import { HotelsController } from "../../../property/api/hotels.controller";
import { RolesController } from "../../api/rbac.controller";
import { BusinessPermissionSyncService } from "../../application/business-permission-sync.service";
import { AuthRepository } from "../../infrastructure/repositories/auth.repository";

describe("BusinessPermissionSyncService", () => {
  let authRepository: {
    upsertBusinessPermission: jest.Mock;
    upsertRoleByCode: jest.Mock;
    listBusinessPermissionIds: jest.Mock;
    createRolePermissions: jest.Mock;
    findUserByEmail: jest.Mock;
    upsertUserByEmail: jest.Mock;
    upsertActiveUserRole: jest.Mock;
  };
  let logger: { info: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    authRepository = {
      upsertBusinessPermission: jest.fn(),
      upsertRoleByCode: jest.fn().mockResolvedValue({ id: "role-super-admin" }),
      listBusinessPermissionIds: jest.fn().mockResolvedValue(["cap-1", "cap-2"]),
      createRolePermissions: jest.fn().mockResolvedValue({ count: 2 }),
      findUserByEmail: jest.fn().mockResolvedValue(null),
      upsertUserByEmail: jest.fn().mockResolvedValue({ id: "user-admin" }),
      upsertActiveUserRole: jest.fn().mockResolvedValue({}),
    };
    logger = { info: jest.fn(), error: jest.fn() };
    delete process.env.AUTH_ADMIN_EMAIL;
    delete process.env.AUTH_ADMIN_NAME;
    delete process.env.AUTH_ADMIN_PASSWORD;
  });

  it.each([
    [HotelsController.prototype, "listHotels", "platform.hotels.view"],
    [HotelsController.prototype, "createHotel", "platform.hotels.manage"],
    [HotelsController.prototype, "getHotel", "platform.hotels.view"],
    [HotelsController.prototype, "updateHotel", "platform.hotels.manage"],
    [TenantOwnersController.prototype, "listTenantOwners", "platform.users.view"],
    [TenantOwnersController.prototype, "listTenantOptions", "platform.users.view"],
    [TenantOwnersController.prototype, "getTenantOwner", "platform.users.view"],
    [TenantOwnersController.prototype, "createTenantOwner", "platform.users.manage"],
    [TenantOwnersController.prototype, "updateTenantOwner", "platform.users.manage"],
    [TenantOwnersController.prototype, "resetPassword", "platform.users.manage"],
    [RolesController.prototype, "getRole", "platform.roles.view"],
    [HotelServicesController.prototype, "serviceCatalogImportTemplate", "hotel.services.view"],
    [HotelServicesController.prototype, "listServiceCategories", "hotel.services.view"],
    [HotelServicesController.prototype, "createServiceCategory", "hotel.services.manage"],
    [HotelServicesController.prototype, "updateServiceCategory", "hotel.services.manage"],
    [HotelServicesController.prototype, "listServiceItems", "hotel.services.view"],
    [HotelServicesController.prototype, "createServiceItem", "hotel.services.manage"],
    [HotelServicesController.prototype, "updateServiceItem", "hotel.services.manage"],
    [HotelNotificationRoutesController.prototype, "list", "hotel.notifications.view"],
    [HotelNotificationRoutesController.prototype, "create", "hotel.notifications.manage"],
    [HotelNotificationRoutesController.prototype, "update", "hotel.notifications.manage"],
  ])("maps %s.%s to business permission %s", (prototype, handlerName, permissionKey) => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype[handlerName])).toBe(
      permissionKey,
    );
  });

  it("syncs only catalog capabilities and grants them to super admin", async () => {
    const service = new BusinessPermissionSyncService(
      authRepository as unknown as AuthRepository,
      logger as never,
    );

    await service.onApplicationBootstrap();

    expect(authRepository.upsertBusinessPermission).toHaveBeenCalledTimes(
      BUSINESS_PERMISSIONS.length,
    );
    expect(authRepository.listBusinessPermissionIds).toHaveBeenCalledWith(
      BUSINESS_PERMISSIONS.map(({ key }) => key),
    );
    expect(authRepository.createRolePermissions).toHaveBeenCalledWith("role-super-admin", [
      "cap-1",
      "cap-2",
    ]);
  });

  it("creates the configured bootstrap admin", async () => {
    process.env.AUTH_ADMIN_EMAIL = "admin@vietsage.local";
    process.env.AUTH_ADMIN_NAME = "VietSage Admin";
    process.env.AUTH_ADMIN_PASSWORD = "ChangeMe123!";
    const service = new BusinessPermissionSyncService(
      authRepository as unknown as AuthRepository,
      logger as never,
    );

    await service.onApplicationBootstrap();

    expect(authRepository.upsertUserByEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "admin@vietsage.local" }),
    );
    expect(authRepository.upsertActiveUserRole).toHaveBeenCalledWith(
      "user-admin",
      "role-super-admin",
    );
  });
});
