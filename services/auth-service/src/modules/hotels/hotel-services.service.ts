import { Injectable, NotFoundException } from "@nestjs/common";
import { CategoryPriceUpdateMode, Prisma, ServiceCatalogStatus } from "@prisma/client";
import { HotelAccessService } from "./hotel-access.service";
import { HotelServiceCatalogRepository } from "./repositories/hotel-service-catalog.repository";
import type { ServiceItemRow } from "./repositories/hotel-repository.types";
import type {
  CreateServiceCategoryBodyInput,
  CreateServiceItemBodyInput,
  ListServiceCategoriesQueryInput,
  ListServiceItemsQueryInput,
  UpdateServiceCategoryBodyInput,
  UpdateServiceItemBodyInput,
} from "./schemas/service-catalog.schema";

@Injectable()
export class HotelServicesService {
  constructor(
    private readonly hotelServiceCatalogRepository: HotelServiceCatalogRepository,
    private readonly hotelAccessService: HotelAccessService,
  ) {}
  async listServiceCategories(
    actorUserId: string,
    hotelId: string,
    query: ListServiceCategoriesQueryInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.HotelServiceCategoryWhereInput = {
      hotelId,
      ...(query.status ? { status: query.status } : {}),
    };

    const q = query.q?.trim();
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    const [total, rows] = await this.hotelServiceCatalogRepository.listServiceCategories(
      where,
      (page - 1) * limit,
      limit,
    );

    const items = await Promise.all(rows.map((row) => this.toServiceCategoryData(row)));
    return { page, limit, total, items };
  }

  async createServiceCategory(
    actorUserId: string,
    hotelId: string,
    dto: CreateServiceCategoryBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);

    const category = await this.hotelServiceCatalogRepository.createServiceCategory({
      hotelId,
      tenantId: hotel.tenantId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      defaultPrice: dto.defaultPrice,
      currency: dto.currency?.trim().toUpperCase(),
      sortOrder: dto.sortOrder,
      status: dto.status,
      translations: dto.translations,
    });

    if (dto.id_group !== undefined) {
      await this.hotelServiceCatalogRepository.syncServiceCategoryTelegramGroup({
        hotelId,
        serviceCategoryId: category.id,
        telegramChatId: dto.id_group,
      });
    }

