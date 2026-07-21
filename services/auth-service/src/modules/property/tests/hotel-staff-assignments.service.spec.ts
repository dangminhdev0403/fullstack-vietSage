import { NotFoundException } from "@nestjs/common";
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
});
