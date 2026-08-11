import { Injectable, NotFoundException } from "@nestjs/common";
import { MarketplaceRecordStatus } from "@prisma/client";
import { calculateHaversineDistanceMeters } from "../../../common/geo-distance";
import { PrismaService } from "../../../prisma/prisma.service";
import type { SupportedLocale } from "../../../common/i18n/i18n.types";
import type { GuestMarketplaceQuery } from "../domain/guest-marketplace.schema";

@Injectable()
export class GuestMarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  async categories(hotelId: string, locale: SupportedLocale) {
    const rows = await this.prisma.marketplaceCategory.findMany({
      where: {
        isActive: true,
        services: {
          some: {
            status: MarketplaceRecordStatus.ACTIVE,
            serviceTenant: {
              serviceProfile: { status: MarketplaceRecordStatus.ACTIVE },
              hotelServiceLinks: { some: { hotelId, status: "ACTIVE" } },
            },
          },
        },
      },
      include: { translations: { select: { locale: true, name: true } } },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    return rows.map((row) => this.localizeCategory(row, locale));
  }

  async services(hotelId: string, query: GuestMarketplaceQuery, locale: SupportedLocale) {
    const hotel = await this.hotelLocation(hotelId);
    // ponytail: bounded in-memory geo sort; move to PostGIS only after >100 mapped active items/hotel is measured.
    const rows = await this.prisma.marketplaceService.findMany({
      where: {
        status: MarketplaceRecordStatus.ACTIVE,
        category: { isActive: true },
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.serviceTenantId ? { serviceTenantId: query.serviceTenantId } : {}),
        serviceTenant: {
          type: "SERVICE",
          serviceProfile: { status: MarketplaceRecordStatus.ACTIVE },
          hotelServiceLinks: { some: { hotelId, status: "ACTIVE" } },
        },
      },
      include: {
        category: {
          include: { translations: { select: { locale: true, name: true } } },
        },
        serviceTenant: {
          select: {
            id: true,
            serviceProfile: true,
            hotelServiceLinks: {
              where: { hotelId, status: "ACTIVE" },
              select: { sortOrder: true },
              take: 1,
            },
          },
        },
      },
      take: 100,
    });
    const sorted = rows
      .map((row) => ({
        ...row,
        category: this.localizeCategory(row.category, locale),
        distanceMeters: this.distance(hotel, row.serviceTenant.serviceProfile),
      }))
      .sort(
        (left, right) =>
          (left.serviceTenant.hotelServiceLinks[0]?.sortOrder ?? 0) -
            (right.serviceTenant.hotelServiceLinks[0]?.sortOrder ?? 0) ||
          (left.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
            (right.distanceMeters ?? Number.MAX_SAFE_INTEGER) ||
          left.id.localeCompare(right.id),
      );
    const start = (query.page - 1) * query.limit;
    return {
      page: query.page,
      limit: query.limit,
      total: sorted.length,
      items: sorted.slice(start, start + query.limit),
    };
  }

  async detail(hotelId: string, serviceId: string, locale: SupportedLocale) {
    const result = await this.services(hotelId, { page: 1, limit: 100 }, locale);
    const item = result.items.find((service) => service.id === serviceId);
    if (!item) throw new NotFoundException("Không tìm thấy dịch vụ Marketplace");
    return item;
  }

  /**
   * Resolve localized category name.
   * Fallback: requested locale translation → nameVi → importKey → code.
   */
  private localizeCategory<
    T extends {
      nameVi: string;
      importKey?: string | null;
      code: string;
      translations?: { locale: string; name: string }[];
    },
  >(category: T, locale: SupportedLocale): T & { name: string } {
    const shortLocale = this.toShortLocale(locale);
    const translation = category.translations?.find((t) => t.locale === shortLocale);
    const name = translation?.name || category.nameVi || category.importKey || category.code;
    return { ...category, name };
  }

  /** Convert SupportedLocale to short DB locale (vi-VN → vi, en → en, etc.) */
  private toShortLocale(locale: SupportedLocale): string {
    if (locale === "vi-VN") return "vi";
    return locale;
  }

  private hotelLocation(hotelId: string) {
    return this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { latitude: true, longitude: true },
    });
  }

  private distance(
    hotel: { latitude: unknown; longitude: unknown },
    profile: { latitude: unknown; longitude: unknown } | null,
  ) {
    if (
      hotel.latitude == null ||
      hotel.longitude == null ||
      profile?.latitude == null ||
      profile.longitude == null
    )
      return null;
    return calculateHaversineDistanceMeters(
      Number(hotel.latitude),
      Number(hotel.longitude),
      Number(profile.latitude),
      Number(profile.longitude),
    );
  }
}
