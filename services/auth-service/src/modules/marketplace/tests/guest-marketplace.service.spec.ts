import { GuestMarketplaceService } from "../application/guest-marketplace.service";

const row = (id: string, latitude: number | null, sortOrder = 0) => ({
  id,
  category: { isActive: true },
  serviceTenant: {
    serviceProfile: { latitude, longitude: latitude },
    hotelServiceLinks: [{ sortOrder }],
  },
});

describe("Guest marketplace discovery", () => {
  it("sorts mapped services by priority then distance and keeps unknown distance null", async () => {
    const prisma = {
      hotel: { findUniqueOrThrow: jest.fn().mockResolvedValue({ latitude: 0, longitude: 0 }) },
      marketplaceService: { findMany: jest.fn().mockResolvedValue([row("unknown", null), row("far", 1), row("near", 0.1)]) },
    };
    const service = new GuestMarketplaceService(prisma as never);
    const result = await service.services("hotel-a", { page: 1, limit: 20 });

    expect(result.items.map((item) => item.id)).toEqual(["near", "far", "unknown"]);
    expect(result.items[2].distanceMeters).toBeNull();
    expect(prisma.marketplaceService.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ serviceTenant: expect.objectContaining({ hotelServiceLinks: { some: { hotelId: "hotel-a", status: "ACTIVE" } } }) }),
    }));
  });
});
