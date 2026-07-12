import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma, ServiceCatalogStatus } from "@prisma/client";
import {
  ImportAdapter,
  ImportCommitInput,
  ImportCommitResult,
  ImportContext,
  ImportDiffEntry,
  ImportValidationIssue,
  ImportWorkbookSchema,
  ParsedImportWorkbook,
} from "../../../../common/import/import.types";
import { ImportRegistry } from "../../../../common/import/import.registry";
import { PrismaService } from "../../../../prisma/prisma.service";
import { HotelAccessService } from "../../application/hotel-access.service";

const IMPORT_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,119}$/;
const TRANSLATION_COLUMNS = [
  { columnSuffix: "en", locale: "en", label: "Tiếng Anh" },
  { columnSuffix: "zh", locale: "zh", label: "Tiếng Trung" },
  { columnSuffix: "ko", locale: "ko", label: "Tiếng Hàn" },
  { columnSuffix: "ru", locale: "ru", label: "Tiếng Nga" },
  { columnSuffix: "hi", locale: "hi", label: "Tiếng Ấn Độ" },
] as const;

type TranslationLocale = (typeof TRANSLATION_COLUMNS)[number]["locale"];

type TranslationInput = Partial<
  Record<
    TranslationLocale,
    {
      name?: string;
      description?: string | null;
    }
  >
>;

interface ParsedServiceCatalogCategory {
  rowNumber: number;
  importKey: string;
  name: string;
  description?: string | null;
  defaultPrice: number;
  currency: string;
  sortOrder: number;
  status: ServiceCatalogStatus;
  translations: TranslationInput;
}

interface ParsedServiceCatalogItem {
  rowNumber: number;
  importKey: string;
  categoryKey: string;
  name: string;
  description?: string | null;
  priceOverride?: number | null;
  quantityEnabled: boolean;
  minQuantity: number;
  maxQuantity?: number | null;
  sortOrder: number;
  status: ServiceCatalogStatus;
  translations: TranslationInput;
}

export interface ServiceCatalogImportPayload {
  categories: ParsedServiceCatalogCategory[];
  items: ParsedServiceCatalogItem[];
}

type ServiceCatalogImportState = {
  categories: Array<{
    id: string;
    importKey: string | null;
    name: string;
    description: string | null;
    defaultPrice: Prisma.Decimal;
    currency: string;
    sortOrder: number;
    status: ServiceCatalogStatus;
    translations: Array<{ locale: string; name: string; description: string | null }>;
  }>;
  items: Array<{
    id: string;
    importKey: string | null;
    categoryId: string;
    category: { importKey: string | null };
    name: string;
    description: string | null;
    priceOverride: Prisma.Decimal | null;
    quantityEnabled: boolean;
    minQuantity: number;
    maxQuantity: number | null;
    sortOrder: number;
    status: ServiceCatalogStatus;
    translations: Array<{ locale: string; name: string; description: string | null }>;
  }>;
};

