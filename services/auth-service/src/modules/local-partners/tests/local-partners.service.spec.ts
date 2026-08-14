import { NotFoundException } from "@nestjs/common";
import { GuestLocalPartnersService } from "../application/guest-local-partners.service";
import { LocalPartnersService } from "../application/local-partners.service";
import {
  LocalPartnersRepository,
  calculateHaversineDistanceMeters,
} from "../infrastructure/local-partners.repository";

describe("Local partners MVP", () => {
  const partner = { id: "partner-1", hotelId: "hotel-1", status: "ACTIVE", distanceMeters: 300 };
  const repository = {
    ensureDefaultCategories: jest.fn(),
    findCategories: jest.fn().mockResolvedValue([]),
    findPartnersByHotelId: jest.fn().mockResolvedValue([partner]),
    findPartnerInHotel: jest
      .fn()
      .mockImplementation((hotelId, partnerId) =>
        hotelId === partner.hotelId && partnerId === partner.id ? partner : null,
      ),
    createPartner: jest.fn().mockImplementation((data) => ({ id: "new", ...data })),
    updatePartner: jest
      .fn()
      .mockImplementation((hotelId, partnerId, data) => ({ hotelId, id: partnerId, ...data })),
  } as unknown as jest.Mocked<LocalPartnersRepository>;
  const staff = new LocalPartnersService(repository);
  const guest = new GuestLocalPartnersService(repository);

  beforeEach(() => jest.clearAllMocks());

  it("calculates geographic distance", () => {
    expect(calculateHaversineDistanceMeters(21.0245, 105.8575, 21.0285, 105.8525)).toBeGreaterThan(
      500,
    );
  });

  it("scopes staff updates by hotel", async () => {
    await staff.updatePartner("hotel-1", "partner-1", { name: "Tên mới" });
    expect(repository.findPartnerInHotel.mock.calls).toContainEqual(["hotel-1", "partner-1"]);
    expect(repository.updatePartner.mock.calls).toContainEqual([
      "hotel-1",
      "partner-1",
      { name: "Tên mới" },
    ]);
  });

  it("rejects cross-hotel guest detail", async () => {
    await expect(guest.getGuestPartnerDetail("hotel-2", "partner-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("does not treat missing distance as zero", async () => {
    repository.findPartnersByHotelId.mockResolvedValueOnce([
      partner,
      { ...partner, id: "unknown", distanceMeters: null },
    ] as never);
    await expect(guest.getGuestPartners("hotel-1", { maxDistanceMeters: 500 })).resolves.toEqual([
      partner,
    ]);
  });
});
