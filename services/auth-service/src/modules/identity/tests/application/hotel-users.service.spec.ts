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
});
