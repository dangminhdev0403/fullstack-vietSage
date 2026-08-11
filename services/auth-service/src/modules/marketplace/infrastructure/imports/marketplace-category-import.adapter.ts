import { Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import {
  ImportAdapter,
  ImportCommitInput,
  ImportCommitResult,
  ImportContext,
  ImportDiffEntry,
  ImportFieldChange,
  ImportMode,
  ImportValidationIssue,
  ImportWorkbookSchema,
  ParsedImportWorkbook,
} from "../../../../common/import/import.types";
import { ImportRegistry } from "../../../../common/import/import.registry";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CodesService } from "../../../codes/codes.service";

export type MarketplaceCategoryImportRow = {
  rowNumber: number;
  importKey: string;
  nameVi: string;
  sortOrder: number;
  isActive: boolean;
  translations: Record<string, string>;
};

export type MarketplaceCategoryImportPayload = {
  categories: MarketplaceCategoryImportRow[];
};

export type ExistingCategoryRecord = {
  id: string;
  code: string;
  importKey: string;
  nameVi: string;
  sortOrder: number;
  isActive: boolean;
  translations: Array<{
    id: string;
    categoryId: string;
    locale: string;
    name: string;
  }>;
};

export type MarketplaceCategoryImportState = {
  existingByKey: Map<string, ExistingCategoryRecord>;
  existingById: Map<string, ExistingCategoryRecord>;
  allExisting: ExistingCategoryRecord[];
};

const KEY_REGEX = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const SUPPORTED_LOCALES = ["en", "zh", "ko", "ru", "hi"] as const;

