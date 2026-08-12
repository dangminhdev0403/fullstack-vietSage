import { Injectable, OnModuleInit } from "@nestjs/common";
import { ImportRegistry } from "../../../../common/import/import.registry";
import type {
  ImportAdapter,
  ImportCommitInput,
  ImportCommitResult,
  ImportContext,
  ImportDiffEntry,
  ImportMode,
  ImportValidationIssue,
  ImportWorkbookSchema,
  ParsedImportWorkbook,
} from "../../../../common/import/import.types";
import { PrismaService } from "../../../../prisma/prisma.service";
import { CodesService } from "../../../codes/codes.service";

const MAX_ROWS = 2000;
const REQUIRED_HEADERS = [
  "name_vi",
  "unit_price",
  "preparation_minutes",
  "capacity",
  "fulfillment_method",
  "status",
] as const;
const FORBIDDEN_CATEGORY_HEADERS = new Set([
  "category",
  "category_id",
  "category_key",
  "danh mục",
  "mã danh mục",
]);

type Row = {
  rowNumber: number;
  itemKey: string;
  name: string;
  description: string | null;
  unitPrice: number;
  preparationMinutes: number;
  capacity: number | null;
  mode: "DELIVERY_TO_HOTEL" | "CUSTOMER_AT_SERVICE";
  status: "DRAFT" | "ACTIVE" | "DISABLED";
  translations: Record<string, { name: string; description: string | null }>;
};

type Payload = { items: Row[]; fileHash?: string };
type StateItem = Pick<
  PrismaMarketplaceService,
  | "id"
  | "importKey"
  | "name"
  | "description"
  | "unitPrice"
  | "waitingMinutes"
  | "capacityAvailable"
  | "mode"
  | "status"
>;
type State = { items: StateItem[]; categoryId: string | null; categoryActive: boolean };
type PrismaMarketplaceService = {
  id: string;
  importKey: string | null;
  name: string;
  description: string | null;
  unitPrice: unknown;
  waitingMinutes: number;
  capacityAvailable: number | null;
  mode: "DELIVERY_TO_HOTEL" | "CUSTOMER_AT_SERVICE";
  status: "DRAFT" | "ACTIVE" | "DISABLED";
};

