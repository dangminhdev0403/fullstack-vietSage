import { createHash } from "node:crypto";
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { LocalMateStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { calculateHaversineDistanceMeters } from "../../../common/geo-distance";
import { generateTemporaryPassword } from "../../../common/security/password-policy.util";
import { LocalMateRepository } from "../infrastructure/repositories/localmate.repository";
import type {
  CreateLocalMateGuideDto,
  UpdateLocalMateGuideDto,
  UpdateQualificationStatusDto,
  ListLocalMateGuidesQueryDto,
  MatchLocalMateRequestDto,
  CreateLocalMateTourDto,
  UpdateLocalMateTourDto,
  QueryLocalMateKnowledgeDto,
  ListLocalMateToursQueryDto,
} from "../domain/schemas/localmate.schema";
import {
  inferProvinceAndScope,
  normalizeTourDuration,
} from "../domain/constants/geography.constant";

export interface MatchedLocalMateResult {
  guideCode: string;
  fullName: string;
  avatarUrl: string;
  languages: string[];
  operatingRegions: string[];
  specialties: string[];
  dailyRateVnd: number;
  rating: number;
  totalReviews: number;
  matchScore: number;
  matchReason: string;
}

export interface MatchAiResponse {
  matchedCount: number;
  topLocalMates: MatchedLocalMateResult[];
  suggestedTours: Array<{
    tourCode: string;
    title: string;
    destination: string;
    duration: string;
    highlights: string[];
  }>;
}

@Injectable()
export class LocalMateService {
  constructor(private readonly repository: LocalMateRepository) {}

  async createGuide(dto: CreateLocalMateGuideDto) {
    if (dto.guideCode) {
      const existing = await this.repository.findGuideByCode(dto.guideCode);
      if (existing) {
        throw new BadRequestException(`Mã hướng dẫn viên '${dto.guideCode}' đã tồn tại`);
      }
    }

    const guideCode = dto.guideCode || (await this.repository.generateNextGuideCode());
    const position = dto.position || "GUIDE";

    // Auto-create or link User account for login if not already provided
    let userId = dto.userId;
    let tenantId = dto.tenantId;

    if (!tenantId) {
      const rootTenant = await this.repository.findRootTenant();
      if (rootTenant) {
        tenantId = rootTenant.id;
      }
    }

    let temporaryPassword: string | undefined;
    if (!userId) {
      const email = dto.email?.trim() || `${guideCode.toLowerCase()}@localmate.vietsage.vn`;
      const existingUser = await this.repository.findUserByEmail(email);

      if (existingUser) {
        userId = existingUser.id;
      } else {
        const roleCode = position === "COORDINATOR" ? "LOCALMATE_COORDINATOR" : "LOCALMATE_GUIDE";
        const role = await this.repository.findRoleByCode(roleCode);
        temporaryPassword = generateTemporaryPassword(20);
        const passwordHash = await argon2.hash(temporaryPassword);

        const newUser = await this.repository.createGuideUser({
          email,
          fullName: dto.fullName,
          passwordHash,
          roleId: role?.id,
          tenantId,
        });
        userId = newUser.id;
      }
    }

    const guide = await this.repository.createGuide({
      ...dto,
      guideCode,
      position,
      userId,
      tenantId,
    });
    return temporaryPassword ? { ...guide, temporaryPassword } : guide;
  }

  async updateGuide(id: string, dto: UpdateLocalMateGuideDto) {
    const existing = await this.repository.findGuideById(id);
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy hướng dẫn viên với ID '${id}'`);
    }

    if (dto.status === LocalMateStatus.SUSPENDED && existing.userId) {
      await this.repository.updateUserStatus(existing.userId, "DISABLED");
    } else if (dto.status === LocalMateStatus.QUALIFIED && existing.userId) {
      await this.repository.updateUserStatus(existing.userId, "ACTIVE");
    }

    return this.repository.updateGuide(id, dto);
  }

  async updateQualification(id: string, dto: UpdateQualificationStatusDto) {
    const existing = await this.repository.findGuideById(id);
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy hướng dẫn viên với ID '${id}'`);
    }

    if (dto.status === LocalMateStatus.SUSPENDED && existing.userId) {
      await this.repository.updateUserStatus(existing.userId, "DISABLED");
    } else if (dto.status === LocalMateStatus.QUALIFIED && existing.userId) {
      await this.repository.updateUserStatus(existing.userId, "ACTIVE");
    }

    return this.repository.updateGuide(id, { status: dto.status });
  }

  async getGuideById(id: string) {
    const guide = await this.repository.findGuideById(id);
    if (!guide) {
      throw new NotFoundException(`Không tìm thấy hướng dẫn viên với ID '${id}'`);
    }
    return guide;
  }

  async getGuideByCode(guideCode: string) {
    const guide = await this.repository.findGuideByCode(guideCode);
    if (!guide) {
      throw new NotFoundException(`Không tìm thấy hướng dẫn viên với mã '${guideCode}'`);
    }
    return guide;
  }

  async listGuides(query: ListLocalMateGuidesQueryDto) {
    return this.repository.listGuides(query);
  }

  async listTours(queryOrDestination?: string | Partial<ListLocalMateToursQueryDto>) {
    const query: Partial<ListLocalMateToursQueryDto> =
      typeof queryOrDestination === "string"
        ? { destination: queryOrDestination, limit: 20 }
        : queryOrDestination || {};

    const limit = query.limit || 20;

    let hotel: {
      provinceCode: string | null;
      province: string | null;
      area: string | null;
    } | null = null;
    if (query.hotelId) {
      hotel = await this.repository.findHotelLocation(query.hotelId);
    }

    const destination = query.destination || (hotel?.area ?? undefined);
    const provinceCode = query.provinceCode || (hotel?.provinceCode ?? undefined);
    const tourScope = query.scope;

    if (hotel) {
      const tours = await this.repository.searchTourKnowledge({
        destination: query.destination,
        provinceCode: query.provinceCode,
        tourScope,
        limit: 50,
      });

      const scored = tours.map((t) => ({
        tour: t,
        score: this.calculateTourLocationScore(t, hotel),
      }));

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).map((s) => s.tour);
    }

    return this.repository.findToursByDestination(
      {
        destination,
        provinceCode,
        tourScope,
        limit,
      },
      limit,
    );
  }

  async createTour(dto: CreateLocalMateTourDto) {
    const tourCode = dto.tourCode || `TOUR-${Date.now().toString().slice(-6)}`;
    const existing = await this.repository.findTourByCode(tourCode);
    if (existing) {
      throw new ConflictException(`Mã tour '${tourCode}' đã tồn tại`);
    }

    const inferred = inferProvinceAndScope(dto.destination, dto.title);
    const provinceCode = dto.provinceCode || inferred.provinceCode;
    const province = dto.province || inferred.province;
    const tourScope = dto.tourScope || inferred.tourScope;

    return this.repository.createTour({
      tourCode,
      title: dto.title,
      destination: dto.destination,
      duration: normalizeTourDuration(dto.duration),
      highlights: dto.highlights || [],
      content: dto.content,
      sourceFileName: dto.sourceFileName || "manual_entry",
      provinceCode,
      province,
      tourScope,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
    });
  }

  async updateTour(id: string, dto: UpdateLocalMateTourDto) {
    const existing = await this.repository.findTourById(id);
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy tour với ID '${id}'`);
    }

    return this.repository.updateTour(id, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.destination !== undefined && { destination: dto.destination }),
      ...(dto.duration !== undefined && { duration: normalizeTourDuration(dto.duration) }),
      ...(dto.highlights !== undefined && { highlights: dto.highlights }),
      ...(dto.content !== undefined && { content: dto.content }),
      ...(dto.provinceCode !== undefined && { provinceCode: dto.provinceCode }),
      ...(dto.province !== undefined && { province: dto.province }),
      ...(dto.tourScope !== undefined && { tourScope: dto.tourScope }),
      ...(dto.latitude !== undefined && { latitude: dto.latitude }),
      ...(dto.longitude !== undefined && { longitude: dto.longitude }),
    });
  }

  async deleteTour(id: string) {
    const existing = await this.repository.findTourById(id);
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy tour với ID '${id}'`);
    }

    await this.repository.deleteTour(id);
    return { success: true, message: `Đã xóa tour '${existing.title}' khỏi kho tri thức` };
  }

  async matchLocalMatesForAI(dto: MatchLocalMateRequestDto): Promise<MatchAiResponse> {
    const qualifiedGuides = await this.repository.findQualifiedGuides();
    const limit = dto.limit || 3;

    const scored = qualifiedGuides.map((guide) => {
      let regionScore = 0.5;
      let matchedRegion = "";
      if (dto.destination) {
        const destLower = dto.destination.toLowerCase();
        for (const reg of guide.operatingRegions) {
          const regLower = reg.toLowerCase();
          if (destLower.includes(regLower) || regLower.includes(destLower)) {
            regionScore = 1.0;
            matchedRegion = reg;
            break;
          }
        }
      } else {
        regionScore = 1.0;
      }

      let langScore = 0.5;
      if (dto.language) {
        const langLower = dto.language.toLowerCase();
        const hasLang = guide.languages.some((l) => {
          const lLower = l.toLowerCase();
          return (
            lLower.includes(langLower) ||
            langLower.includes(lLower) ||
            (langLower === "en" && lLower.includes("anh")) ||
            (langLower === "vi" && lLower.includes("việt"))
          );
        });
        langScore = hasLang ? 1.0 : 0.2;
      } else {
        langScore = 1.0;
      }

      let prefScore = 0.5;
      if (dto.preferences && dto.preferences.length > 0) {
        let matchCount = 0;
        for (const pref of dto.preferences) {
          const pLower = pref.toLowerCase();
          const match = guide.specialties.some((s) => s.toLowerCase().includes(pLower));
          if (match) matchCount++;
        }
        prefScore = matchCount > 0 ? Math.min(1.0, matchCount / dto.preferences.length + 0.3) : 0.3;
      } else {
        prefScore = 1.0;
      }

      const ratingScore = Math.min(1.0, (guide.rating || 5.0) / 5.0);

      // Weighted score
      const totalScore = Number(
        (0.35 * regionScore + 0.3 * langScore + 0.2 * prefScore + 0.15 * ratingScore).toFixed(2),
      );

      const regionText = matchedRegion || guide.operatingRegions[0] || "khu vực Tây Bắc";
      const specText =
        guide.specialties.length > 0
          ? guide.specialties.slice(0, 2).join(", ")
          : "nhiệt tình, chu đáo";
      const matchReason = `Am hiểu sâu sắc địa bàn ${regionText}, giao tiếp tốt bằng ${guide.languages.join(
        ", ",
      )}, thế mạnh nổi bật: ${specText}.`;

      return {
        guideCode: guide.guideCode,
        fullName: guide.fullName,
        avatarUrl: guide.avatarUrl,
        languages: guide.languages,
        operatingRegions: guide.operatingRegions,
        specialties: guide.specialties,
        dailyRateVnd: guide.dailyRateVnd,
        rating: guide.rating,
        totalReviews: guide.totalReviews,
        matchScore: totalScore,
        matchReason,
      };
    });

    scored.sort((a, b) => b.matchScore - a.matchScore);
    const topLocalMates = scored.slice(0, limit);

    // Get suggested tours for context
    const suggestedToursRaw = await this.repository.findToursByDestination(dto.destination, 3);
    const suggestedTours = suggestedToursRaw.map((t) => ({
      tourCode: t.tourCode,
      title: t.title,
      destination: t.destination,
      duration: t.duration,
      highlights: t.highlights,
    }));

    return {
      matchedCount: topLocalMates.length,
      topLocalMates,
      suggestedTours,
    };
  }

  async getKnowledge(query: Partial<QueryLocalMateKnowledgeDto>) {
    const limit = query.limit ?? 5;
    const radiusKm = query.radiusKm ?? 50;

    let hotel: {
      id: string;
      name: string;
      provinceCode: string | null;
      province: string | null;
      area: string | null;
      latitude: unknown;
      longitude: unknown;
    } | null = null;
    if (query.hotelId) {
      hotel = await this.repository.findHotelLocation(query.hotelId);
      if (!hotel) {
        throw new NotFoundException(`Không tìm thấy khách sạn với ID '${query.hotelId}'`);
      }
    }

    const hotelCoordinates = this.coordinatesOf(hotel?.latitude, hotel?.longitude);
    const useHotelRadius = Boolean(hotelCoordinates && !query.destination);
    const bounds = useHotelRadius
      ? this.createGeographicBounds(
          hotelCoordinates!.latitude,
          hotelCoordinates!.longitude,
          radiusKm,
        )
      : undefined;
    const candidateLimit = useHotelRadius ? Math.min(Math.max(limit * 10, 30), 100) : limit;
    const fallbackRegions = [hotel?.area, hotel?.province].filter((value): value is string =>
      Boolean(value),
    );

    const fallbackDestination =
      hotel && !hotelCoordinates && !query.destination
        ? hotel.area || hotel.province || undefined
        : undefined;

    const [toursRaw, qualifiedGuides] = await Promise.all([
      this.repository.searchTourKnowledge({
        destination: query.destination,
        search: query.query,
        provinceCode:
          query.provinceCode ||
          (fallbackDestination ? (hotel?.provinceCode ?? undefined) : undefined),
        tourScope: query.scope,
        bounds,
        fallbackProvinceCode: useHotelRadius ? (hotel?.provinceCode ?? undefined) : undefined,
        limit: candidateLimit,
      }),
      this.repository.findQualifiedGuides({
        destination: query.destination || fallbackDestination,
        bounds,
        fallbackRegions: useHotelRadius ? fallbackRegions : undefined,
        limit: candidateLimit,
      }),
    ]);

    const projectedTours = toursRaw
      .map((tour) => ({
        tour,
        distanceKm: this.distanceKm(hotelCoordinates, tour.latitude, tour.longitude),
        fallbackScore: hotel ? this.calculateTourLocationScore(tour, hotel) : 0,
      }))
      .filter((item) => !useHotelRadius || item.distanceKm === null || item.distanceKm <= radiusKm)
      .sort(
        (left, right) =>
          this.compareDistance(left.distanceKm, right.distanceKm) ||
          right.fallbackScore - left.fallbackScore ||
          left.tour.tourCode.localeCompare(right.tour.tourCode),
      )
      .slice(0, limit)
      .map(({ tour, distanceKm }) => ({
        tourCode: tour.tourCode,
        title: tour.title,
        destination: tour.destination,
        duration: tour.duration,
        highlights: tour.highlights,
        content: this.sanitizeKnowledgeContent(tour.content),
        distanceKm,
      }));

    const projectedGuides = qualifiedGuides
      .map((guide) => ({
        guide,
        distanceKm: this.distanceKm(
          hotelCoordinates,
          guide.serviceLatitude,
          guide.serviceLongitude,
        ),
      }))
      .filter((item) => !useHotelRadius || item.distanceKm === null || item.distanceKm <= radiusKm)
      .sort(
        (left, right) =>
          this.compareDistance(left.distanceKm, right.distanceKm) ||
          right.guide.rating - left.guide.rating ||
          left.guide.guideCode.localeCompare(right.guide.guideCode),
      )
      .slice(0, limit)
      .map(({ guide, distanceKm }) => ({
        guideCode: guide.guideCode,
        fullName: guide.fullName,
        avatarUrl: guide.avatarUrl,
        languages: guide.languages,
        operatingRegions: guide.operatingRegions,
        specialties: guide.specialties,
        dailyRateVnd: guide.dailyRateVnd,
        rating: guide.rating,
        totalReviews: guide.totalReviews,
        bio: guide.bio,
        distanceKm,
      }));

    const payloadToHash = JSON.stringify({
      tours: projectedTours,
      guides: projectedGuides,
    });
    const hash = createHash("sha256").update(payloadToHash).digest("hex");

    return {
      knowledgeVersion: `sha256:${hash}`,
      metadata: {
        totalTours: projectedTours.length,
        totalGuides: projectedGuides.length,
        destination: query.destination,
        query: query.query,
        ...(query.hotelId && { hotelId: query.hotelId }),
        ...(hotel && {
          locationScope: {
            hotelName: hotel.name,
            area: hotel.area,
            province: hotel.province,
            radiusKm,
            mode: query.destination
              ? "EXPLICIT_DESTINATION"
              : useHotelRadius
                ? "RADIUS"
                : "ADMINISTRATIVE_FALLBACK",
          },
        }),
        ...(query.provinceCode && { provinceCode: query.provinceCode }),
        ...(query.scope && { scope: query.scope }),
      },
      tours: projectedTours,
      guides: projectedGuides,
    };
  }

  private coordinatesOf(latitude: unknown, longitude: unknown) {
    if (latitude == null || longitude == null) return null;
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    return Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude)
      ? { latitude: parsedLatitude, longitude: parsedLongitude }
      : null;
  }

  private createGeographicBounds(latitude: number, longitude: number, radiusKm: number) {
    const latitudeDelta = radiusKm / 111.32;
    const longitudeDelta = Math.min(
      180,
      radiusKm / Math.max(111.32 * Math.cos((latitude * Math.PI) / 180), 0.01),
    );
    return {
      minLatitude: Math.max(-90, latitude - latitudeDelta),
      maxLatitude: Math.min(90, latitude + latitudeDelta),
      minLongitude: Math.max(-180, longitude - longitudeDelta),
      maxLongitude: Math.min(180, longitude + longitudeDelta),
    };
  }

  private distanceKm(
    origin: { latitude: number; longitude: number } | null,
    latitude: unknown,
    longitude: unknown,
  ): number | null {
    if (!origin) return null;
    const destination = this.coordinatesOf(latitude, longitude);
    if (!destination) return null;
    return Number(
      (
        calculateHaversineDistanceMeters(
          origin.latitude,
          origin.longitude,
          destination.latitude,
          destination.longitude,
        ) / 1000
      ).toFixed(1),
    );
  }

  private compareDistance(left: number | null, right: number | null): number {
    return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER);
  }

  private calculateTourLocationScore(
    tour: {
      destination: string;
      title: string;
      provinceCode?: string | null;
      tourScope?: string | null;
    },
    hotel: { provinceCode?: string | null; area?: string | null; province?: string | null },
  ): number {
    let score = 0;
    const tourDestLower = (tour.destination || "").toLowerCase();
    const tourTitleLower = (tour.title || "").toLowerCase();
    const hotelAreaLower = (hotel.area || "").toLowerCase();

    const matchesArea =
      hotelAreaLower.length > 0 &&
      (tourDestLower.includes(hotelAreaLower) || tourTitleLower.includes(hotelAreaLower));

    const matchesProvince =
      Boolean(hotel.provinceCode) &&
      (tour.provinceCode === hotel.provinceCode ||
        tourDestLower.includes((hotel.province || "").toLowerCase()) ||
        tourTitleLower.includes((hotel.province || "").toLowerCase()));

    // 1. Same area / LOCAL in same province -> Tier 1 (300 - 450)
    if (matchesProvince && (matchesArea || tour.tourScope === "LOCAL")) {
      score += 300;
      if (matchesArea) score += 100;
      if (tour.tourScope === "LOCAL") score += 50;
      return score;
    }

    // 2. Same province & REGIONAL_DAYTRIP -> Tier 2 (200 - 250)
    if (matchesProvince) {
      score += 200;
      if (tour.tourScope === "REGIONAL_DAYTRIP") score += 50;
      return score;
    }

    // 3. INTERPROVINCIAL -> Tier 3 (100 - 150)
    if (tour.tourScope === "INTERPROVINCIAL") {
      score += 100;
      if (matchesArea || matchesProvince) score += 50;
      return score;
    }

    return score;
  }

  private sanitizeKnowledgeContent(content: string): string {
    return content
      .replace(/(?<!\d)(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/g, "[REDACTED_PHONE]")
      .replace(/\b\d{9,12}\b/g, "[REDACTED_ID]");
  }
}
