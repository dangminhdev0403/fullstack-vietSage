import { Injectable, NotFoundException } from "@nestjs/common";
import { MarketplaceRecordStatus, Prisma } from "@prisma/client";
import { calculateHaversineDistanceMeters } from "../../../common/geo-distance";
import { PrismaService } from "../../../prisma/prisma.service";
import type { SupportedLocale } from "../../../common/i18n/i18n.types";
import type {
  AddCartItem,
  GuestMarketplaceQuery,
  SyncCart,
  UpdateCartItem,
} from "../domain/guest-marketplace.schema";
import { calculateOnSiteServiceFee } from "../domain/marketplace-pricing";

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

  async getCart(
    scope: { hotelId: string; stayId: string; sessionId: string },
    locale: SupportedLocale,
  ) {
    const pricingConfig = await this.prisma.marketplacePricingConfig?.findUnique({
      where: { id: "default" },
      select: { deliveryServiceFeeRate: true },
    });
    const cart = await this.prisma.guestCart.upsert({
      where: { sessionId: scope.sessionId },
      create: {
        hotelId: scope.hotelId,
        stayId: scope.stayId,
        sessionId: scope.sessionId,
      },
      update: {
        hotelId: scope.hotelId,
        stayId: scope.stayId,
      },
      include: {
        items: {
          include: {
            service: {
              include: {
                translations: true,
                serviceTenant: {
                  select: {
                    id: true,
                    serviceProfile: {
                      include: {
                        category: {
                          include: { translations: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    let partnerSubtotal = new Prisma.Decimal(0);
    let hotelServiceFeeAmount = new Prisma.Decimal(0);
    let totalItems = 0;

    const items = cart.items.map((item) => {
      const localizedService = this.localizeServiceItem(item.service, locale);
      const itemPartnerSubtotal = item.service.unitPrice.mul(item.quantity);
      const itemFee = calculateOnSiteServiceFee(
        itemPartnerSubtotal,
        item.service.mode,
        item.service.serviceTenant.serviceProfile?.deliveryServiceFeeRate ??
          pricingConfig?.deliveryServiceFeeRate,
      );
      const itemCustomerTotal = itemPartnerSubtotal.add(itemFee);

      partnerSubtotal = partnerSubtotal.add(itemPartnerSubtotal);
      hotelServiceFeeAmount = hotelServiceFeeAmount.add(itemFee);
      totalItems += item.quantity;

      return {
        id: item.id,
        serviceId: item.serviceId,
        quantity: item.quantity,
        guestNote: item.guestNote,
        service: {
          id: localizedService.id,
          name: localizedService.name,
          description: localizedService.description,
          unitPrice: localizedService.unitPrice.toString(),
          pricingUnit: localizedService.pricingUnit,
          currency: localizedService.currency,
          imageUrls: localizedService.imageUrls,
          mode: localizedService.mode,
          waitingMinutes: localizedService.waitingMinutes,
          capacityAvailable: localizedService.capacityAvailable,
          category: localizedService.serviceTenant?.serviceProfile?.category
            ? this.localizeCategory(localizedService.serviceTenant.serviceProfile.category, locale)
            : null,
          serviceTenant: {
            id: localizedService.serviceTenant.id,
            displayName: localizedService.serviceTenant.serviceProfile?.displayName,
          },
        },
        partnerSubtotal: itemPartnerSubtotal.toString(),
        hotelServiceFeeAmount: itemFee.toString(),
        customerTotalAmount: itemCustomerTotal.toString(),
        currency: item.service.currency,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    const customerTotalAmount = partnerSubtotal.add(hotelServiceFeeAmount);
    const currency = cart.items[0]?.service.currency ?? "VND";

    return {
      id: cart.id,
      hotelId: cart.hotelId,
      stayId: cart.stayId,
      sessionId: cart.sessionId,
      totalItems,
      partnerSubtotal: partnerSubtotal.toString(),
      hotelServiceFeeAmount: hotelServiceFeeAmount.toString(),
      hotelServiceFeeRate: Number(pricingConfig?.deliveryServiceFeeRate ?? 10),
      customerTotalAmount: customerTotalAmount.toString(),
      currency,
      items,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }

  async addCartItem(
    scope: { hotelId: string; stayId: string; sessionId: string },
    input: AddCartItem,
    locale: SupportedLocale,
  ) {
    const service = await this.prisma.marketplaceService.findFirst({
      where: {
        id: input.serviceId,
        status: MarketplaceRecordStatus.ACTIVE,
        serviceTenant: {
          type: "SERVICE",
          serviceProfile: {
            status: MarketplaceRecordStatus.ACTIVE,
            categoryId: { not: null },
            category: { isActive: true },
          },
          hotelServiceLinks: { some: { hotelId: scope.hotelId, status: "ACTIVE" } },
        },
      },
    });

    if (!service) {
      throw new NotFoundException("Không tìm thấy dịch vụ Marketplace khả dụng");
    }

    const cart = await this.prisma.guestCart.upsert({
      where: { sessionId: scope.sessionId },
      create: {
        hotelId: scope.hotelId,
        stayId: scope.stayId,
        sessionId: scope.sessionId,
      },
      update: {
        hotelId: scope.hotelId,
        stayId: scope.stayId,
      },
    });

    await this.prisma.guestCartItem.upsert({
      where: {
        cartId_serviceId: { cartId: cart.id, serviceId: service.id },
      },
      create: {
        cartId: cart.id,
        serviceId: service.id,
        quantity: input.quantity,
        guestNote: input.guestNote,
      },
      update: {
        quantity: { increment: input.quantity },
        guestNote: input.guestNote ?? undefined,
      },
    });

    return this.getCart(scope, locale);
  }

  async updateCartItem(
    scope: { hotelId: string; stayId: string; sessionId: string },
    itemId: string,
    input: UpdateCartItem,
    locale: SupportedLocale,
  ) {
    const cart = await this.prisma.guestCart.findUnique({
      where: { sessionId: scope.sessionId },
    });
    if (!cart) throw new NotFoundException("Không tìm thấy giỏ hàng");

    const item = await this.prisma.guestCartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) throw new NotFoundException("Không tìm thấy mục trong giỏ hàng");

    if (input.quantity <= 0) {
      await this.prisma.guestCartItem.delete({
        where: { id: item.id },
      });
    } else {
      await this.prisma.guestCartItem.update({
        where: { id: item.id },
        data: {
          quantity: input.quantity,
          guestNote: input.guestNote,
        },
      });
    }

    return this.getCart(scope, locale);
  }

  async removeCartItem(
    scope: { hotelId: string; stayId: string; sessionId: string },
    itemId: string,
    locale: SupportedLocale,
  ) {
    const cart = await this.prisma.guestCart.findUnique({
      where: { sessionId: scope.sessionId },
    });
    if (!cart) throw new NotFoundException("Không tìm thấy giỏ hàng");

    const item = await this.prisma.guestCartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) throw new NotFoundException("Không tìm thấy mục trong giỏ hàng");

    await this.prisma.guestCartItem.delete({
      where: { id: item.id },
    });

    return this.getCart(scope, locale);
  }

  async clearCart(scope: { hotelId: string; stayId: string; sessionId: string }) {
    const cart = await this.prisma.guestCart.findUnique({
      where: { sessionId: scope.sessionId },
    });
    if (cart) {
      await this.prisma.guestCartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }
    return { success: true, cleared: true };
  }

  async syncCart(scope: { hotelId: string; stayId: string; sessionId: string }, input: SyncCart, locale: SupportedLocale) {
    await this.prisma.$transaction(async (tx) => {
      const serviceIds = input.items.map(({ serviceId }) => serviceId);
      const services = await tx.marketplaceService.findMany({
        where: {
          id: { in: serviceIds }, status: MarketplaceRecordStatus.ACTIVE,
          serviceTenant: { type: "SERVICE", serviceProfile: { status: MarketplaceRecordStatus.ACTIVE, categoryId: { not: null }, category: { isActive: true } }, hotelServiceLinks: { some: { hotelId: scope.hotelId, status: "ACTIVE" } } },
        },
        select: { id: true },
      });
      if (services.length !== new Set(serviceIds).size) throw new NotFoundException("Có dịch vụ Marketplace không còn khả dụng");
      const cart = await tx.guestCart.upsert({ where: { sessionId: scope.sessionId }, create: scope, update: { hotelId: scope.hotelId, stayId: scope.stayId } });
      await tx.guestCartItem.deleteMany({ where: { cartId: cart.id } });
      if (input.items.length) await tx.guestCartItem.createMany({ data: input.items.map((item) => ({ cartId: cart.id, ...item })) });
    });
    return this.getCart(scope, locale);
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
