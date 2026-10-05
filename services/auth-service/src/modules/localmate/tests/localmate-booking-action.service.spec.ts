import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { LocalMateStatus } from "@prisma/client";
import { LocalMateService } from "../application/localmate.service";
import { LocalMateRepository } from "../infrastructure/repositories/localmate.repository";

describe("LocalMateService - resolveBookingCandidate", () => {
  let service: LocalMateService;
  let repository: {
    findGuideByCode: jest.Mock;
    findHotelLocation: jest.Mock;
    findActiveServiceForGuide: jest.Mock;
    findActiveServiceForGuidePublic: jest.Mock;
    findTelegramBinding: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      findGuideByCode: jest.fn(),
      findHotelLocation: jest.fn(),
      findActiveServiceForGuide: jest.fn(),
      findActiveServiceForGuidePublic: jest.fn(),
      findTelegramBinding: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalMateService,
        {
          provide: LocalMateRepository,
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<LocalMateService>(LocalMateService);
  });

  const mockGuide = {
    id: "guide-123",
    guideCode: "LM-LC-001",
    fullName: "Sùng A Tủa",
    avatarUrl: "https://example.com/tua.jpg",
    languages: ["Tiếng Việt", "H'Mông"],
    operatingRegions: ["Sa Pa", "Lào Cai"],
    specialties: ["Trekking", "Ẩm thực bản địa"],
    rating: 4.9,
    totalReviews: 28,
    status: LocalMateStatus.QUALIFIED,
  };

  const mockHotel = {
    id: "hotel-456",
    name: "Sapa Horizon Hotel",
    provinceCode: "LAO_CAI",
    province: "Lào Cai",
    area: "Sa Pa",
  };

  const mockService = {
    id: "srv-789",
    importKey: "TOUR_SAPA_TREK",
    name: "Khám phá bản làng Sa Pa cùng LocalMate",
    unitPrice: 1200000,
    currency: "VND",
    pricingUnit: "tour",
    capacityAvailable: 6,
  };

  it("resolves valid qualified guide with active service and active telegram binding", async () => {
    repository.findGuideByCode.mockResolvedValue(mockGuide);
    repository.findHotelLocation.mockResolvedValue(mockHotel);
    repository.findActiveServiceForGuide.mockResolvedValue(mockService);
    repository.findTelegramBinding.mockResolvedValue({
      id: "bind-1",
      localMateProfileId: mockGuide.id,
      status: "ACTIVE",
    });

    const result = await service.resolveBookingCandidate({
      candidateKey: "cand_LM-LC-001",
      hotelId: "hotel-456",
    });

    expect(result).toEqual({
      candidateKey: "cand_LM-LC-001",
      guide: {
        id: "guide-123",
        guideCode: "LM-LC-001",
        fullName: "Sùng A Tủa",
        avatarUrl: "https://example.com/tua.jpg",
        languages: ["Tiếng Việt", "H'Mông"],
        specialties: ["Trekking", "Ẩm thực bản địa"],
        rating: 4.9,
        totalReviews: 28,
      },
      service: {
        id: "srv-789",
        code: "TOUR_SAPA_TREK",
        name: "Khám phá bản làng Sa Pa cùng LocalMate",
        price: 1200000,
        currency: "VND",
        unit: "tour",
        minDurationHours: 4,
        maxPartySize: 6,
      },
      hotel: {
        id: "hotel-456",
        name: "Sapa Horizon Hotel",
        province: "Lào Cai",
      },
      telegramReady: true,
      action: "LOCALMATE_BOOKING",
    });
  });

  it("sets telegramReady to false when LocalMate has no active telegram binding", async () => {
    repository.findGuideByCode.mockResolvedValue(mockGuide);
    repository.findHotelLocation.mockResolvedValue(mockHotel);
    repository.findActiveServiceForGuide.mockResolvedValue(mockService);
    repository.findTelegramBinding.mockResolvedValue(null);

    const result = await service.resolveBookingCandidate({
      candidateKey: "cand_LM-LC-001",
      hotelId: "hotel-456",
    });

    expect(result.telegramReady).toBe(false);
  });

  it("resolves the same candidate contract from an explicit public location", async () => {
    repository.findGuideByCode.mockResolvedValue(mockGuide);
    repository.findActiveServiceForGuidePublic.mockResolvedValue(mockService);
    repository.findTelegramBinding.mockResolvedValue({ id: "bind-1" });

    const result = await service.resolveBookingCandidate({
      candidateKey: "cand_LM-LC-001",
      location: "Sa Pa, Lào Cai",
    });

    expect(repository.findHotelLocation).not.toHaveBeenCalled();
    expect(repository.findActiveServiceForGuidePublic).toHaveBeenCalledWith(mockGuide.id);
    expect(result.service.id).toBe(mockService.id);
    expect("locationContext" in result ? result.locationContext : null).toEqual({
      source: "PUBLIC",
      label: "Sa Pa, Lào Cai",
    });
  });

  it("rejects public locations outside the guide operating region", async () => {
    repository.findGuideByCode.mockResolvedValue(mockGuide);

    await expect(
      service.resolveBookingCandidate({
        candidateKey: "cand_LM-LC-001",
        location: "Đà Nẵng",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws NotFoundException when guide does not exist or is not qualified", async () => {
    repository.findGuideByCode.mockResolvedValue({
      ...mockGuide,
      status: LocalMateStatus.PENDING,
    });

    await expect(
      service.resolveBookingCandidate({
        candidateKey: "cand_LM-LC-001",
        hotelId: "hotel-456",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws BadRequestException when operating regions do not match hotel province", async () => {
    repository.findGuideByCode.mockResolvedValue({
      ...mockGuide,
      operatingRegions: ["Đà Lạt", "Lâm Đồng"],
    });
    repository.findHotelLocation.mockResolvedValue(mockHotel);

    await expect(
      service.resolveBookingCandidate({
        candidateKey: "cand_LM-LC-001",
        hotelId: "hotel-456",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws NotFoundException when no active service is linked for this hotel", async () => {
    repository.findGuideByCode.mockResolvedValue(mockGuide);
    repository.findHotelLocation.mockResolvedValue(mockHotel);
    repository.findActiveServiceForGuide.mockResolvedValue(null);

    await expect(
      service.resolveBookingCandidate({
        candidateKey: "cand_LM-LC-001",
        hotelId: "hotel-456",
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
