import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { LocalMateStatus } from "@prisma/client";
import { LocalMateService } from "../application/localmate.service";
import { LocalMateAiController } from "../api/localmate-ai.controller";
import { LocalMateRepository } from "../infrastructure/repositories/localmate.repository";
import { inferProvinceAndScope } from "../domain/constants/geography.constant";
import {
  createLocalMateTourSchema,
  queryLocalMateKnowledgeSchema,
} from "../domain/schemas/localmate.schema";

describe("LocalMateService", () => {
  let service: LocalMateService;
  let repository: jest.Mocked<LocalMateRepository>;

  const mockQualifiedGuides = [
    {
      id: "guide-1",
      guideCode: "LM-YB-001",
      fullName: "Giàng A Pháo",
      phone: "0987654321",
      email: "phao@localmate.vietsage.vn",
      avatarUrl: "https://example.com/phao.jpg",
      status: LocalMateStatus.QUALIFIED,
      languages: ["English", "Vietnamese", "H'Mông"],
      operatingRegions: ["Mù Cang Chải", "Trạm Tấu", "Yên Bái"],
      specialties: ["Chụp ảnh flycam", "Trekking đỉnh núi"],
      bio: "Local guide Mù Cang Chải",
      dailyRateVnd: 1200000,
      rating: 4.95,
      totalReviews: 48,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "guide-2",
      guideCode: "LM-YB-002",
      fullName: "Lò Thị Mai",
      phone: "0912345678",
      email: "mai@localmate.vietsage.vn",
      avatarUrl: "https://example.com/mai.jpg",
      status: LocalMateStatus.QUALIFIED,
      languages: ["English", "Vietnamese", "Thái"],
      operatingRegions: ["Trạm Tấu", "Nghĩa Lộ"],
      specialties: ["Văn hóa người Thái", "Tắm khoáng nóng"],
      bio: "Local guide Trạm Tấu",
      dailyRateVnd: 1000000,
      rating: 4.9,
      totalReviews: 35,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "guide-3",
      guideCode: "LM-YB-003",
      fullName: "Vũ Tuấn Anh",
      phone: "0977889900",
      email: "tuananh@localmate.vietsage.vn",
      avatarUrl: "https://example.com/tuananh.jpg",
      status: LocalMateStatus.QUALIFIED,
      languages: ["French", "Vietnamese"],
      operatingRegions: ["Hồ Thác Bà", "Yên Bái"],
      specialties: ["Chèo SUP", "Khám phá động Thủy Tiên"],
      bio: "Local guide Hồ Thác Bà",
      dailyRateVnd: 1100000,
      rating: 4.85,
      totalReviews: 29,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockTours = [
    {
      id: "tour-1",
      tourCode: "HVNT-0007-24",
      title: "HÀ NỘI - MÙ CANG CHẢI (3N2Đ)",
      duration: "3N2Đ",
      highlights: ["Ruộng bậc thang", "Khoáng nóng"],
      content: "Chi tiết tour Mù Cang Chải...",
      sourceFileName: "HVNT 0007-24.docx",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<LocalMateRepository>> = {
      createGuide: jest.fn(),
      updateGuide: jest.fn(),
      findGuideById: jest.fn(),
      findGuideByCode: jest.fn(),
      listGuides: jest.fn(),
      findQualifiedGuides: jest.fn().mockResolvedValue(mockQualifiedGuides),
      findToursByDestination: jest.fn().mockResolvedValue(mockTours),
      searchTourKnowledge: jest.fn().mockResolvedValue(mockTours),
      findTourByCode: jest.fn(),
      listTourKnowledge: jest.fn(),
      upsertTourKnowledge: jest.fn(),
      generateNextGuideCode: jest.fn().mockResolvedValue("LM-004"),
      findUserByEmail: jest.fn().mockResolvedValue(null),
      findUserById: jest.fn().mockResolvedValue(null),
      findRoleByCode: jest.fn().mockResolvedValue({ id: "role-1", code: "LOCALMATE_GUIDE" }),
      findRootTenant: jest.fn().mockResolvedValue({ id: "tenant-root", code: "VIETSAGE_ROOT" }),
      createGuideUser: jest
        .fn()
        .mockResolvedValue({ id: "user-1", email: "phao@localmate.vietsage.vn" }),
      createTour: jest
        .fn()
        .mockImplementation((data) => Promise.resolve({ id: "tour-created", ...data })),
      updateTour: jest.fn(),
      deleteTour: jest.fn(),
      findTourById: jest.fn(),
      findHotelLocation: jest.fn(),
      updateUserStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalMateService,
        {
          provide: LocalMateRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<LocalMateService>(LocalMateService);
    repository = module.get(LocalMateRepository);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createGuide", () => {
    it("throws BadRequestException if guideCode already exists", async () => {
      repository.findGuideByCode.mockResolvedValueOnce(mockQualifiedGuides[0]);
      await expect(
        service.createGuide({
          guideCode: "LM-YB-001",
          fullName: "Test Guide",
          phone: "0999999999",
          avatarUrl: "https://example.com/avatar.jpg",
          languages: ["Vietnamese"],
          operatingRegions: ["Yên Bái"],
          specialties: [],
          dailyRateVnd: 1000000,
          status: "PENDING",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("successfully creates guide when valid", async () => {
      repository.findGuideByCode.mockResolvedValueOnce(null);
      repository.createGuide.mockResolvedValueOnce(mockQualifiedGuides[0]);

      const result = await service.createGuide({
        fullName: "Giàng A Pháo",
        phone: "0987654321",
        avatarUrl: "https://example.com/phao.jpg",
        languages: ["English"],
        operatingRegions: ["Mù Cang Chải"],
        specialties: ["Trekking"],
        dailyRateVnd: 1200000,
        status: "PENDING",
      });

      expect(result).toEqual({
        ...mockQualifiedGuides[0],
        temporaryPassword: expect.any(String),
      });
      expect(result.temporaryPassword).toHaveLength(20);
      expect(repository.createGuide).toHaveBeenCalled();
    });
  });

  describe("matchLocalMatesForAI", () => {
    it("suggests top qualified LocalMates matching destination, language and preferences", async () => {
      const response = await service.matchLocalMatesForAI({
        destination: "Mù Cang Chải",
        language: "English",
        preferences: ["chụp ảnh", "trekking"],
        limit: 3,
      });

      expect(response.matchedCount).toBe(3);
      expect(response.topLocalMates.length).toBe(3);
      expect(response.topLocalMates[0].guideCode).toBe("LM-YB-001");
      expect(response.topLocalMates[0].fullName).toBe("Giàng A Pháo");
      expect(response.topLocalMates[0].avatarUrl).toBeDefined();
      expect(response.topLocalMates[0].matchScore).toBeGreaterThan(0.8);
      expect(response.topLocalMates[0].matchReason).toContain("Mù Cang Chải");
      expect(response.suggestedTours.length).toBeGreaterThan(0);
      expect(response.suggestedTours[0].tourCode).toBe("HVNT-0007-24");
    });

    it("respects the limit argument", async () => {
      const response = await service.matchLocalMatesForAI({
        destination: "Yên Bái",
        limit: 2,
      });

      expect(response.matchedCount).toBe(2);
      expect(response.topLocalMates.length).toBe(2);
    });
  });

  describe("updateQualification", () => {
    it("throws NotFoundException if guide does not exist", async () => {
      repository.findGuideById.mockResolvedValueOnce(null);
      await expect(
        service.updateQualification("non-existent", { status: "QUALIFIED" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("updates status to QUALIFIED when guide exists", async () => {
      repository.findGuideById.mockResolvedValueOnce(mockQualifiedGuides[0]);
      repository.updateGuide.mockResolvedValueOnce({
        ...mockQualifiedGuides[0],
        status: LocalMateStatus.QUALIFIED,
      });

      const updated = await service.updateQualification("guide-1", { status: "QUALIFIED" });
      expect(updated.status).toBe(LocalMateStatus.QUALIFIED);
      expect(repository.updateGuide).toHaveBeenCalledWith("guide-1", { status: "QUALIFIED" });
    });
  });

  describe("getKnowledge", () => {
    it("returns structured knowledge with deterministic knowledgeVersion and without prompt fields", async () => {
      const response = await service.getKnowledge({
        destination: "Mù Cang Chải",
        query: "Tôi muốn đi du lịch 3 ngày 2 đêm",
        limit: 3,
      });

      expect(response).toBeDefined();
      expect(response.knowledgeVersion).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(response.metadata).toEqual({
        totalTours: 1,
        totalGuides: 3,
        destination: "Mù Cang Chải",
        query: "Tôi muốn đi du lịch 3 ngày 2 đêm",
      });

      // No dead prompt/orchestration fields
      expect((response as any).role).toBeUndefined();
      expect((response as any).systemPrompt).toBeUndefined();
      expect((response as any).promptContext).toBeUndefined();
      expect((response as any).metadata.generatedAt).toBeUndefined();

      // Exact public projection for tours
      expect(response.tours).toEqual([
        {
          tourCode: "HVNT-0007-24",
          title: "HÀ NỘI - MÙ CANG CHẢI (3N2Đ)",
          duration: "3N2Đ",
          highlights: ["Ruộng bậc thang", "Khoáng nóng"],
          content: "Chi tiết tour Mù Cang Chải...",
          distanceKm: null,
        },
      ]);

      // Exact public projection for guides
      expect(response.guides[0]).toEqual({
        candidateKey: "cand_LM-YB-001",
        guideCode: "LM-YB-001",
        fullName: "Giàng A Pháo",
        avatarUrl: "https://example.com/phao.jpg",
        languages: ["English", "Vietnamese", "H'Mông"],
        operatingRegions: ["Mù Cang Chải", "Trạm Tấu", "Yên Bái"],
        specialties: ["Chụp ảnh flycam", "Trekking đỉnh núi"],
        rating: 4.95,
        totalReviews: 48,
        bio: "Local guide Mù Cang Chải",
        distanceKm: null,
      });

      // Bounds both tours and guides
      expect(repository.searchTourKnowledge).toHaveBeenCalledWith({
        destination: "Mù Cang Chải",
        search: "Tôi muốn đi du lịch 3 ngày 2 đêm",
        provinceCode: undefined,
        tourScope: undefined,
        bounds: undefined,
        fallbackProvinceCode: undefined,
        limit: 3,
      });
      expect(repository.findQualifiedGuides).toHaveBeenCalledWith({
        destination: "Mù Cang Chải",
        bounds: undefined,
        fallbackRegions: undefined,
        limit: 3,
      });
    });

    it("produces deterministic hash for identical data and changes hash when content changes", async () => {
      const first = await service.getKnowledge({
        destination: "Mù Cang Chải",
        limit: 3,
      });
      const second = await service.getKnowledge({
        destination: "Mù Cang Chải",
        limit: 3,
      });
      expect(first.knowledgeVersion).toBe(second.knowledgeVersion);

      // Modify tour content and verify version changes
      repository.searchTourKnowledge.mockResolvedValueOnce([
        {
          ...mockTours[0],
          title: "TOUR ĐỔI TÊN",
        },
      ]);
      const third = await service.getKnowledge({
        destination: "Mù Cang Chải",
        limit: 3,
      });
      expect(third.knowledgeVersion).not.toBe(first.knowledgeVersion);
    });

    it("uses default limit of 5 when limit is not specified", async () => {
      await service.getKnowledge({
        destination: "Mù Cang Chải",
      });

      expect(repository.searchTourKnowledge).toHaveBeenCalledWith({
        destination: "Mù Cang Chải",
        search: undefined,
        provinceCode: undefined,
        tourScope: undefined,
        bounds: undefined,
        fallbackProvinceCode: undefined,
        limit: 5,
      });
      expect(repository.findQualifiedGuides).toHaveBeenCalledWith({
        destination: "Mù Cang Chải",
        bounds: undefined,
        fallbackRegions: undefined,
        limit: 5,
      });
    });

    it("filters far coordinates, keeps administrative null-coordinate fallback, caps candidates and hides coordinates", async () => {
      repository.findHotelLocation.mockResolvedValueOnce({
        id: "hotel-1",
        name: "Hotel",
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        area: "Hồ Thác Bà",
        latitude: 21,
        longitude: 104,
      });
      repository.searchTourKnowledge.mockResolvedValueOnce([
        {
          ...mockTours[0],
          tourCode: "NEAR",
          provinceCode: "YEN_BAI",
          tourScope: "LOCAL",
          latitude: 21.01,
          longitude: 104.01,
        },
        {
          ...mockTours[0],
          tourCode: "FAR",
          provinceCode: "YEN_BAI",
          tourScope: "LOCAL",
          latitude: 22,
          longitude: 105,
        },
        {
          ...mockTours[0],
          tourCode: "FALLBACK",
          provinceCode: "YEN_BAI",
          tourScope: "LOCAL",
          latitude: null,
          longitude: null,
        },
      ] as any);
      repository.findQualifiedGuides.mockResolvedValueOnce([
        {
          ...mockQualifiedGuides[0],
          guideCode: "NEAR",
          serviceLatitude: 21.01,
          serviceLongitude: 104.01,
        },
        { ...mockQualifiedGuides[1], guideCode: "FAR", serviceLatitude: 22, serviceLongitude: 105 },
        {
          ...mockQualifiedGuides[2],
          guideCode: "FALLBACK",
          serviceLatitude: null,
          serviceLongitude: null,
        },
      ] as any);

      const response = await service.getKnowledge({ hotelId: "hotel-1", radiusKm: 10, limit: 10 });

      expect(response.tours.map((tour) => tour.tourCode)).toEqual(["NEAR", "FALLBACK"]);
      expect(response.guides.map((guide) => guide.guideCode)).toEqual(["NEAR", "FALLBACK"]);
      expect(response.tours[0].distanceKm).toBeGreaterThan(0);
      expect(response.tours[1].distanceKm).toBeNull();
      expect(response.tours[0]).not.toHaveProperty("latitude");
      expect(response.guides[0]).not.toHaveProperty("serviceLatitude");
      expect(repository.searchTourKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
      expect(repository.findQualifiedGuides).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
    });

    it("uses an in-province destination without applying the hotel radius", async () => {
      repository.findHotelLocation.mockResolvedValueOnce({
        id: "hotel-1",
        name: "Hotel",
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        area: "Hồ Thác Bà",
        latitude: 21,
        longitude: 104,
      });
      repository.searchTourKnowledge.mockResolvedValueOnce([
        {
          ...mockTours[0],
          provinceCode: "YEN_BAI",
          province: "Yên Bái",
          tourScope: "LOCAL",
          latitude: 22,
          longitude: 105,
        },
      ] as any);
      repository.findQualifiedGuides.mockResolvedValueOnce([
        { ...mockQualifiedGuides[0], serviceLatitude: 22, serviceLongitude: 105 },
      ] as any);

      const response = await service.getKnowledge({
        hotelId: "hotel-1",
        destination: "Mù Cang Chải",
        radiusKm: 1,
      });

      expect(response.tours).toHaveLength(1);
      expect(response.guides).toHaveLength(1);
      expect(repository.searchTourKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({ bounds: undefined, limit: 5 }),
      );
    });

    it("keeps an out-of-province request inside the hotel's province", async () => {
      repository.findHotelLocation.mockResolvedValueOnce({
        id: "hotel-hanoi",
        name: "Hotel Hà Nội",
        provinceCode: "HA_NOI",
        province: "Hà Nội",
        area: "Hoàn Kiếm",
        latitude: 21.0285,
        longitude: 105.8542,
      });

      const response = await service.getKnowledge({
        hotelId: "hotel-hanoi",
        query: "Gợi ý tour Sa Pa",
        radiusKm: 50,
      });

      expect(repository.searchTourKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: undefined,
          search: undefined,
          provinceCode: "HA_NOI",
          fallbackProvinceCode: "HA_NOI",
          bounds: expect.any(Object),
        }),
      );
      expect(repository.findQualifiedGuides).toHaveBeenCalledWith(
        expect.objectContaining({ destination: undefined, bounds: expect.any(Object) }),
      );
      expect(response.metadata).toEqual(
        expect.objectContaining({
          destination: "Hà Nội",
          locationScope: expect.objectContaining({
            province: "Hà Nội",
            requestedDestination: "Sa Pa",
            outsideHotelProvince: true,
            mode: "HOTEL_PROVINCE_FALLBACK",
          }),
        }),
      );
      expect(response.tours).toEqual([]);
      expect(response.guides).toEqual([]);
    });

    it("keeps a bounded attraction keyword while resolving the destination", async () => {
      repository.findHotelLocation.mockResolvedValueOnce({
        id: "hotel-1",
        name: "Hotel",
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        area: "Hồ Thác Bà",
        latitude: 21,
        longitude: 104,
      });

      await service.getKnowledge({
        query: "Gợi ý khoáng nóng ở Trạm Tấu",
        hotelId: "hotel-1",
      });

      expect(repository.searchTourKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({ destination: "Trạm Tấu", search: "khoáng nóng" }),
      );
    });

    it("fails when hotelId does not exist", async () => {
      repository.findHotelLocation.mockResolvedValueOnce(null);
      await expect(service.getKnowledge({ hotelId: "missing" })).rejects.toThrow(NotFoundException);
      expect(repository.searchTourKnowledge).not.toHaveBeenCalled();
    });

    it("prioritizes tours by hotel location anchor: area/LOCAL -> province/REGIONAL_DAYTRIP -> INTERPROVINCIAL", async () => {
      repository.findHotelLocation.mockResolvedValueOnce({
        id: "hotel-thac-ba",
        name: "Thác Bà Paradise Resort",
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        area: "Hồ Thác Bà",
      });

      const candidateTours = [
        {
          id: "tour-inter",
          tourCode: "HVNT-0007-24",
          title: "HÀ NỘI - MÙ CANG CHẢI",
          duration: "3N2Đ",
          highlights: [],
          content: "Nội dung tour liên tỉnh...",
          sourceFileName: null,
          provinceCode: "YEN_BAI",
          province: "Yên Bái",
          tourScope: "INTERPROVINCIAL" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "tour-regional",
          tourCode: "HVNT-0003-24",
          title: "YÊN BÁI - TRẠM TẤU - NGHĨA LỘ",
          duration: "2N1Đ",
          highlights: [],
          content: "Nội dung tour nội tỉnh...",
          sourceFileName: null,
          provinceCode: "YEN_BAI",
          province: "Yên Bái",
          tourScope: "REGIONAL_DAYTRIP" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "tour-local",
          tourCode: "HVTB-0001-23",
          title: "Yên Bái - Hồ Thác Bà - Thủy điện",
          duration: "0,5N",
          highlights: [],
          content: "Nội dung tour Thác Bà...",
          sourceFileName: null,
          provinceCode: "YEN_BAI",
          province: "Yên Bái",
          tourScope: "LOCAL" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      repository.searchTourKnowledge.mockResolvedValueOnce(candidateTours);

      const res = await service.getKnowledge({
        hotelId: "hotel-thac-ba",
        limit: 3,
      });

      expect(repository.findHotelLocation).toHaveBeenCalledWith("hotel-thac-ba");
      expect(res.metadata).toHaveProperty("hotelId", "hotel-thac-ba");
      expect(res.tours.length).toBe(2);
      // First is local (Hồ Thác Bà / LOCAL)
      expect(res.tours[0].tourCode).toBe("HVTB-0001-23");
      // Second is regional daytrip in Yên Bái
      expect(res.tours[1].tourCode).toBe("HVNT-0003-24");
      expect(res.tours.map((tour) => tour.tourCode)).not.toContain("HVNT-0007-24");
    });
  });

  describe("listTours with Hotel Location Anchor", () => {
    it("returns tours prioritized by hotel location anchor", async () => {
      repository.findHotelLocation.mockResolvedValueOnce({
        id: "hotel-thac-ba",
        name: "Thác Bà Paradise Resort",
        provinceCode: "YEN_BAI",
        province: "Yên Bái",
        area: "Hồ Thác Bà",
      });

      repository.searchTourKnowledge.mockResolvedValueOnce([
        {
          id: "tour-inter",
          tourCode: "HVNT-0007-24",
          title: "HÀ NỘI - MÙ CANG CHẢI",
          duration: "3N2Đ",
          highlights: [],
          content: "Nội dung tour liên tỉnh...",
          sourceFileName: null,
          provinceCode: "YEN_BAI",
          province: "Yên Bái",
          tourScope: "INTERPROVINCIAL" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "tour-local",
          tourCode: "HVTB-0001-23",
          title: "Yên Bái - Hồ Thác Bà - Thủy điện",
          duration: "0,5N",
          highlights: [],
          content: "Nội dung tour Thác Bà...",
          sourceFileName: null,
          provinceCode: "YEN_BAI",
          province: "Yên Bái",
          tourScope: "LOCAL" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const tours = await service.listTours({ hotelId: "hotel-thac-ba", limit: 2 });
      expect(repository.findHotelLocation).toHaveBeenCalledWith("hotel-thac-ba");
      expect(tours.length).toBe(2);
      expect(tours[0].tourCode).toBe("HVTB-0001-23");
      expect(tours[1].tourCode).toBe("HVNT-0007-24");
    });

    it("forwards free-text search when no hotel anchor is supplied", async () => {
      repository.searchTourKnowledge.mockResolvedValueOnce([]);

      await service.listTours({ search: "Thác Bà", limit: 20 });

      expect(repository.searchTourKnowledge).toHaveBeenCalledWith({
        destination: undefined,
        search: "Thác Bà",
        provinceCode: undefined,
        tourScope: undefined,
        limit: 20,
      });
    });
  });

  describe("updateTour", () => {
    it("forwards editable identity and source fields", async () => {
      repository.findTourById.mockResolvedValueOnce({ title: "Old" } as never);
      repository.updateTour.mockResolvedValueOnce({ id: "tour-1" } as never);

      await service.updateTour("tour-1", {
        tourCode: "TOUR-NEW",
        sourceFileName: "source.docx",
      });

      expect(repository.updateTour).toHaveBeenCalledWith(
        "tour-1",
        expect.objectContaining({ tourCode: "TOUR-NEW", sourceFileName: "source.docx" }),
      );
    });
  });

  describe("createTour with auto-inference", () => {
    it("auto-infers provinceCode, province, and tourScope when omitted", async () => {
      repository.findTourByCode.mockResolvedValueOnce(null);

      const created = await service.createTour({
        tourCode: "TEST-SAPA-01",
        title: "Khám phá Sa Pa - Cát Cát (1N)",
        duration: "1N",
        highlights: [],
        content: "Lịch trình Sa Pa chi tiết...",
      });

      expect(repository.createTour).toHaveBeenCalledWith(
        expect.objectContaining({
          tourCode: "TEST-SAPA-01",
          provinceCode: "LAO_CAI",
          province: "Lào Cai",
          tourScope: "LOCAL",
        }),
      );
      expect(created).toBeDefined();
    });
  });
});

describe("Geography Taxonomy Helper", () => {
  it("requires coordinates as a pair, including explicit null updates", () => {
    expect(
      createLocalMateTourSchema.safeParse({
        title: "Tour test",
        duration: "1N",
        highlights: [],
        content: "Nội dung hợp lệ",
        latitude: 21,
      }).success,
    ).toBe(false);
  });

  it("infers Sa Pa destination to LAO_CAI / LOCAL", () => {
    const res = inferProvinceAndScope("Sa Pa", "Khám phá Cát Cát (1N)");
    expect(res.provinceCode).toBe("LAO_CAI");
    expect(res.province).toBe("Lào Cai");
    expect(res.tourScope).toBe("LOCAL");
  });

  it("infers Hồ Thác Bà to YEN_BAI / LOCAL", () => {
    const res = inferProvinceAndScope("Hồ Thác Bà", "Yên Bái - Hồ Thác Bà - Thủy điện (0,5N)");
    expect(res.provinceCode).toBe("YEN_BAI");
    expect(res.province).toBe("Yên Bái");
    expect(res.tourScope).toBe("LOCAL");
  });

  it("infers multi-destination in Yên Bái to YEN_BAI / REGIONAL_DAYTRIP", () => {
    const res = inferProvinceAndScope(
      "Trạm Tấu, Tú Lệ, Nghĩa Lộ",
      "TÚ LỆ - ĐÈO KHAU PHẠ - TRẠM TẤU - NGHĨA LỘ (2N1Đ)",
    );
    expect(res.provinceCode).toBe("YEN_BAI");
    expect(res.province).toBe("Yên Bái");
    expect(res.tourScope).toBe("REGIONAL_DAYTRIP");
  });

  it("infers Hà Nội - Yên Bái interprovincial tour to YEN_BAI / INTERPROVINCIAL", () => {
    const res = inferProvinceAndScope(
      "Mù Cang Chải, Trạm Tấu",
      "HÀ NỘI - SUỐI GIÀNG - NGHĨA LỘ - TRẠM TẤU - MÙ CANG CHẢI (3N2Đ)",
    );
    expect(res.provinceCode).toBe("YEN_BAI");
    expect(res.province).toBe("Yên Bái");
    expect(res.tourScope).toBe("INTERPROVINCIAL");
  });

  it("infers Hà Nội city tour to HA_NOI / LOCAL", () => {
    const res = inferProvinceAndScope("Hà Nội", "Hà Nội City Tour 36 phố phường (1N)");
    expect(res.provinceCode).toBe("HA_NOI");
    expect(res.province).toBe("Hà Nội");
    expect(res.tourScope).toBe("LOCAL");
  });

  it("does not assign an arbitrary province when taxonomy has no match", () => {
    expect(inferProvinceAndScope("Tour bí ẩn")).toEqual({
      provinceCode: "UNCLASSIFIED",
      province: "Chưa phân loại",
      tourScope: "LOCAL",
    });
  });
});

describe("LocalMateAiController", () => {
  let controller: LocalMateAiController;
  let service: jest.Mocked<Partial<LocalMateService>>;

  beforeEach(() => {
    service = {
      getKnowledge: jest.fn().mockResolvedValue({
        knowledgeVersion: "sha256:dummy",
        metadata: { totalTours: 0, totalGuides: 0 },
        tours: [],
        guides: [],
      } as any),
    };
    controller = new LocalMateAiController(service as LocalMateService);
  });

  it("delegates GET knowledge to service.getKnowledge with parsed DTO", async () => {
    await controller.getKnowledge({ destination: "Hà Giang", limit: "3", radiusKm: "25" });
    expect(service.getKnowledge).toHaveBeenCalledWith({
      destination: "Hà Giang",
      limit: 3,
      radiusKm: 25,
    });
  });

  it("coerces the default knowledge radius", () => {
    expect(queryLocalMateKnowledgeSchema.parse({}).radiusKm).toBe(50);
  });

  it("delegates POST knowledge to service.getKnowledge with parsed DTO", async () => {
    await controller.queryKnowledge({ query: "trekking", limit: 2 });
    expect(service.getKnowledge).toHaveBeenCalledWith({
      query: "trekking",
      radiusKm: 50,
      limit: 2,
    });
  });

  it("has HTTP 200 metadata on queryKnowledge POST method", () => {
    const httpCode = Reflect.getMetadata("__httpCode__", controller.queryKnowledge);
    expect(httpCode).toBe(200);
  });

  it("returns sanitized public projection for getGuideByCode", async () => {
    service.getGuideByCode = jest.fn().mockResolvedValue({
      id: "internal-id-123",
      userId: "user-id-456",
      tenantId: "tenant-id-789",
      guideCode: "LM-YB-001",
      fullName: "Giàng A Pháo",
      phone: "0987654321",
      email: "phao@internal.vn",
      position: "LEAD_GUIDE",
      avatarUrl: "https://example.com/avatar.jpg",
      languages: ["Vietnamese", "English"],
      operatingRegions: ["Mù Cang Chải"],
      specialties: ["Trekking"],
      dailyRateVnd: 1200000,
      rating: 4.95,
      totalReviews: 48,
      bio: "Local guide bio",
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: "user-id-456" },
      tenant: { id: "tenant-id-789" },
    } as any);

    const result = await controller.getGuideByCode("LM-YB-001");

    expect(result).toEqual({
      code: "LM-YB-001",
      guideCode: "LM-YB-001",
      name: "Giàng A Pháo",
      fullName: "Giàng A Pháo",
      avatar: "https://example.com/avatar.jpg",
      avatarUrl: "https://example.com/avatar.jpg",
      languages: ["Vietnamese", "English"],
      operatingRegions: ["Mù Cang Chải"],
      specialties: ["Trekking"],
      dailyRateVnd: 1200000,
      rating: 4.95,
      totalReviews: 48,
      bio: "Local guide bio",
    });

    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("userId");
    expect(result).not.toHaveProperty("tenantId");
    expect(result).not.toHaveProperty("phone");
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("position");
    expect(result).not.toHaveProperty("createdAt");
    expect(result).not.toHaveProperty("updatedAt");
    expect(result).not.toHaveProperty("user");
    expect(result).not.toHaveProperty("tenant");
  });

  it("delegates GET tours to service.listTours", async () => {
    service.listTours = jest.fn().mockResolvedValue([]);
    await controller.listTours("Mù Cang Chải");
    expect(service.listTours).toHaveBeenCalledWith("Mù Cang Chải");
  });
});
