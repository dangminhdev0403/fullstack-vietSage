import { Test } from "@nestjs/testing";
import { LocalPartnersService } from "../application/local-partners.service";
import { GuestLocalPartnersService } from "../application/guest-local-partners.service";
import { LocalPartnersRepository, calculateHaversineDistanceMeters } from "../infrastructure/local-partners.repository";

describe("LocalPartnersModule Services", () => {
  let localPartnersService: LocalPartnersService;
  let guestLocalPartnersService: GuestLocalPartnersService;
  let repository: jest.Mocked<LocalPartnersRepository>;

  beforeEach(async () => {
    const mockRepo = {
      ensureDefaultCategories: jest.fn().mockResolvedValue(undefined),
      findCategories: jest.fn().mockResolvedValue([
        { id: "cat-1", code: "RESTAURANT", nameVi: "Nhà hàng", nameEn: "Restaurant", icon: "restaurant", sortOrder: 1, isActive: true },
      ]),
      findPartnersByHotelId: jest.fn().mockResolvedValue([
        {
          id: "partner-1",
          hotelId: "hotel-1",
          name: "Phở Gìn",
          address: "123 Phố Huế",
          distanceMeters: 300,
          status: "ACTIVE",
          offers: [
            { id: "offer-1", title: "Giảm 10%", status: "ACTIVE" },
          ],
        },
      ]),
      findPartnerById: jest.fn().mockImplementation(async (id: string) => {
        if (id === "partner-1") {
          return {
            id: "partner-1",
            hotelId: "hotel-1",
            name: "Phở Gìn",
            address: "123 Phố Huế",
            status: "ACTIVE",
            offers: [{ id: "offer-1", title: "Giảm 10%", status: "ACTIVE" }],
          };
        }
        return null;
      }),
      createPartner: jest.fn().mockImplementation(async (data) => ({ id: "partner-new", ...data })),
      updatePartner: jest.fn().mockImplementation(async (id, data) => ({ id, ...data })),
      deletePartner: jest.fn().mockResolvedValue({ id: "partner-1" }),
      createOffer: jest.fn().mockImplementation(async (id, data) => ({ id: "offer-new", partnerId: id, ...data })),
      updateOffer: jest.fn().mockImplementation(async (id, data) => ({ id, ...data })),
      createBookingRequest: jest.fn().mockImplementation(async (data) => ({ id: "req-1", ...data })),
      findBookingRequestsByHotelId: jest.fn().mockResolvedValue([]),
      updateBookingRequestStatus: jest.fn().mockResolvedValue({ id: "req-1", status: "CONFIRMED" }),
      createInteractionLog: jest.fn().mockResolvedValue({ id: "log-1" }),
      getAnalyticsByHotelId: jest.fn().mockResolvedValue({
        totalPartners: 1,
        totalOffers: 1,
        totalBookings: 0,
        interactions: { VIEW_DETAIL: 5 },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LocalPartnersService,
        GuestLocalPartnersService,
        { provide: LocalPartnersRepository, useValue: mockRepo },
      ],
    }).compile();

    localPartnersService = moduleRef.get(LocalPartnersService);
    guestLocalPartnersService = moduleRef.get(GuestLocalPartnersService);
    repository = moduleRef.get(LocalPartnersRepository) as any;
  });

  describe("Haversine Distance Calculator", () => {
    it("should correctly calculate distance between two coordinates in Hanoi", () => {
      // Hanoi Opera House -> Hoan Kiem Lake (~1km)
      const dist = calculateHaversineDistanceMeters(21.0245, 105.8575, 21.0285, 105.8525);
      expect(dist).toBeGreaterThan(500);
      expect(dist).toBeLessThan(1500);
    });
  });

  describe("LocalPartnersService", () => {
    it("should list categories", async () => {
      const categories = await localPartnersService.getCategories();
      expect(categories).toHaveLength(1);
      expect(categories[0].code).toBe("RESTAURANT");
    });

    it("should create a partner", async () => {
      const partner = await localPartnersService.createPartner("hotel-1", {
        categoryId: "cat-1",
        name: "Quán bún chả",
        address: "45 Hàng Mành",
      });
      expect(partner.name).toBe("Quán bún chả");
      expect(repository.createPartner).toHaveBeenCalled();
    });

    it("should fetch partner analytics", async () => {
      const analytics = await localPartnersService.getAnalytics("hotel-1");
      expect(analytics.totalPartners).toBe(1);
      expect(analytics.interactions.VIEW_DETAIL).toBe(5);
    });
  });

  describe("GuestLocalPartnersService", () => {
    it("should filter guest partners by distance", async () => {
      const partners = await guestLocalPartnersService.getGuestPartners("hotel-1", {
        maxDistanceMeters: 500,
      });
      expect(partners).toHaveLength(1);
    });

    it("should claim valid offer", async () => {
      const res = await guestLocalPartnersService.claimOffer("hotel-1", "partner-1", "offer-1");
      expect(res.offer.id).toBe("offer-1");
      expect(repository.createInteractionLog).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: "CLAIM_OFFER" }),
      );
    });

    it("should submit booking request", async () => {
      const req = await guestLocalPartnersService.createBookingRequest("hotel-1", {
        partnerId: "partner-1",
        guestName: "Nguyễn Văn A",
        roomNumber: "101",
        guestPhone: "0912345678",
        serviceType: "Đặt bàn 4 người",
      });
      expect(req.guestName).toBe("Nguyễn Văn A");
      expect(repository.createBookingRequest).toHaveBeenCalled();
    });
  });
});