@Injectable()
export class ServiceCatalogImportAdapter
  implements ImportAdapter<ServiceCatalogImportPayload, ServiceCatalogImportState>, OnModuleInit
{
  readonly type = "service-catalog";
  readonly supportedModes = ["upsert"] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hotelAccessService: HotelAccessService,
    private readonly importRegistry: ImportRegistry,
  ) {}

  onModuleInit(): void {
    this.importRegistry.register(this);
  }

  getSchema(): ImportWorkbookSchema {
    return {
      sheets: [
        {
          name: "categories",
          required: true,
          columns: [
            {
              key: "category_key",
              header: "Mã danh mục",
              required: true,
              type: "string",
              example: "room_service",
            },
            {
              key: "name_vi",
              header: "Tên danh mục (Tiếng Việt)",
              required: true,
              type: "string",
              maxLength: 120,
            },
            { key: "description_vi", header: "Mô tả (Tiếng Việt)", type: "string", maxLength: 500 },
            {
              key: "default_price",
              header: "Giá mặc định",
              required: true,
              type: "number",
              min: 0,
              defaultValue: 0,
            },
            {
              key: "currency",
              header: "Đơn vị tiền tệ",
              type: "string",
              maxLength: 3,
              defaultValue: "VND",
            },
            {
              key: "sort_order",
              header: "Thứ tự hiển thị",
              type: "number",
              min: 0,
              defaultValue: 0,
            },
            {
              key: "status",
              header: "Trạng thái",
              type: "enum",
              enumValues: Object.values(ServiceCatalogStatus),
              defaultValue: ServiceCatalogStatus.ACTIVE,
            },
            ...this.translationColumns("category"),
          ],
        },
        {
          name: "items",
          required: true,
          columns: [
            {
              key: "item_key",
              header: "Mã dịch vụ",
              required: true,
              type: "string",
              example: "extra_towels",
            },
            {
              key: "category_key",
              header: "Mã danh mục",
              required: true,
              type: "string",
              example: "room_service",
            },
            {
              key: "name_vi",
              header: "Tên dịch vụ (Tiếng Việt)",
              required: true,
              type: "string",
              maxLength: 160,
            },
            {
              key: "description_vi",
              header: "Mô tả (Tiếng Việt)",
              type: "string",
              maxLength: 1000,
            },
            {
              key: "price_override",
              header: "Giá riêng - để trống nếu dùng giá mặc định của danh mục",
              type: "number",
              min: 0,
            },
            {
              key: "quantity_enabled",
              header: "Cho phép nhập số lượng - TRUE/FALSE hoặc Có/Không",
              type: "boolean",
              defaultValue: false,
            },
            {
              key: "min_quantity",
              header: "Số lượng tối thiểu",
              type: "number",
              min: 1,
              defaultValue: 1,
            },
            { key: "max_quantity", header: "Số lượng tối đa", type: "number", min: 1 },
            {
              key: "sort_order",
              header: "Thứ tự hiển thị",
              type: "number",
              min: 0,
              defaultValue: 0,
            },
            {
              key: "status",
              header: "Trạng thái",
              type: "enum",
              enumValues: Object.values(ServiceCatalogStatus),
              defaultValue: ServiceCatalogStatus.ACTIVE,
            },
            ...this.translationColumns("item"),
          ],
        },
      ],
    };
  }

  async authorize(context: ImportContext): Promise<void> {
    if (!context.hotelId || !context.actorUserId) {
      throw new Error("service-catalog import requires hotelId and actorUserId");
    }

    if (context.systemSync === true) {
      return;
    }

    await this.hotelAccessService.assertHotelAccess(context.actorUserId, context.hotelId);
  }

  parse(workbook: ParsedImportWorkbook): ServiceCatalogImportPayload {
    const categories = workbook.sheets.find((sheet) => sheet.name === "categories")?.rows ?? [];
    const items = workbook.sheets.find((sheet) => sheet.name === "items")?.rows ?? [];

    return {
      categories: categories.map((row) => ({
        rowNumber: row.rowNumber,
        importKey: this.text(row.values.category_key),
        name: this.text(row.values.name_vi),
        description: this.optionalText(row.values.description_vi),
        defaultPrice: this.number(row.values.default_price, 0),
        currency: (this.optionalText(row.values.currency) ?? "VND").toUpperCase(),
        sortOrder: this.number(row.values.sort_order, 0),
        status: this.enumValue(
          row.values.status,
          ServiceCatalogStatus.ACTIVE,
        ) as ServiceCatalogStatus,
        translations: this.readTranslations(row.values),
      })),
      items: items.map((row) => ({
        rowNumber: row.rowNumber,
        importKey: this.text(row.values.item_key),
        categoryKey: this.text(row.values.category_key),
        name: this.text(row.values.name_vi),
        description: this.optionalText(row.values.description_vi),
        priceOverride: this.optionalNumber(row.values.price_override),
        quantityEnabled: this.boolean(row.values.quantity_enabled, false),
        minQuantity: this.number(row.values.min_quantity, 1),
        maxQuantity: this.optionalNumber(row.values.max_quantity),
        sortOrder: this.number(row.values.sort_order, 0),
        status: this.enumValue(
          row.values.status,
          ServiceCatalogStatus.ACTIVE,
        ) as ServiceCatalogStatus,
        translations: this.readTranslations(row.values),
      })),
    };
  }

  validate(payload: ServiceCatalogImportPayload): ImportValidationIssue[] {
    const issues: ImportValidationIssue[] = [];
    const categoryKeys = new Set<string>();
    const itemKeys = new Set<string>();

    for (const category of payload.categories) {
      this.validateKey(
        category.importKey,
        "categories",
        category.rowNumber,
        "category_key",
        issues,
      );
      if (categoryKeys.has(category.importKey)) {
        issues.push(
          this.error(
            "categories",
            category.rowNumber,
            "category_key",
            "DUPLICATE_CATEGORY_KEY",
            "Duplicate category_key",
          ),
        );
      }
      categoryKeys.add(category.importKey);
    }

    for (const item of payload.items) {
      this.validateKey(item.importKey, "items", item.rowNumber, "item_key", issues);
      if (itemKeys.has(item.importKey)) {
        issues.push(
          this.error(
            "items",
            item.rowNumber,
            "item_key",
            "DUPLICATE_ITEM_KEY",
            "Duplicate item_key",
          ),
        );
      }
      itemKeys.add(item.importKey);

      if (!categoryKeys.has(item.categoryKey)) {
        issues.push(
          this.error(
            "items",
            item.rowNumber,
            "category_key",
            "CATEGORY_KEY_NOT_FOUND",
            "category_key is not present in categories sheet",
          ),
        );
      }
      if (item.maxQuantity != null && item.maxQuantity < item.minQuantity) {
        issues.push(
          this.error(
            "items",
            item.rowNumber,
            "max_quantity",
            "MAX_QUANTITY_LT_MIN_QUANTITY",
            "max_quantity must be greater than or equal to min_quantity",
          ),
        );
      }
    }

    return issues;
  }

  async loadCurrentState(context: ImportContext): Promise<ServiceCatalogImportState> {
    const hotelId = String(context.hotelId);
    const [categories, items] = await Promise.all([
      this.prisma.hotelServiceCategory.findMany({
        where: { hotelId, importKey: { not: null } },
        include: { translations: true },
      }),
      this.prisma.hotelServiceItem.findMany({
        where: { hotelId, importKey: { not: null } },
        include: { translations: true, category: { select: { importKey: true } } },
      }),
    ]);

    return { categories, items };
  }

  diff(payload: ServiceCatalogImportPayload, state: ServiceCatalogImportState): ImportDiffEntry[] {
    const categoryByKey = new Map(
      state.categories.map((category) => [category.importKey, category]),
    );
    const itemByKey = new Map(state.items.map((item) => [item.importKey, item]));

    return [
      ...payload.categories.map((category) =>
        this.diffCategory(category, categoryByKey.get(category.importKey)),
      ),
      ...payload.items.map((item) => this.diffItem(item, itemByKey.get(item.importKey))),
    ];
  }

  async commit(
    input: ImportCommitInput<ServiceCatalogImportPayload, ServiceCatalogImportState>,
  ): Promise<ImportCommitResult> {
    const hotelId = String(input.context.hotelId);
    const hotel = await input.tx.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { tenantId: true },
    });
    const categoryIdsByKey = new Map<string, string>();

    for (const category of input.payload.categories) {
      const saved = await input.tx.hotelServiceCategory.upsert({
        where: { hotelId_importKey: { hotelId, importKey: category.importKey } },
        create: {
          hotelId,
          importKey: category.importKey,
          name: category.name,
          description: category.description,
          defaultPrice: category.defaultPrice,
          currency: category.currency,
          sortOrder: category.sortOrder,
          status: category.status,
        },
        update: {
          name: category.name,
          description: category.description,
          defaultPrice: category.defaultPrice,
          currency: category.currency,
          sortOrder: category.sortOrder,
          status: category.status,
        },
      });
      categoryIdsByKey.set(category.importKey, saved.id);
      await this.upsertCategoryTranslations(input.tx, saved.id, category.translations);
    }

    for (const item of input.payload.items) {
      const categoryId = categoryIdsByKey.get(item.categoryKey);
      if (!categoryId) continue;
      const saved = await input.tx.hotelServiceItem.upsert({
        where: { hotelId_importKey: { hotelId, importKey: item.importKey } },
        create: {
          hotelId,
          categoryId,
          importKey: item.importKey,
          name: item.name,
          description: item.description,
          priceOverride: item.priceOverride,
          quantityEnabled: item.quantityEnabled,
          minQuantity: item.minQuantity,
          maxQuantity: item.maxQuantity,
          sortOrder: item.sortOrder,
          status: item.status,
        },
        update: {
          categoryId,
          name: item.name,
          description: item.description,
          priceOverride: item.priceOverride,
          quantityEnabled: item.quantityEnabled,
          minQuantity: item.minQuantity,
          maxQuantity: item.maxQuantity,
          sortOrder: item.sortOrder,
          status: item.status,
        },
      });
      await this.upsertItemTranslations(input.tx, saved.id, item.translations);
    }

    const summary = this.summarize(input.diff);
    return {
      summary,
      domainEvents: [
        {
          eventType: "SERVICE_CATALOG_IMPORTED",
          payload: { hotelId, tenantId: hotel.tenantId, mode: input.mode, summary },
        },
      ],
    };
  }

  private summarize(diff: ImportDiffEntry[]) {
    const byEntityType: Record<
      string,
      { create: number; update: number; disable: number; unchanged: number }
    > = {};
    const summary = { create: 0, update: 0, disable: 0, unchanged: 0 };
    for (const entry of diff) {
      byEntityType[entry.entityType] ??= { create: 0, update: 0, disable: 0, unchanged: 0 };
      byEntityType[entry.entityType][entry.action] += 1;
      summary[entry.action] += 1;
    }
    return { ...summary, errors: 0, warnings: 0, totalEntities: diff.length, byEntityType };
  }

  private diffCategory(
    category: ParsedServiceCatalogCategory,
    existing: ServiceCatalogImportState["categories"][number] | undefined,
  ): ImportDiffEntry {
    const changes = existing
      ? this.diffFields({
          name: [existing.name, category.name],
          description: [existing.description, category.description ?? null],
          defaultPrice: [Number(existing.defaultPrice), category.defaultPrice],
          currency: [existing.currency, category.currency],
          sortOrder: [existing.sortOrder, category.sortOrder],
          status: [existing.status, category.status],
          ...this.diffTranslations(existing.translations, category.translations),
        })
      : [];
    return {
      entityType: "serviceCategory",
      key: category.importKey,
      action: existing ? (changes.length ? "update" : "unchanged") : "create",
      label: category.name,
      changes,
    };
  }

  private diffItem(
    item: ParsedServiceCatalogItem,
    existing: ServiceCatalogImportState["items"][number] | undefined,
  ): ImportDiffEntry {
    const changes = existing
      ? this.diffFields({
          categoryKey: [existing.category.importKey, item.categoryKey],
          name: [existing.name, item.name],
          description: [existing.description, item.description ?? null],
          priceOverride: [
            existing.priceOverride == null ? null : Number(existing.priceOverride),
            item.priceOverride ?? null,
          ],
          quantityEnabled: [existing.quantityEnabled, item.quantityEnabled],
          minQuantity: [existing.minQuantity, item.minQuantity],
          maxQuantity: [existing.maxQuantity, item.maxQuantity ?? null],
          sortOrder: [existing.sortOrder, item.sortOrder],
          status: [existing.status, item.status],
          ...this.diffTranslations(existing.translations, item.translations),
        })
      : [];
    return {
      entityType: "serviceItem",
      key: item.importKey,
      action: existing ? (changes.length ? "update" : "unchanged") : "create",
      label: item.name,
      changes,
    };
  }

  private diffFields(fields: Record<string, [unknown, unknown]>) {
    return Object.entries(fields)
      .filter(([, [from, to]]) => from !== to)
      .map(([field, [from, to]]) => ({ field, from, to }));
  }

  private diffTranslations(
    existing: Array<{ locale: string; name: string; description: string | null }>,
    next: TranslationInput,
  ) {
    const existingByLocale = new Map(
      existing.map((translation) => [translation.locale, translation]),
    );
    return Object.fromEntries(
      Object.entries(next).flatMap(([locale, value]) => {
        if (!value?.name) return [];
        const current = existingByLocale.get(locale);
        return [
          [`translations.${locale}.name`, [current?.name ?? null, value.name]],
          [
            `translations.${locale}.description`,
            [current?.description ?? null, value.description ?? null],
          ],
        ];
      }),
    );
  }

  private async upsertCategoryTranslations(
    tx: Prisma.TransactionClient,
    categoryId: string,
    translations: TranslationInput,
  ) {
    for (const [locale, value] of Object.entries(translations)) {
      if (!value?.name) continue;
      await tx.hotelServiceCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId, locale } },
        create: { categoryId, locale, name: value.name, description: value.description },
        update: { name: value.name, description: value.description },
      });
    }
  }

  private async upsertItemTranslations(
    tx: Prisma.TransactionClient,
    itemId: string,
    translations: TranslationInput,
  ) {
    for (const [locale, value] of Object.entries(translations)) {
      if (!value?.name) continue;
      await tx.hotelServiceItemTranslation.upsert({
        where: { itemId_locale: { itemId, locale } },
        create: { itemId, locale, name: value.name, description: value.description },
        update: { name: value.name, description: value.description },
      });
    }
  }

  private validateKey(
    key: string,
    sheet: string,
    row: number,
    column: string,
    issues: ImportValidationIssue[],
  ) {
    if (!IMPORT_KEY_PATTERN.test(key)) {
      issues.push(
        this.error(
          sheet,
          row,
          column,
          "INVALID_IMPORT_KEY",
          "Import key must be lowercase slug-like text",
        ),
      );
    }
  }

  private readTranslations(values: Record<string, unknown>): TranslationInput {
    return Object.fromEntries(
      TRANSLATION_COLUMNS.map(({ columnSuffix, locale }) => [
        locale,
        {
          name: this.optionalText(values[`name_${columnSuffix}`]),
          description: this.optionalText(values[`description_${columnSuffix}`]),
        },
      ]).filter(([, value]) => Boolean((value as { name?: string }).name)),
    ) as TranslationInput;
  }

  private translationColumns(kind: "category" | "item") {
    const nameLength = kind === "category" ? 120 : 160;
    const descriptionLength = kind === "category" ? 500 : 1000;
    return TRANSLATION_COLUMNS.flatMap(({ columnSuffix, label }) => [
      {
        key: `name_${columnSuffix}`,
        header: `Tên (${label})`,
        type: "string" as const,
        maxLength: nameLength,
      },
      {
        key: `description_${columnSuffix}`,
        header: `Mô tả (${label})`,
        type: "string" as const,
        maxLength: descriptionLength,
      },
    ]);
  }

  private error(
    sheet: string,
    row: number,
    column: string,
    code: string,
    message: string,
  ): ImportValidationIssue {
    return { severity: "error", sheet, row, column, code, message };
  }

  private text(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value).trim();
    }
    if (value instanceof Date) return value.toISOString().trim();
    return "";
  }

  private optionalText(value: unknown): string | undefined {
    const text = this.text(value);
    return text.length ? text : undefined;
  }

  private number(value: unknown, defaultValue: number): number {
    const parsed = Number(value ?? defaultValue);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  private optionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private boolean(value: unknown, defaultValue: boolean): boolean {
    if (value === undefined || value === null || value === "") return defaultValue;
    if (typeof value === "boolean") return value;
    const text = this.text(value);
    return ["true", "1", "yes", "y"].includes(text.toLowerCase());
  }

  private enumValue(value: unknown, defaultValue: string): string {
    const text = this.optionalText(value);
    return text ?? defaultValue;
  }
}
