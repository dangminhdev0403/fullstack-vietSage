import { Injectable } from "@nestjs/common";
import { DomainEventStatus, Prisma, ServiceCatalogStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { serviceItemInclude, type ServiceCatalogTranslationInput } from "./hotel-repository.types";

@Injectable()
export class HotelServiceCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}
  async listServiceCategories(
    where: Prisma.HotelServiceCategoryWhereInput,
    skip: number,
    take: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.hotelServiceCategory.count({ where });
      const rows = await tx.hotelServiceCategory.findMany({
        where,
        include: { translations: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async getServiceCategoryTelegramGroup(hotelId: string, serviceCategoryId: string) {
    const route = await this.prisma.notificationRoute.findFirst({
      where: { hotelId, serviceCategoryId, isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { telegramChatId: true },
    });

    return route?.telegramChatId ?? null;
  }

  async syncServiceCategoryTelegramGroup(input: {
    hotelId: string;
    serviceCategoryId: string;
    telegramChatId?: string | null;
  }) {
    const telegramChatId = input.telegramChatId?.trim();

    if (!telegramChatId) {
      await this.prisma.notificationRoute.updateMany({
        where: {
          hotelId: input.hotelId,
          serviceCategoryId: input.serviceCategoryId,
          isActive: true,
        },
        data: { isActive: false },
      });
      return;
    }

    const existing = await this.prisma.notificationRoute.findFirst({
      where: { hotelId: input.hotelId, serviceCategoryId: input.serviceCategoryId, isActive: true },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.notificationRoute.update({
        where: { id: existing.id },
        data: { telegramChatId },
      });
      return;
    }

    await this.prisma.notificationRoute.create({
      data: {
        hotelId: input.hotelId,
        serviceCategoryId: input.serviceCategoryId,
        telegramChatId,
        isActive: true,
      },
    });
  }

  async createServiceCategory(input: {
    hotelId: string;
    tenantId: string;
    name: string;
    description?: string;
    defaultPrice: Prisma.Decimal | number;
    currency?: string;
    sortOrder?: number;
    status?: ServiceCatalogStatus;
    translations?: ServiceCatalogTranslationInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.hotelServiceCategory.create({
        data: {
          hotelId: input.hotelId,
          name: input.name,
          description: input.description,
          defaultPrice: input.defaultPrice,
          currency: input.currency ?? "VND",
          sortOrder: input.sortOrder ?? 0,
          status: input.status ?? ServiceCatalogStatus.ACTIVE,
          translations: this.toCategoryTranslationsCreate(input.translations),
        },
        include: { translations: true },
      });

      await this.createDomainEvent(tx, {
        eventType: "SERVICE_CATEGORY_CREATED",
        aggregateType: "HotelServiceCategory",
        aggregateId: category.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { categoryId: category.id },
      });

      return category;
    });
  }

  async findServiceCategoryInHotel(hotelId: string, categoryId: string) {
    return this.prisma.hotelServiceCategory.findFirst({ where: { id: categoryId, hotelId } });
  }

  async updateServiceCategory(input: {
    hotelId: string;
    tenantId: string;
    categoryId: string;
    data: Prisma.HotelServiceCategoryUpdateInput;
    translations?: ServiceCatalogTranslationInput;
    overrideAllItems?: boolean;
    overridePrice?: Prisma.Decimal | number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.hotelServiceCategory.update({
        where: { id: input.categoryId },
        data: input.data,
        include: { translations: true },
      });

      await this.upsertCategoryTranslations(tx, input.categoryId, input.translations);

      if (input.overrideAllItems && input.overridePrice !== undefined) {
        await tx.hotelServiceItem.updateMany({
          where: { hotelId: input.hotelId, categoryId: input.categoryId },
          data: { priceOverride: input.overridePrice },
        });
      }

      await this.createDomainEvent(tx, {
        eventType: "SERVICE_CATEGORY_UPDATED",
        aggregateType: "HotelServiceCategory",
        aggregateId: category.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { categoryId: category.id },
      });

      return category;
    });
  }

  async listServiceItems(where: Prisma.HotelServiceItemWhereInput, skip: number, take: number) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.hotelServiceItem.count({ where });
      const rows = await tx.hotelServiceItem.findMany({
        where,
        include: serviceItemInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async createServiceItem(input: {
    hotelId: string;
    tenantId: string;
    categoryId: string;
    name: string;
    description?: string;
    priceOverride?: Prisma.Decimal | number;
    quantityEnabled?: boolean;
    minQuantity?: number;
    maxQuantity?: number | null;
    metadata?: Prisma.InputJsonValue;
    sortOrder?: number;
    status?: ServiceCatalogStatus;
    translations?: ServiceCatalogTranslationInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.hotelServiceItem.create({
        data: {
          hotelId: input.hotelId,
          categoryId: input.categoryId,
          name: input.name,
          description: input.description,
          priceOverride: input.priceOverride,
          quantityEnabled: input.quantityEnabled ?? false,
          minQuantity: input.minQuantity ?? 1,
          maxQuantity: input.maxQuantity,
          metadata: input.metadata,
          sortOrder: input.sortOrder ?? 0,
          status: input.status ?? ServiceCatalogStatus.ACTIVE,
          translations: this.toItemTranslationsCreate(input.translations),
        },
        include: serviceItemInclude,
      });

      await this.createDomainEvent(tx, {
        eventType: "SERVICE_ITEM_CREATED",
        aggregateType: "HotelServiceItem",
        aggregateId: item.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { itemId: item.id, categoryId: input.categoryId },
      });

      return item;
    });
  }

  async findServiceItemInHotel(hotelId: string, itemId: string) {
    return this.prisma.hotelServiceItem.findFirst({ where: { id: itemId, hotelId } });
  }

  async updateServiceItem(input: {
    hotelId: string;
    tenantId: string;
    itemId: string;
    data: Prisma.HotelServiceItemUncheckedUpdateInput;
    translations?: ServiceCatalogTranslationInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.hotelServiceItem.update({
        where: { id: input.itemId },
        data: input.data,
        include: serviceItemInclude,
      });

      await this.upsertItemTranslations(tx, input.itemId, input.translations);

      await this.createDomainEvent(tx, {
        eventType: "SERVICE_ITEM_UPDATED",
        aggregateType: "HotelServiceItem",
        aggregateId: item.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { itemId: item.id, categoryId: item.categoryId },
      });

      return item;
    });
  }

  private toCategoryTranslationsCreate(translations?: ServiceCatalogTranslationInput) {
    const data = this.toTranslationsCreateData(translations);
    return data.length ? { create: data } : undefined;
  }

  private toItemTranslationsCreate(translations?: ServiceCatalogTranslationInput) {
    const data = this.toTranslationsCreateData(translations);
    return data.length ? { create: data } : undefined;
  }

  private toTranslationsCreateData(translations?: ServiceCatalogTranslationInput) {
    return Object.entries(translations ?? {})
      .filter((entry): entry is [string, { name: string; description?: string | null }] =>
        Boolean(entry[1]),
      )
      .map(([locale, value]) => ({
        locale,
        name: value.name.trim(),
        description: value.description === null ? null : value.description?.trim(),
      }));
  }

  private async upsertCategoryTranslations(
    tx: Prisma.TransactionClient,
    categoryId: string,
    translations?: ServiceCatalogTranslationInput,
  ) {
    for (const [locale, value] of Object.entries(translations ?? {})) {
      if (!value) continue;
      await tx.hotelServiceCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId, locale } },
        create: {
          categoryId,
          locale,
          name: value.name.trim(),
          description: value.description === null ? null : value.description?.trim(),
        },
        update: {
          name: value.name.trim(),
          description: value.description === null ? null : value.description?.trim(),
        },
      });
    }
  }

  private async upsertItemTranslations(
    tx: Prisma.TransactionClient,
    itemId: string,
    translations?: ServiceCatalogTranslationInput,
  ) {
    for (const [locale, value] of Object.entries(translations ?? {})) {
      if (!value) continue;
      await tx.hotelServiceItemTranslation.upsert({
        where: { itemId_locale: { itemId, locale } },
        create: {
          itemId,
          locale,
          name: value.name.trim(),
          description: value.description === null ? null : value.description?.trim(),
        },
        update: {
          name: value.name.trim(),
          description: value.description === null ? null : value.description?.trim(),
        },
      });
    }
  }

  private async createDomainEvent(
    tx: Prisma.TransactionClient,
    input: {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      hotelId?: string;
      tenantId?: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    return tx.domainEvent.create({
      data: {
        ...input,
        status: DomainEventStatus.PENDING,
      },
    });
  }
}
