import { HotelStaffAssignmentStatus, HotelStatus } from "@prisma/client";
import { HotelCoreRepository } from "../infrastructure/repositories/hotel-core.repository";

describe("HotelCoreRepository staff scope", () => {
  it("loads only active assignments for active hotels", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const repository = new HotelCoreRepository({
      user: { findUnique },
    } as never);

    await repository.findActorById("staff-1", "frontdesk-role");

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "staff-1" },
        select: expect.objectContaining({
          userRoles: expect.objectContaining({
            where: expect.objectContaining({ roleId: "frontdesk-role" }),
          }),
          hotelAssignments: {
            where: {
              status: HotelStaffAssignmentStatus.ACTIVE,
              hotel: { status: HotelStatus.ACTIVE },
            },
            select: { hotelId: true },
          },
        }),
      }),
    );
  });
});
