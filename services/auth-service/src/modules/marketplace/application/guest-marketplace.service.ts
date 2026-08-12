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
        serviceTenants: {
          some: {
            status: MarketplaceRecordStatus.ACTIVE,
            categoryId: { not: null },
            tenant: {
              type: "SERVICE",
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
        ...(query.serviceTenantId ? { serviceTenantId: query.serviceTenantId } : {}),
        serviceTenant: {
          type: "SERVICE",
          serviceProfile: {
            status: MarketplaceRecordStatus.ACTIVE,
            categoryId: query.categoryId ?? { not: null },
            category: { isActive: true },
          },
          hotelServiceLinks: { some: { hotelId, status: "ACTIVE" } },
        },
      },
      include: {
        translations: { select: { locale: true, name: true, description: true } },
        serviceTenant: {
          select: {
            id: true,
            serviceProfile: {
              include: {
                category: { include: { translations: { select: { locale: true, name: true } } } },
              },
            },
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
      .map((row) => {
        const localized = this.localizeServiceItem(row, locale);
        return {
          ...localized,
          category: this.localizeCategory(row.serviceTenant.serviceProfile!.category!, locale),
          distanceMeters: this.distance(hotel, row.serviceTenant.serviceProfile),
        };
      })
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
    const translation = category.translations?.find(
      (t) => t.locale === shortLocale || t.locale === locale,
    );
    const name = translation?.name || category.nameVi || category.importKey || category.code;
    return { ...category, name };
  }

  private localizeServiceItem<
    T extends {
      name: string;
      description?: string | null;
      translations?: { locale: string; name: string; description?: string | null }[];
    },
  >(service: T, locale: SupportedLocale): T & { name: string; description?: string | null } {
    const shortLocale = this.toShortLocale(locale);
    const translation = service.translations?.find(
      (t) => t.locale === shortLocale || t.locale === locale,
    );
    const name = translation?.name || service.name;
    const description =
      translation && translation.description !== undefined && translation.description !== null
        ? translation.description
        : (service.description ?? null);
    return { ...service, name, description };
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
