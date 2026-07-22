import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { HotelAccessService } from "../application/hotel-access.service";

function createRepository(overrides: Record<string, jest.Mock> = {}) {
  return {
    findActorById: jest.fn().mockResolvedValue({
      id: "actor-1",
      userRoles: [{ role: { code: "TENANT_OWNER" } }],
      tenantUsers: [{ tenantId: "tenant-1" }, { tenantId: "tenant-2" }],
    }),
    findHotelById: jest.fn(),
    findHotelByIdAndTenantIds: jest.fn().mockResolvedValue({
      id: "hotel-1",
      tenantId: "tenant-2",
    }),
    findTenantById: jest.fn().mockResolvedValue({ id: "tenant-1" }),
    ...overrides,
  };
}

describe("HotelAccessService", () => {
  it("phân giải tất cả thành viên tenant đang hoạt động của TENANT_OWNER", async () => {
    const repository = createRepository();
    const service = new HotelAccessService(repository as never);

    const actor = await service.loadActorContext("actor-1", "tenant-owner-role");

    expect(actor.isTenantOwner).toBe(true);
    expect(Array.from(actor.tenantIds)).toEqual(["tenant-1", "tenant-2"]);
  });

  it("trả về 403 khi TENANT_OWNER không có thành viên tenant đang hoạt động", async () => {
    const repository = createRepository({
      findActorById: jest.fn().mockResolvedValue({
        id: "actor-1",
        userRoles: [{ role: { code: "TENANT_OWNER" } }],
        tenantUsers: [],
      }),
    });
    const service = new HotelAccessService(repository as never);

    await expect(service.loadActorContext("actor-1", "tenant-owner-role")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("kiểm tra quyền truy cập khách sạn của TENANT_OWNER bằng hotelId và tenantId trong các thành viên đang hoạt động", async () => {
    const repository = createRepository();
    const service = new HotelAccessService(repository as never);

    await expect(
      service.assertHotelAccess("actor-1", "tenant-owner-role", "hotel-1"),
    ).resolves.toMatchObject({
      id: "hotel-1",
      tenantId: "tenant-2",
    });

    expect(repository.findHotelByIdAndTenantIds).toHaveBeenCalledWith("hotel-1", [
      "tenant-1",
      "tenant-2",
    ]);
    expect(repository.findHotelById).not.toHaveBeenCalled();
  });

  it("trả về 404 khi TENANT_OWNER truy cập khách sạn ngoài các thành viên đang hoạt động", async () => {
    const repository = createRepository({
      findHotelByIdAndTenantIds: jest.fn().mockResolvedValue(null),
    });
    const service = new HotelAccessService(repository as never);

    await expect(
      service.assertHotelAccess("actor-1", "tenant-owner-role", "hotel-3"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("chỉ cho HOTEL_FRONTDESK truy cập khách sạn được gán đang hoạt động", async () => {
    const repository = createRepository({
      findActorById: jest.fn().mockResolvedValue({
        id: "frontdesk-1",
        userRoles: [{ role: { code: "HOTEL_FRONTDESK" } }],
        tenantUsers: [{ tenantId: "tenant-1" }],
        hotelAssignments: [{ hotelId: "hotel-1" }],
      }),
      findHotelById: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
    });
    const service = new HotelAccessService(repository as never);

    await expect(
      service.assertHotelAccess("frontdesk-1", "frontdesk-role", "hotel-1"),
    ).resolves.toMatchObject({ id: "hotel-1" });
  });

  it("từ chối HOTEL_FRONTDESK truy cập khách sạn cùng tenant nhưng chưa được gán", async () => {
    const repository = createRepository({
      findActorById: jest.fn().mockResolvedValue({
        id: "frontdesk-1",
        userRoles: [{ role: { code: "HOTEL_FRONTDESK" } }],
        tenantUsers: [{ tenantId: "tenant-1" }],
        hotelAssignments: [{ hotelId: "hotel-1" }],
      }),
      findHotelById: jest.fn().mockResolvedValue({ id: "hotel-2", tenantId: "tenant-1" }),
    });
    const service = new HotelAccessService(repository as never);

    await expect(
      service.assertHotelAccess("frontdesk-1", "frontdesk-role", "hotel-2"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("không yêu cầu assignment khi SUPER_ADMIN đồng thời có role HOTEL_FRONTDESK", async () => {
    const repository = createRepository({
      findActorById: jest.fn().mockResolvedValue({
        id: "admin-1",
        userRoles: [{ role: { code: "SUPER_ADMIN" } }, { role: { code: "HOTEL_FRONTDESK" } }],
        tenantUsers: [],
        hotelAssignments: [],
      }),
      findHotelById: jest.fn().mockResolvedValue({ id: "hotel-any", tenantId: "tenant-any" }),
    });
    const service = new HotelAccessService(repository as never);

    await expect(
      service.assertHotelAccess("admin-1", "super-admin-role", "hotel-any"),
    ).resolves.toMatchObject({ id: "hotel-any" });
  });

  it("không yêu cầu assignment khi HOTEL_OWNER đồng thời có role HOTEL_FRONTDESK", async () => {
    const repository = createRepository({
      findActorById: jest.fn().mockResolvedValue({
        id: "owner-1",
        userRoles: [{ role: { code: "HOTEL_OWNER" } }, { role: { code: "HOTEL_FRONTDESK" } }],
        tenantUsers: [{ tenantId: "tenant-1" }],
        hotelAssignments: [],
      }),
      findHotelById: jest.fn().mockResolvedValue({ id: "hotel-1", tenantId: "tenant-1" }),
    });
    const service = new HotelAccessService(repository as never);

    await expect(
      service.assertHotelAccess("owner-1", "hotel-owner-role", "hotel-1"),
    ).resolves.toMatchObject({ id: "hotel-1" });
  });

  it("chỉ chấp nhận tenant hint thuộc phạm vi của TENANT_OWNER", async () => {
    const service = new HotelAccessService(createRepository() as never);
    const actor = {
      userId: "actor-1",
      roleCodes: new Set(["TENANT_OWNER"]),
      tenantIds: new Set(["tenant-1"]),
      isSuperAdmin: false,
      isTenantOwner: true,
    };

    await expect(service.resolveTenantId(actor, "tenant-1")).resolves.toBe("tenant-1");
    await expect(service.resolveTenantId(actor, "tenant-2")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