@Injectable()
export class MarketplaceCategoryImportAdapter
  implements
    ImportAdapter<MarketplaceCategoryImportPayload, MarketplaceCategoryImportState>,
    OnModuleInit
{
  readonly type = "marketplace-categories";
  readonly supportedModes = ["upsert", "replace"] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodesService,
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
              aliases: ["category_key", "mã danh mục", "category key", "key"],
              required: true,
              type: "string",
              example: "food_beverage",
            },
            {
              key: "name_vi",
              header: "Tên tiếng Việt",
              aliases: [
                "name_vi",
                "tên danh mục",
                "tên tiếng việt",
                "name vi",
                "tên danh mục (tiếng việt)",
              ],
              required: true,
              type: "string",
              maxLength: 120,
            },
            {
              key: "sort_order",
              header: "Thứ tự",
              aliases: ["sort_order", "thứ tự", "sort order", "thứ tự hiển thị"],
              type: "number",
              min: 0,
              defaultValue: 0,
            },
            {
              key: "status",
              header: "Trạng thái",
              aliases: ["status", "trạng thái"],
              type: "enum",
              enumValues: ["ACTIVE", "DISABLED"],
              defaultValue: "ACTIVE",
            },
            {
              key: "name_en",
              header: "Tên tiếng Anh",
              aliases: ["name_en", "tên tiếng anh", "name en", "english"],
              type: "string",
              maxLength: 120,
            },
            {
              key: "name_zh",
              header: "Tên tiếng Trung",
              aliases: ["name_zh", "tên tiếng trung", "name zh", "chinese"],
              type: "string",
              maxLength: 120,
            },
            {
              key: "name_ko",
              header: "Tên tiếng Hàn",
              aliases: ["name_ko", "tên tiếng hàn", "name ko", "korean"],
              type: "string",
              maxLength: 120,
            },
            {
              key: "name_ru",
              header: "Tên tiếng Nga",
              aliases: ["name_ru", "tên tiếng nga", "name ru", "russian"],
              type: "string",
              maxLength: 120,
            },
            {
              key: "name_hi",
              header: "Tên tiếng Ấn",
              aliases: ["name_hi", "tên tiếng ấn", "name hi", "hindi"],
              type: "string",
              maxLength: 120,
            },
          ],
        },
      ],
    };
  }

  authorize(context: ImportContext): void {
    if (!context.actorUserId) {
      throw new UnauthorizedException("Yêu cầu mã người dùng thực hiện nhập dữ liệu");
    }
  }

  parse(
    workbook: ParsedImportWorkbook,
    _context: ImportContext,
  ): MarketplaceCategoryImportPayload {
    const sheet = workbook.sheets.find(
      (s) => s.name.toLowerCase() === "categories" || s.name === workbook.sheets[0]?.name,
    );
    if (!sheet) {
      return { categories: [] };
    }

    const rows: MarketplaceCategoryImportRow[] = [];

    for (const rawRow of sheet.rows) {
      const getVal = (aliases: string[]): string => {
        for (const [k, v] of Object.entries(rawRow.values)) {
          const normKey = k.trim().toLowerCase();
          if (aliases.some((a) => a.toLowerCase() === normKey)) {
            return v != null ? String(v).trim() : "";
          }
        }
        return "";
      };

      const importKey = getVal(["category_key", "mã danh mục", "category key", "key"]);
      const nameVi = getVal([
        "name_vi",
        "tên danh mục",
        "tên tiếng việt",
        "name vi",
        "tên danh mục (tiếng việt)",
      ]);
      const sortOrderRaw = getVal(["sort_order", "thứ tự", "sort order", "thứ tự hiển thị"]);
      const statusRaw = getVal(["status", "trạng thái"]).toUpperCase();

      const sortOrder =
        sortOrderRaw !== "" && !isNaN(Number(sortOrderRaw))
          ? Math.max(0, parseInt(sortOrderRaw, 10))
          : 0;
      const isActive = statusRaw === "" ? true : statusRaw === "ACTIVE";

      const LOCALE_ALIASES: Record<string, string[]> = {
        en: ["name_en", "tên tiếng anh", "tên (tiếng anh)", "name en", "english", "english name"],
        zh: ["name_zh", "tên tiếng trung", "tên (tiếng trung)", "name zh", "chinese", "chinese name"],
        ko: ["name_ko", "tên tiếng hàn", "tên (tiếng hàn)", "name ko", "korean", "korean name"],
        ru: ["name_ru", "tên tiếng nga", "tên (tiếng nga)", "name ru", "russian", "russian name"],
        hi: ["name_hi", "tên tiếng ấn", "tên tiếng ấn độ", "tên (tiếng ấn độ)", "tên (tiếng ấn)", "name hi", "hindi", "hindi name"],
      };

      const translations: Record<string, string> = {};
      for (const loc of SUPPORTED_LOCALES) {
        const val = getVal(LOCALE_ALIASES[loc]);
        if (val !== "") {
          translations[loc] = val;
        }
      }

      rows.push({
        rowNumber: rawRow.rowNumber,
        importKey,
        nameVi,
        sortOrder,
        isActive,
        translations,
      });
    }

    return { categories: rows };
  }

  validate(
    payload: MarketplaceCategoryImportPayload,
    _context: ImportContext,
  ): ImportValidationIssue[] {
    const issues: ImportValidationIssue[] = [];
    const seenKeys = new Map<string, number>();

    for (const row of payload.categories) {
      const sheetName = "categories";

      if (!row.importKey) {
        issues.push({
          severity: "error",
          sheet: sheetName,
          row: row.rowNumber,
          column: "category_key",
          code: "REQUIRED_FIELD_MISSING",
          message: "Thiếu mã danh mục (category_key)",
          value: row.importKey,
        });
      } else if (!KEY_REGEX.test(row.importKey)) {
        issues.push({
          severity: "error",
          sheet: sheetName,
          row: row.rowNumber,
          column: "category_key",
          code: "INVALID_KEY_FORMAT",
          message:
            "Mã danh mục không hợp lệ (phải bắt đầu bằng chữ cái/số thường, 2-80 ký tự [a-z0-9_-])",
          value: row.importKey,
        });
      } else {
        const lowerKey = row.importKey.toLowerCase();
        const firstSeenRow = seenKeys.get(lowerKey);
        if (firstSeenRow !== undefined) {
          issues.push({
            severity: "error",
            sheet: sheetName,
            row: row.rowNumber,
            column: "category_key",
            code: "DUPLICATE_KEY",
            message: `Trùng lặp category_key '${row.importKey}' với dòng ${firstSeenRow}`,
            value: row.importKey,
          });
        } else {
          seenKeys.set(lowerKey, row.rowNumber);
        }
      }

      if (!row.nameVi) {
        issues.push({
          severity: "error",
          sheet: sheetName,
          row: row.rowNumber,
          column: "name_vi",
          code: "REQUIRED_FIELD_MISSING",
          message: "Thiếu tên tiếng Việt (name_vi)",
          value: row.nameVi,
        });
      } else if (row.nameVi.length > 120) {
        issues.push({
          severity: "error",
          sheet: sheetName,
          row: row.rowNumber,
          column: "name_vi",
          code: "MAX_LENGTH_EXCEEDED",
          message: "Tên tiếng Việt không được vượt quá 120 ký tự",
          value: row.nameVi,
        });
      }

      if (row.sortOrder < 0) {
        issues.push({
          severity: "error",
          sheet: sheetName,
          row: row.rowNumber,
          column: "sort_order",
          code: "INVALID_NUMBER",
          message: "Thứ tự hiển thị phải là số nguyên ≥ 0",
          value: row.sortOrder,
        });
      }

      for (const [loc, val] of Object.entries(row.translations)) {
        if (val && val.length > 120) {
          issues.push({
            severity: "error",
            sheet: sheetName,
            row: row.rowNumber,
            column: `name_${loc}`,
            code: "MAX_LENGTH_EXCEEDED",
            message: `Tên tiếng [${loc}] không được vượt quá 120 ký tự`,
            value: val,
          });
        }
      }
    }

    return issues;
  }

  async loadCurrentState(_context: ImportContext): Promise<MarketplaceCategoryImportState> {
    const categories = await this.prisma.marketplaceCategory.findMany({
      include: { translations: true },
    });

    const existingByKey = new Map<string, ExistingCategoryRecord>();
    const existingById = new Map<string, ExistingCategoryRecord>();

    for (const cat of categories) {
      const rec = cat as ExistingCategoryRecord;
      existingById.set(cat.id, rec);
      if (cat.importKey) {
        existingByKey.set(cat.importKey.toLowerCase(), rec);
      }
      existingByKey.set(`code:${cat.code.toLowerCase()}`, rec);
      existingByKey.set(`name:${cat.nameVi.trim().toLowerCase()}`, rec);
    }

    return {
      existingByKey,
      existingById,
      allExisting: categories as ExistingCategoryRecord[],
    };
  }

  diff(
    payload: MarketplaceCategoryImportPayload,
    state: MarketplaceCategoryImportState,
    _context: ImportContext,
    mode: ImportMode,
  ): ImportDiffEntry[] {
    if (mode !== "upsert" && mode !== "replace") {
      throw new Error(`Mode ${mode} is not supported by MarketplaceCategoryImportAdapter`);
    }

    const diffs: ImportDiffEntry[] = [];
    const matchedCategoryIds = new Set<string>();

    for (const row of payload.categories) {
      const key = row.importKey ? row.importKey.toLowerCase() : "";
      const codeKey = row.importKey ? `code:${row.importKey.toLowerCase()}` : "";
      const nameKey = row.nameVi ? `name:${row.nameVi.trim().toLowerCase()}` : "";

      const existing =
        (key ? state.existingByKey.get(key) : undefined) ??
        (codeKey ? state.existingByKey.get(codeKey) : undefined) ??
        (nameKey ? state.existingByKey.get(nameKey) : undefined);

      if (!existing) {
        const changes: ImportFieldChange[] = [
          { field: "nameVi", from: null, to: row.nameVi },
          { field: "sortOrder", from: null, to: row.sortOrder },
          { field: "isActive", from: null, to: row.isActive },
        ];
        for (const [loc, val] of Object.entries(row.translations)) {
          if (val) {
            changes.push({ field: `translation_${loc}`, from: null, to: val });
          }
        }
        diffs.push({
          entityType: "MarketplaceCategory",
          key: row.importKey,
          action: "create",
          label: row.nameVi,
          changes,
        });
      } else {
        matchedCategoryIds.add(existing.id);
        const changes: ImportFieldChange[] = [];

        if (existing.nameVi !== row.nameVi) {
          changes.push({ field: "nameVi", from: existing.nameVi, to: row.nameVi });
        }
        if (existing.sortOrder !== row.sortOrder) {
          changes.push({ field: "sortOrder", from: existing.sortOrder, to: row.sortOrder });
        }
        if (existing.isActive !== row.isActive) {
          changes.push({ field: "isActive", from: existing.isActive, to: row.isActive });
        }

        for (const [loc, val] of Object.entries(row.translations)) {
          if (val) {
            const currentTr = existing.translations.find((t) => t.locale === loc)?.name ?? null;
            if (currentTr !== val) {
              changes.push({ field: `translation_${loc}`, from: currentTr, to: val });
            }
          }
        }

        diffs.push({
          entityType: "MarketplaceCategory",
          key: row.importKey || existing.importKey || existing.code,
          action: changes.length > 0 ? "update" : "unchanged",
          label: row.nameVi,
          changes,
        });
      }
    }

    if (mode === "replace") {
      for (const existing of state.allExisting) {
        if (!matchedCategoryIds.has(existing.id)) {
          diffs.push({
            entityType: "MarketplaceCategory",
            key: existing.importKey || existing.code,
            action: "disable",
            label: existing.nameVi,
            changes: [{ field: "isActive", from: existing.isActive, to: false }],
          });
        }
      }
    }

    return diffs;
  }

  async commit(
    input: ImportCommitInput<MarketplaceCategoryImportPayload, MarketplaceCategoryImportState>,
  ): Promise<ImportCommitResult> {
    const { tx, payload, diff } = input;

    let createCount = 0;
    let updateCount = 0;
    let disableCount = 0;
    let unchangedCount = 0;

    const diffMap = new Map<string, ImportDiffEntry>();
    for (const d of diff) {
      diffMap.set(d.key.toLowerCase(), d);
    }

    for (const d of diff) {
      if (d.action === "unchanged") {
        unchangedCount++;
        continue;
      }

      if (d.action === "disable") {
        const existing = await tx.marketplaceCategory.findFirst({
          where: {
            OR: [
              { importKey: d.key },
              { code: d.key },
            ],
          },
        });
        if (existing) {
          await tx.marketplaceService.deleteMany({
            where: { categoryId: existing.id },
          });
          await tx.marketplaceCategory.delete({
            where: { id: existing.id },
          });
          disableCount++;
        }
      }
    }

    for (const row of payload.categories) {
      const key = (row.importKey || "").toLowerCase();
      const d =
        (key ? diffMap.get(key) : undefined) ??
        diffMap.get(`code:${key}`) ??
        diffMap.get(`name:${row.nameVi.trim().toLowerCase()}`);

      if (!d || d.action === "unchanged" || d.action === "disable") {
        continue;
      }

      if (d.action === "create") {
        const code = await this.codes.generateEntityCode("MARKETPLACE_CATEGORY", tx);
        const created = await tx.marketplaceCategory.create({
          data: {
            code,
            importKey: row.importKey,
            nameVi: row.nameVi,
            sortOrder: row.sortOrder,
            isActive: row.isActive,
          },
        });

        for (const [loc, val] of Object.entries(row.translations)) {
          if (val) {
            await tx.marketplaceCategoryTranslation.upsert({
              where: {
                categoryId_locale: {
                  categoryId: created.id,
                  locale: loc,
                },
              },
              create: {
                categoryId: created.id,
                locale: loc,
                name: val,
              },
              update: {
                name: val,
              },
            });
          }
        }
        createCount++;
      } else if (d.action === "update") {
        const existing = await tx.marketplaceCategory.findFirst({
          where: {
            OR: [
              { importKey: row.importKey },
              { code: row.importKey },
              { nameVi: { equals: row.nameVi, mode: "insensitive" } },
            ],
          },
        });
        if (existing) {
          await tx.marketplaceCategory.update({
            where: { id: existing.id },
            data: {
              importKey: row.importKey,
              nameVi: row.nameVi,
              sortOrder: row.sortOrder,
              isActive: row.isActive,
            },
          });

          for (const [loc, val] of Object.entries(row.translations)) {
            if (val) {
              await tx.marketplaceCategoryTranslation.upsert({
                where: {
                  categoryId_locale: {
                    categoryId: existing.id,
                    locale: loc,
                  },
                },
                create: {
                  categoryId: existing.id,
                  locale: loc,
                  name: val,
                },
                update: {
                  name: val,
                },
              });
            }
          }
          updateCount++;
        }
      }
    }

    const totalEntities = createCount + updateCount + disableCount + unchangedCount;
    const summary = {
      create: createCount,
      update: updateCount,
      disable: disableCount,
      unchanged: unchangedCount,
      errors: 0,
      warnings: 0,
      totalEntities,
      byEntityType: {
        MarketplaceCategory: {
          create: createCount,
          update: updateCount,
          disable: disableCount,
          unchanged: unchangedCount,
        },
      },
    };

    return { summary };
  }
}
