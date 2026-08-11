import { GuestMarketplaceService } from "../application/guest-marketplace.service";

const mockPrisma = {
  marketplaceCategory: { findMany: jest.fn() },
  marketplaceService: { findMany: jest.fn() },
  hotel: { findUniqueOrThrow: jest.fn() },
};

describe("GuestMarketplaceService – locale", () => {
  let service: GuestMarketplaceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GuestMarketplaceService(mockPrisma as any);
  });

  const baseCategory = {
    id: "cat-1",
    code: "CAT001",
    importKey: "food",
    nameVi: "Ăn uống",
    sortOrder: 0,
    isActive: true,
    translations: [
      { locale: "en", name: "Food & Beverage" },
      { locale: "zh", name: "餐饮" },
      { locale: "ko", name: "음식" },
      { locale: "ru", name: "Еда" },
      { locale: "hi", name: "खाना" },
    ],
  };

  it("returns Vietnamese name for vi-VN locale (base field)", async () => {
    mockPrisma.marketplaceCategory.findMany.mockResolvedValue([baseCategory]);
    const result = await service.categories("hotel-1", "vi-VN");
    // vi-VN maps to short "vi" but no translation row for vi; fallback to nameVi
    expect(result[0].name).toBe("Ăn uống");
    expect(result[0].nameVi).toBe("Ăn uống");
  });

  it("returns English name for en locale", async () => {
    mockPrisma.marketplaceCategory.findMany.mockResolvedValue([baseCategory]);
    const result = await service.categories("hotel-1", "en");
    expect(result[0].name).toBe("Food & Beverage");
  });

  it("returns Chinese name for zh locale", async () => {
    mockPrisma.marketplaceCategory.findMany.mockResolvedValue([baseCategory]);
    const result = await service.categories("hotel-1", "zh");
    expect(result[0].name).toBe("餐饮");
  });

  it("returns Korean name for ko locale", async () => {
    mockPrisma.marketplaceCategory.findMany.mockResolvedValue([baseCategory]);
    const result = await service.categories("hotel-1", "ko");
    expect(result[0].name).toBe("음식");
  });

  it("returns Russian name for ru locale", async () => {
    mockPrisma.marketplaceCategory.findMany.mockResolvedValue([baseCategory]);
    const result = await service.categories("hotel-1", "ru");
    expect(result[0].name).toBe("Еда");
  });

  it("returns Hindi name for hi locale", async () => {
    mockPrisma.marketplaceCategory.findMany.mockResolvedValue([baseCategory]);
    const result = await service.categories("hotel-1", "hi");
    expect(result[0].name).toBe("खाना");
  });

  it("falls back to nameVi when requested translation is missing", async () => {
    const noEnCategory = {
      ...baseCategory,
      translations: [{ locale: "zh", name: "餐饮" }],
    };
    mockPrisma.marketplaceCategory.findMany.mockResolvedValue([noEnCategory]);
    const result = await service.categories("hotel-1", "en");
    expect(result[0].name).toBe("Ăn uống");
  });

  it("falls back to importKey when nameVi is empty and no translation", async () => {
    const emptyNameCategory = {
      ...baseCategory,
      nameVi: "",
      translations: [],
    };
    mockPrisma.marketplaceCategory.findMany.mockResolvedValue([emptyNameCategory]);
    const result = await service.categories("hotel-1", "en");
    expect(result[0].name).toBe("food");
  });

  it("falls back to code when nameVi is empty, importKey is null, and no translation", async () => {
    const minimalCategory = {
      ...baseCategory,
      nameVi: "",
      importKey: null,
      translations: [],
    };
    mockPrisma.marketplaceCategory.findMany.mockResolvedValue([minimalCategory]);
    const result = await service.categories("hotel-1", "en");
    expect(result[0].name).toBe("CAT001");
  });

  it("includes localized category in services response", async () => {
    mockPrisma.hotel.findUniqueOrThrow.mockResolvedValue({
      latitude: 10.762,
      longitude: 106.66,
    });
    mockPrisma.marketplaceService.findMany.mockResolvedValue([
      {
        id: "svc-1",
        category: baseCategory,
        serviceTenant: {
          id: "tenant-1",
          serviceProfile: { latitude: 10.763, longitude: 106.661 },
          hotelServiceLinks: [{ sortOrder: 0 }],
        },
      },
    ]);
    const result = await service.services(
      "hotel-1",
      { page: 1, limit: 20 },
      "en",
    );
    expect(result.items[0].category.name).toBe("Food & Beverage");
  });
});