@Injectable()
export class MarketplaceServiceItemImportAdapter
  implements ImportAdapter<Payload, State>, OnModuleInit
{
  readonly type = "marketplace-service-items";
  readonly supportedModes = ["upsert"] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodesService,
    private readonly registry: ImportRegistry,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  getSchema(): ImportWorkbookSchema {
    return {
      sheets: [
        {
          name: "items",
          required: true,
          maxRows: MAX_ROWS,
          columns: [
            {
              key: "item_key",
              header: "Mã dịch vụ (Hệ thống tự sinh - không chỉnh sửa)",
              type: "string",
              maxLength: 120,
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
            { key: "unit_price", header: "Giá", required: true, type: "number", min: 0 },
            {
              key: "preparation_minutes",
              header: "Thời gian chuẩn bị (phút)",
              required: true,
              type: "number",
              min: 0,
            },
            { key: "capacity", header: "Sức chứa", type: "number", min: 0 },
            {
              key: "fulfillment_method",
              header: "Hình thức phục vụ",
              required: true,
              type: "enum",
              enumValues: ["1 - Phục vụ tại địa điểm", "2 - Giao tận nơi"],
            },
            {
              key: "status",
              header: "Trạng thái",
              required: true,
              type: "enum",
              enumValues: ["1 - Hoạt động", "2 - Tạm ẩn"],
            },
            ...["en", "zh", "ko", "ru", "hi"].flatMap((locale) => [
              {
                key: `name_${locale}`,
                header: `Tên (${locale})`,
                type: "string" as const,
                maxLength: 160,
              },
              {
                key: `description_${locale}`,
                header: `Mô tả (${locale})`,
                type: "string" as const,
                maxLength: 1000,
              },
            ]),
          ],
        },
      ],
    };
  }

  authorize(context: ImportContext) {
    if (!context.actorUserId || !context.tenantId)
      throw new Error("service item import requires actorUserId and tenantId");
  }

  parse(workbook: ParsedImportWorkbook, _context?: ImportContext): Payload {
    const sheet =
      workbook.sheets.find((s) => s.name.toLowerCase() === "items") ?? workbook.sheets[0];
    if (!sheet) return { items: [], fileHash: workbook.fileHash };
    return {
      fileHash: workbook.fileHash,
      items: sheet.rows.map((row) => ({
        rowNumber: row.rowNumber,
        itemKey: this.text(row.values.item_key),
        name: this.text(row.values.name_vi),
        description: this.optional(row.values.description_vi),
        unitPrice: this.number(row.values.unit_price),
        preparationMinutes: this.number(row.values.preparation_minutes),
        capacity: this.optionalNumber(row.values.capacity),
        mode: this.mode(row.values.fulfillment_method),
        status: this.status(row.values.status),
        translations: Object.fromEntries(
          ["en", "zh", "ko", "ru", "hi"].flatMap((locale) => {
            const name = this.text(row.values[`name_${locale}`]);
            return name
              ? [
                  [
                    locale,
                    { name, description: this.optional(row.values[`description_${locale}`]) },
                  ],
                ]
              : [];
          }),
        ),
      })),
    };
  }

  validate(payload: Payload, _context?: ImportContext): ImportValidationIssue[] {
    const issues: ImportValidationIssue[] = [];
    const seen = new Map<string, number>();
    if (payload.items.length > MAX_ROWS)
      issues.push({
        severity: "error",
        sheet: "items",
        code: "MAX_ROWS_EXCEEDED",
        message: `Tối đa ${MAX_ROWS} dòng mỗi lần nhập`,
      });
    for (const row of payload.items) {
      const key = row.name.toLocaleLowerCase("vi");
      if (seen.has(key))
        this.error(
          issues,
          row,
          "name_vi",
          "DUPLICATE_NAME",
          `Trùng tên tiếng Việt với dòng ${seen.get(key)}`,
        );
      else if (key) seen.set(key, row.rowNumber);
      if (!row.name) this.error(issues, row, "name", "REQUIRED_FIELD_MISSING", "Thiếu tên dịch vụ");
      else if (row.name.length > 160)
        this.error(issues, row, "name", "MAX_LENGTH_EXCEEDED", "Tên dịch vụ tối đa 160 ký tự");
      if (row.description != null && row.description.length > 1000)
        this.error(issues, row, "description", "MAX_LENGTH_EXCEEDED", "Mô tả tối đa 1000 ký tự");
      if (!Number.isFinite(row.unitPrice) || row.unitPrice < 0 || row.unitPrice > 9999999999.99)
        this.error(
          issues,
          row,
          "unit_price",
          "INVALID_NUMBER",
          "Giá phải là số từ 0 đến 9999999999.99",
        );
      else if (!/^\d+(?:\.\d{1,2})?$/.test(String(row.unitPrice)))
        this.error(
          issues,
          row,
          "unit_price",
          "INVALID_PRICE_SCALE",
          "Giá tối đa 2 chữ số thập phân",
        );
      if (!Number.isInteger(row.preparationMinutes) || row.preparationMinutes < 0)
        this.error(
          issues,
          row,
          "preparation_minutes",
          "INVALID_NUMBER",
          "Thời gian chuẩn bị phải là số nguyên >= 0",
        );
      if (row.capacity != null && (!Number.isInteger(row.capacity) || row.capacity < 0))
        this.error(issues, row, "capacity", "INVALID_NUMBER", "Sức chứa phải là số nguyên >= 0");
      if (!["DELIVERY_TO_HOTEL", "CUSTOMER_AT_SERVICE"].includes(row.mode))
        this.error(
          issues,
          row,
          "fulfillment_method",
          "INVALID_ENUM",
          "Hình thức phục vụ không hợp lệ",
        );
      if (!["DRAFT", "ACTIVE", "DISABLED"].includes(row.status))
        this.error(issues, row, "status", "INVALID_ENUM", "Trạng thái không hợp lệ");
    }
    return issues;
  }

  async loadCurrentState(
    context: ImportContext,
    db: Pick<PrismaService, "serviceTenantProfile" | "marketplaceService"> = this.prisma,
  ): Promise<State> {
    const tenantId = String(context.tenantId);
    const [profile, items] = await Promise.all([
      db.serviceTenantProfile.findUnique({
        where: { tenantId },
        select: { categoryId: true, category: { select: { isActive: true } } },
      }),
      db.marketplaceService.findMany({
        where: { serviceTenantId: tenantId, importKey: { not: null } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          importKey: true,
          name: true,
          description: true,
          unitPrice: true,
          waitingMinutes: true,
          capacityAvailable: true,
          mode: true,
          status: true,
        },
      }),
    ]);
    return {
      categoryId: profile?.categoryId ?? null,
      categoryActive: profile?.category?.isActive === true,
      items: items as StateItem[],
    };
  }

  diff(
    payload: Payload,
    state: State,
    _context: ImportContext,
    _mode: ImportMode,
  ): ImportDiffEntry[] {
    const byCode = new Map(
      state.items
        .filter((item): item is StateItem & { importKey: string } => Boolean(item.importKey))
        .map((item) => [item.importKey.toLowerCase(), item]),
    );
    const byName = new Map(state.items.map((item) => [item.name.toLocaleLowerCase("vi"), item]));
    return payload.items.map((row) => {
      const current = row.itemKey
        ? byCode.get(row.itemKey.toLowerCase())
        : byName.get(row.name.toLocaleLowerCase("vi"));
      if (!current)
        return {
          entityType: "MarketplaceService",
          key: row.name,
          action: "create",
          label: row.name,
          changes: [],
        };
      const changes = this.changes(current, row);
      return {
        entityType: "MarketplaceService",
        key: current.importKey ?? current.id,
        action: changes.length ? "update" : "unchanged",
        label: row.name,
        changes,
      };
    });
  }

  async commit(input: ImportCommitInput<Payload, State>): Promise<ImportCommitResult> {
    const tenantId = String(input.context.tenantId);
    if (!input.currentState.categoryId || !input.currentState.categoryActive)
      throw new Error("Service Tenant chưa được gán danh mục hoạt động");
    const byCode = new Map(
      input.currentState.items
        .filter((item): item is StateItem & { importKey: string } => Boolean(item.importKey))
        .map((item) => [item.importKey.toLowerCase(), item]),
    );
    const byName = new Map(
      input.currentState.items.map((item) => [item.name.toLocaleLowerCase("vi"), item]),
    );
    const generatedCodes: Array<{ rowNumber: number; code: string }> = [];
    let create = 0,
      update = 0,
      unchanged = 0;
    const batchSize = 250;
    for (let offset = 0; offset < input.payload.items.length; offset += batchSize) {
      const batch = input.payload.items.slice(offset, offset + batchSize);
      const creates = batch.filter(
        (row) => !row.itemKey && !byName.has(row.name.toLocaleLowerCase("vi")),
      );
      for (const row of creates) {
        const importKey = await this.codes.generateEntityCode("MARKETPLACE_SERVICE", input.tx);
        const created = await input.tx.marketplaceService.create({
          data: {
            serviceTenantId: tenantId,
            importKey,
            categoryId: input.currentState.categoryId!,
            name: row.name,
            description: row.description,
            unitPrice: row.unitPrice,
            currency: "VND",
            imageUrls: [],
            mode: row.mode,
            capacityAvailable: row.capacity,
            waitingMinutes: row.preparationMinutes,
            status: row.status,
          },
        });
        await this.upsertTranslations(input.tx, created.id, row.translations);
        generatedCodes.push({ rowNumber: row.rowNumber, code: importKey });
        create++;
      }
      for (const row of batch) {
        const current = row.itemKey
          ? byCode.get(row.itemKey.toLowerCase())
          : byName.get(row.name.toLocaleLowerCase("vi"));
        if (current) {
          if (!row.itemKey && current.importKey)
            generatedCodes.push({ rowNumber: row.rowNumber, code: current.importKey });
          const changes = this.changes(current, row);
          if (!changes.length) {
            unchanged++;
            continue;
          }
          const result = await input.tx.marketplaceService.updateMany({
            where: { id: current.id, serviceTenantId: tenantId },
            data: {
              name: row.name,
              description: row.description,
              unitPrice: row.unitPrice,
              mode: row.mode,
              capacityAvailable: row.capacity,
              waitingMinutes: row.preparationMinutes,
              status: row.status,
              categoryId: input.currentState.categoryId,
              version: { increment: 1 },
            },
          });
          if (result.count !== 1) throw new Error("Service item changed during import");
          await this.upsertTranslations(input.tx, current.id, row.translations);
          update++;
        }
      }
    }
    return {
      summary: {
        create,
        update,
        disable: 0,
        unchanged,
        errors: 0,
        warnings: 0,
        totalEntities: input.payload.items.length,
        byEntityType: { MarketplaceService: { create, update, disable: 0, unchanged } },
      },
      auditPayload: { generatedCodes },
    };
  }

  validateState(payload: Payload, state: State): ImportValidationIssue[] {
    const codes = new Set(
      state.items
        .map((item) => item.importKey?.toLowerCase())
        .filter((k): k is string => Boolean(k)),
    );
    return payload.items.flatMap((row) =>
      row.itemKey && !codes.has(row.itemKey.toLowerCase())
        ? [
            {
              severity: "error" as const,
              sheet: "items",
              row: row.rowNumber,
              column: "item_key",
              code: "SERVICE_CODE_NOT_FOUND",
              message: `Mã dịch vụ không tồn tại: ${row.itemKey}`,
            },
          ]
        : [],
    );
  }

  private changes(current: StateItem, row: Row) {
    const fields: Array<[string, unknown, unknown]> = [
      ["name", current.name, row.name],
      ["description", current.description, row.description],
      ["unitPrice", String(current.unitPrice), row.unitPrice.toFixed(2)],
      ["waitingMinutes", current.waitingMinutes, row.preparationMinutes],
      ["capacityAvailable", current.capacityAvailable, row.capacity],
      ["mode", current.mode, row.mode],
      ["status", current.status, row.status],
    ];
    return fields
      .filter(([, from, to]) => String(from ?? "") !== String(to ?? ""))
      .map(([field, from, to]) => ({ field, from: from ?? "", to: to ?? "" }));
  }

  private async upsertTranslations(
    tx: ImportCommitInput<Payload, State>["tx"],
    serviceId: string,
    translations: Row["translations"],
  ) {
    if (!translations) return;
    for (const [locale, value] of Object.entries(translations)) {
      if (!value || (!value.name && !value.description)) continue;
      await tx.marketplaceServiceTranslation.upsert({
        where: { serviceId_locale: { serviceId, locale } },
        create: {
          serviceId,
          locale,
          name: value.name || "",
          description: value.description ?? null,
        },
        update: { name: value.name || "", description: value.description ?? null },
      });
    }
  }

  private error(
    issues: ImportValidationIssue[],
    row: Row,
    column: string,
    code: string,
    message: string,
  ) {
    issues.push({ severity: "error", sheet: "items", row: row.rowNumber, column, code, message });
  }
  private text(value: unknown) {
    if (value == null) return "";
    return (typeof value === "object" ? JSON.stringify(value) : String(value)).trim();
  }
  private optional(value: unknown) {
    const v = this.text(value);
    return v || null;
  }
  private number(value: unknown) {
    const v = this.text(value);
    return v === "" ? Number.NaN : Number(v);
  }
  private optionalNumber(value: unknown) {
    const v = this.text(value);
    return v === "" ? null : Number(v);
  }
  private enum(value: unknown) {
    return this.text(value).toUpperCase();
  }
  private mode(value: unknown): Row["mode"] {
    const v = this.enum(value);
    if (["1", "1 - PHỤC VỤ TẠI ĐỊA ĐIỂM", "CUSTOMER_AT_SERVICE"].includes(v))
      return "CUSTOMER_AT_SERVICE";
    if (["2", "2 - GIAO TẬN NƠI", "DELIVERY_TO_HOTEL"].includes(v)) return "DELIVERY_TO_HOTEL";
    return v as Row["mode"];
  }
  private status(value: unknown): Row["status"] {
    const v = this.enum(value);
    if (["1", "1 - HOẠT ĐỘNG", "ACTIVE"].includes(v)) return "ACTIVE";
    if (["2", "2 - TẠM ẨN", "DISABLED"].includes(v)) return "DISABLED";
    return v as Row["status"];
  }
}

export { FORBIDDEN_CATEGORY_HEADERS, REQUIRED_HEADERS };
