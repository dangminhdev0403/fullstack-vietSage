import { HotelUsersService } from "../../application/hotel-users.service";

describe("HotelUsersService listHotelUsers", () => {
  it("filters by active hotel assignment before pagination", async () => {
    const repository = {
      findActorById: jest.fn().mockResolvedValue({
        id: "owner-1",
        userRoles: [{ role: { code: "TENANT_OWNER" } }],
        tenantUsers: [{ tenantId: "tenant-1" }],
      }),
      listTenantUsers: jest.fn().mockResolvedValue([0, []]),
    };
    const service = new HotelUsersService(repository as never, {} as never);

    await service.listHotelUsers("owner-1", "role-owner", undefined, {
      page: 2,
      limit: 20,
      hotelId: "hotel-1",
    });

    expect(repository.listTenantUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        user: expect.objectContaining({
          hotelAssignments: {
            some: {
              hotelId: "hotel-1",
              status: "ACTIVE",
              hotel: { tenantId: "tenant-1" },
            },
          },
        }),
      }),
      20,
      20,
    );
  });

  it("includes HOTEL_FRONTDESK and HOTEL_HOUSEKEEPING in listManagedRoles", async () => {
    const repository = {
      findActorById: jest.fn().mockResolvedValue({
        id: "owner-1",
        userRoles: [{ role: { code: "TENANT_OWNER" } }],
        tenantUsers: [{ tenantId: "tenant-1" }],
      }),
      listManagedRoles: jest.fn().mockResolvedValue([
        { id: "role-1", code: "HOTEL_FRONTDESK", name: "Lễ tân" },
        { id: "role-2", code: "HOTEL_HOUSEKEEPING", name: "Buồng phòng" },
      ]),
    };
    const service = new HotelUsersService(repository as never, {} as never);

    const roles = await service.listManagedRoles("owner-1", "role-owner", "tenant-1");

    expect(repository.listManagedRoles).toHaveBeenCalledWith(
      expect.arrayContaining(["HOTEL_FRONTDESK", "HOTEL_HOUSEKEEPING"]),
    );
    expect(roles).toHaveLength(2);
  });
});