    return this.toServiceCategoryData(category);
  }

  async updateServiceCategory(
    actorUserId: string,
    hotelId: string,
    categoryId: string,
    dto: UpdateServiceCategoryBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertServiceCategoryInHotel(hotelId, categoryId);

    const priceUpdateMode = dto.priceUpdateMode ?? CategoryPriceUpdateMode.CATEGORY_ONLY;

    const category = await this.hotelServiceCatalogRepository.updateServiceCategory({
      hotelId,
      tenantId: hotel.tenantId,
      categoryId,
      data: {
        name: dto.name?.trim(),
        description: dto.description === null ? null : dto.description?.trim(),
        defaultPrice: dto.defaultPrice,
        currency: dto.currency?.trim().toUpperCase(),
        sortOrder: dto.sortOrder,
        status: dto.status,
      },
      translations: dto.translations,
      overrideAllItems: priceUpdateMode === CategoryPriceUpdateMode.OVERRIDE_ALL_ITEMS,
      overridePrice: dto.defaultPrice,
    });

    if (dto.id_group !== undefined) {
      await this.hotelServiceCatalogRepository.syncServiceCategoryTelegramGroup({
        hotelId,
        serviceCategoryId: category.id,
        telegramChatId: dto.id_group,
      });
    }

    return this.toServiceCategoryData(category);
  }

  async listServiceItems(actorUserId: string, hotelId: string, query: ListServiceItemsQueryInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.HotelServiceItemWhereInput = {
      hotelId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const q = query.q?.trim();
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    const [total, rows] = await this.hotelServiceCatalogRepository.listServiceItems(
      where,
      (page - 1) * limit,
      limit,
    );

    return { page, limit, total, items: rows.map((row) => this.toServiceItemData(row)) };
  }

  async createServiceItem(actorUserId: string, hotelId: string, dto: CreateServiceItemBodyInput) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertServiceCategoryInHotel(hotelId, dto.categoryId);

    const item = await this.hotelServiceCatalogRepository.createServiceItem({
      hotelId,
      tenantId: hotel.tenantId,
      categoryId: dto.categoryId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      priceOverride: dto.priceOverride,
      quantityEnabled: dto.quantityEnabled,
      minQuantity: dto.minQuantity,
      maxQuantity: dto.maxQuantity,
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      sortOrder: dto.sortOrder,
      status: dto.status,
      translations: dto.translations,
    });

    return this.toServiceItemData(item);
  }

  async updateServiceItem(
    actorUserId: string,
    hotelId: string,
    itemId: string,
    dto: UpdateServiceItemBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    await this.assertServiceItemInHotel(hotelId, itemId);

    if (dto.categoryId) {
      await this.assertServiceCategoryInHotel(hotelId, dto.categoryId);
    }

    const item = await this.hotelServiceCatalogRepository.updateServiceItem({
      hotelId,
      tenantId: hotel.tenantId,
      itemId,
      data: {
        categoryId: dto.categoryId,
        name: dto.name?.trim(),
        description: dto.description === null ? null : dto.description?.trim(),
        priceOverride: dto.priceOverride,
        quantityEnabled: dto.quantityEnabled,
        minQuantity: dto.minQuantity,
        maxQuantity: dto.maxQuantity,
        metadata:
          dto.metadata === null
            ? Prisma.JsonNull
            : (dto.metadata as Prisma.InputJsonValue | undefined),
        sortOrder: dto.sortOrder,
        status: dto.status,
      },
      translations: dto.translations,
    });

    return this.toServiceItemData(item);
  }

  private async assertServiceCategoryInHotel(hotelId: string, categoryId: string) {
    const category = await this.hotelServiceCatalogRepository.findServiceCategoryInHotel(
      hotelId,
      categoryId,
    );
    if (!category) {
      throw new NotFoundException("Không tìm thấy danh mục dịch vụ");
    }

    return category;
  }

  private async assertServiceItemInHotel(hotelId: string, itemId: string) {
    const item = await this.hotelServiceCatalogRepository.findServiceItemInHotel(hotelId, itemId);
    if (!item) {
      throw new NotFoundException("Không tìm thấy dịch vụ");
    }

    return item;
  }

  private async toServiceCategoryData(row: {
    id: string;
    hotelId: string;
    name: string;
    description: string | null;
    defaultPrice: Prisma.Decimal;
    currency: string;
    sortOrder: number;
    status: ServiceCatalogStatus;
    createdAt: Date;
    updatedAt: Date;
    translations?: Array<{ locale: string; name: string; description: string | null }>;
  }) {
    const idGroup = await this.hotelServiceCatalogRepository.getServiceCategoryTelegramGroup(
      row.hotelId,
      row.id,
    );

    return {
      id: row.id,
      hotelId: row.hotelId,
      name: row.name,
      description: row.description,
      id_group: idGroup,
      defaultPrice: row.defaultPrice,
      currency: row.currency,
      sortOrder: row.sortOrder,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      translations: this.toTranslationsObject(row.translations),
    };
  }

  private toServiceItemData(row: ServiceItemRow) {
    return {
      id: row.id,
      hotelId: row.hotelId,
      categoryId: row.categoryId,
      name: row.name,
      description: row.description,
      priceOverride: row.priceOverride,
      effectivePrice: row.priceOverride ?? row.category.defaultPrice,
      effectiveCurrency: row.category.currency,
      quantityEnabled: row.quantityEnabled,
      minQuantity: row.minQuantity,
      maxQuantity: row.maxQuantity,
      metadata: row.metadata,
      sortOrder: row.sortOrder,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      translations: this.toTranslationsObject(row.translations),
      category: {
        ...row.category,
        translations: this.toTranslationsObject(row.category.translations),
      },
    };
  }

  private toTranslationsObject(
    translations?: Array<{ locale: string; name: string; description: string | null }>,
  ) {
    return Object.fromEntries(
      (translations ?? []).map((translation) => [
        translation.locale,
        { name: translation.name, description: translation.description },
      ]),
    );
  }
}
