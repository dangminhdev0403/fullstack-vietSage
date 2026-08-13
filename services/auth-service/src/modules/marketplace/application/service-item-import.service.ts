import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { google } from "googleapis";
import { PrismaService } from "../../../prisma/prisma.service";
import type {
  ImportContext,
  ImportDiffEntry,
  ParsedImportWorkbook,
} from "../../../common/import/import.types";
import {
  MarketplaceServiceItemImportAdapter,
  FORBIDDEN_CATEGORY_HEADERS,
  REQUIRED_HEADERS,
} from "../infrastructure/imports/marketplace-service-item-import.adapter";

const MAX_BYTES = 2 * 1024 * 1024;

@Injectable()
export class ServiceItemImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: MarketplaceServiceItemImportAdapter,
  ) {}

  async preview(actorUserId: string, csv: string, fileName = "service-items.csv") {
    const context = await this.context(actorUserId);
    const workbook = this.parseCsv(csv, fileName);
    const payload = await this.adapter.parse(workbook, context);
    const validation = this.validateHeaders(workbook, payload);
    validation.push(...(await this.adapter.validate(payload, context)));
    const state = await this.adapter.loadCurrentState(context);
    validation.push(...this.adapter.validateState(payload, state));
    if (!state.categoryId || !state.categoryActive)
      validation.push({
        severity: "error",
        sheet: "items",
        code: "CATEGORY_NOT_ASSIGNED",
        message: "Service Tenant chưa được gán danh mục hoạt động",
      });
    const diff = validation.some((i) => i.severity === "error")
      ? []
      : await this.adapter.diff(payload, state, context, "upsert");
    const fileHash = createHash("sha256").update(csv, "utf8").digest("hex");
    const stateHash = this.stateHash(state);
    return {
      previewToken: createHash("sha256")
        .update(`${actorUserId}:${context.tenantId}:${fileHash}:${stateHash}`)
        .digest("hex"),
      fileHash,
      summary: this.summary(diff, validation),
      validation,
      diff,
    };
  }

  async commit(
    actorUserId: string,
    csv: string,
    previewToken: string,
    fileName = "service-items.csv",
  ) {
    const context = await this.context(actorUserId);
    const workbook = this.parseCsv(csv, fileName);
    const payload = await this.adapter.parse(workbook, context);
    const validation = [
      ...this.validateHeaders(workbook, payload),
      ...(await this.adapter.validate(payload, context)),
    ];
    const fileHash = createHash("sha256").update(csv, "utf8").digest("hex");
    const result = await this.prisma.$transaction(async (tx) => {
      const state = await this.adapter.loadCurrentState(context, tx as never);
      validation.push(...this.adapter.validateState(payload, state));
      if (!state.categoryId || !state.categoryActive)
        validation.push({
          severity: "error",
          sheet: "items",
          code: "CATEGORY_NOT_ASSIGNED",
          message: "Service Tenant chưa được gán danh mục hoạt động",
        });
      if (validation.some((i) => i.severity === "error"))
        throw new ConflictException("File nhập có lỗi, vui lòng xem trước và sửa lại");
      const expected = createHash("sha256")
        .update(`${actorUserId}:${context.tenantId}:${fileHash}:${this.stateHash(state)}`)
        .digest("hex");
      if (expected !== previewToken)
        throw new ConflictException(
          "Dữ liệu đã thay đổi sau lần xem trước. Vui lòng xem trước lại.",
        );
      const diff = await this.adapter.diff(payload, state, context, "upsert");
      return this.adapter.commit({
        tx,
        mode: "upsert",
        context,
        payload,
        currentState: state,
        diff,
      });
    });
    if (fileName === "google-sheet.csv")
      try {
        await this.writeGeneratedCodes(
          String(context.tenantId),
          (result.auditPayload?.generatedCodes ?? []) as Array<{ rowNumber: number; code: string }>,
        );
      } catch {
        result.summary.warnings++;
        result.auditPayload = { ...result.auditPayload, codeWritebackPending: true };
      }
    return result;
  }

  template() {
    return (
      "\uFEFF" +
      "Mã dịch vụ (Hệ thống tự sinh - không chỉnh sửa),Tên dịch vụ (Tiếng Việt),Mô tả (Tiếng Việt),Giá,Thời gian chuẩn bị (phút),Sức chứa,Hình thức phục vụ,Trạng thái,Tên (Tiếng Anh),Mô tả (Tiếng Anh),Tên (Tiếng Trung),Mô tả (Tiếng Trung),Tên (Tiếng Hàn),Mô tả (Tiếng Hàn),Tên (Tiếng Nga),Mô tả (Tiếng Nga),Tên (Tiếng Ấn Độ),Mô tả (Tiếng Ấn Độ)\n" +
      ",Massage 60 phút,Massage thư giãn,450000,15,,1 - Phục vụ tại địa điểm,2 - Tạm ẩn,60-minute massage,Relaxing massage,,,,,,,,\n"
    );
  }

  async export(actorUserId: string) {
    const context = await this.context(actorUserId);
    const [profile, items] = await Promise.all([
      this.prisma.serviceTenantProfile.findUnique({
        where: { tenantId: context.tenantId },
        include: { category: true },
      }),
      this.prisma.marketplaceService.findMany({
        where: { serviceTenantId: context.tenantId },
        orderBy: { updatedAt: "desc" },
        take: 2000,
      }),
    ]);
    if (!profile) throw new NotFoundException("Service profile not found");
    const rows = items.map((item) => [
      item.importKey ?? "",
      item.name,
      item.description ?? "",
      String(item.unitPrice),
      String(item.waitingMinutes),
      item.capacityAvailable ?? "",
      item.mode,
      item.status,
    ]);
    return (
      "\uFEFF" +
      [
        "Mã dịch vụ (Hệ thống tự sinh - không chỉnh sửa)",
        "Tên dịch vụ (Tiếng Việt)",
        "Mô tả (Tiếng Việt)",
        "Giá",
        "Thời gian chuẩn bị (phút)",
        "Sức chứa",
        "Hình thức phục vụ",
        "Trạng thái",
        ...rows.flatMap((r) => ["\n", this.csvRow(r)]),
      ].join("")
    );
  }

  private async context(actorUserId: string): Promise<ImportContext> {
    const memberships = await this.prisma.tenantUser.findMany({
      where: { userId: actorUserId, status: "ACTIVE", tenant: { type: "SERVICE" } },
      select: { tenantId: true },
    });
    if (memberships.length !== 1)
      throw new ConflictException("Service Tenant membership is required and must be unambiguous");
    return { actorUserId, tenantId: memberships[0].tenantId };
  }

  private parseCsv(csv: string, fileName: string): ParsedImportWorkbook {
    if (Buffer.byteLength(csv, "utf8") > MAX_BYTES)
      throw new ConflictException("File CSV vượt quá 2 MB");
    const clean = csv.replace(/^\uFEFF/, "");
    const records = this.csvRecords(clean);
    if (!records.length) throw new ConflictException("File CSV trống");
    const rawHeaders = records[0].map((h) => h.trim().toLowerCase());
    const aliases: Record<string, string> = {
      "mã dịch vụ (hệ thống tự sinh - không chỉnh sửa)": "item_key",
      "mã dịch vụ": "item_key",
      item_key: "item_key",
      "tên dịch vụ (tiếng việt)": "name_vi",
      "tên dịch vụ": "name_vi",
      name_vi: "name_vi",
      "mô tả (tiếng việt)": "description_vi",
      "mô tả": "description_vi",
      description_vi: "description_vi",
      giá: "unit_price",
      unit_price: "unit_price",
      "thời gian chuẩn bị (phút)": "preparation_minutes",
      preparation_minutes: "preparation_minutes",
      "sức chứa": "capacity",
      capacity: "capacity",
      "hình thức phục vụ": "fulfillment_method",
      fulfillment_method: "fulfillment_method",
      "trạng thái": "status",
      status: "status",
      "tên (tiếng anh)": "name_en",
      "mô tả (tiếng anh)": "description_en",
      "tên (tiếng trung)": "name_zh",
      "mô tả (tiếng trung)": "description_zh",
      "tên (tiếng hàn)": "name_ko",
      "mô tả (tiếng hàn)": "description_ko",
      "tên (tiếng nga)": "name_ru",
      "mô tả (tiếng nga)": "description_ru",
      "tên (tiếng ấn độ)": "name_hi",
      "mô tả (tiếng ấn độ)": "description_hi",
    };
    const headers = rawHeaders.map((h) => aliases[h] ?? h);
    if (new Set(headers).size !== headers.length)
      throw new ConflictException("File có tiêu đề cột trùng nhau");
    const rows = records
      .slice(1)
      .filter((r) => r.some((v) => v.trim() !== ""))
      .map((values, i) => ({
        rowNumber: i + 2,
        values: Object.fromEntries(headers.map((h, index) => [h, values[index] ?? ""])),
      }));
    return {
      fileName,
      fileHash: createHash("sha256").update(csv, "utf8").digest("hex"),
      sheets: [{ name: "items", rows }],
    };
  }

  private validateHeaders(workbook: ParsedImportWorkbook, _payload: unknown) {
    const headers = Object.keys(workbook.sheets[0]?.rows[0]?.values ?? {});
    const issues: any[] = [];
    const normalized = new Set(headers.map((h) => h.trim().toLowerCase()));
    for (const header of REQUIRED_HEADERS)
      if (!normalized.has(header))
        issues.push({
          severity: "error",
          sheet: "items",
          row: 1,
          column: header,
          code: "REQUIRED_COLUMN_MISSING",
          message: `Thiếu cột ${header}`,
        });
    for (const header of normalized)
      if (FORBIDDEN_CATEGORY_HEADERS.has(header))
        issues.push({
          severity: "error",
          sheet: "items",
          row: 1,
          column: header,
          code: "CATEGORY_COLUMN_FORBIDDEN",
          message: "Không được nhập danh mục; danh mục được kế thừa từ Service Tenant",
        });
    return issues;
  }

  private async writeGeneratedCodes(
    tenantId: string,
    generatedCodes: Array<{ rowNumber: number; code: string }>,
  ) {
    if (!generatedCodes.length) return;
    const profile = await this.prisma.serviceTenantProfile.findUnique({
      where: { tenantId },
      select: { googleSheetsUrl: true },
    });
    const spreadsheetId = profile?.googleSheetsUrl?.match(
      /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    )?.[1];
    if (!spreadsheetId) throw new ConflictException("URL Google Sheets đã lưu không hợp lệ");
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties(index,title)",
    });
    const title = (metadata.data.sheets ?? [])
      .map((sheet) => sheet.properties)
      .sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0))[0]?.title;
    if (!title) throw new ConflictException("Google Sheets không có tab dữ liệu");
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: generatedCodes.map(({ rowNumber, code }) => ({
          range: `'${title.replace(/'/g, "''")}'!A${rowNumber}`,
          values: [[code]],
        })),
      },
    });
  }

  private stateHash(state: unknown) {
    return createHash("sha256")
      .update(
        JSON.stringify(state, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v instanceof Map ? Array.from(v.entries()) : v,
        ),
      )
      .digest("hex");
  }
  private summary(diff: ImportDiffEntry[], validation: Array<{ severity: "error" | "warning" }>) {
    const create = diff.filter((d) => d.action === "create").length;
    const update = diff.filter((d) => d.action === "update").length;
    const unchanged = diff.filter((d) => d.action === "unchanged").length;
    return {
      create,
      update,
      disable: 0,
      unchanged,
      errors: validation.filter((i) => i.severity === "error").length,
      warnings: validation.filter((i) => i.severity === "warning").length,
      totalEntities: diff.length,
      byEntityType: { MarketplaceService: { create, update, disable: 0, unchanged } },
    };
  }
  private csvRecords(input: string): string[][] {
    const records: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      const next = input[i + 1];
      if (ch === '"') {
        if (quoted && next === '"') {
          cell += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && next === "\n") i++;
        row.push(cell);
        records.push(row);
        row = [];
        cell = "";
      } else cell += ch;
    }
    if (quoted) throw new ConflictException("CSV có ô trích dẫn chưa đóng");
    if (cell.length || row.length) {
      row.push(cell);
      records.push(row);
    }
    return records;
  }
  private csvRow(values: unknown[]) {
    return values
      .map((v) => {
        let text = String(v ?? "");
        if (/^[=+\-@]/.test(text)) text = `'${text}`;
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(",");
  }
}
