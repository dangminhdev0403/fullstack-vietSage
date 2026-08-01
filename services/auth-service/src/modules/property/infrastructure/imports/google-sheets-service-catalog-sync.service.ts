import { BadRequestException, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { google } from "googleapis";
import { AppLogger } from "../../../../common/logging/app-logger.service";
import { ImportService } from "../../../../common/import/import.service";
import type {
  ImportValidationIssue,
  ParsedImportWorkbook,
} from "../../../../common/import/import.types";
import { PrismaService } from "../../../../prisma/prisma.service";
import { HotelAccessService } from "../../application/hotel-access.service";

const SYSTEM_ACTOR_USER_ID = "google-sheets-sync";

type SyncSummary = {
  categoriesProcessed: number;
  itemsProcessed: number;
  inserted: number;
  updated: number;
  skipped: number;
  skippedRows: number;
  durationMs: number;
  errors: string[];
  warnings: string[];
};

@Injectable()
export class GoogleSheetsServiceCatalogSyncService {
  private isSyncing = false;

  constructor(
    private readonly importService: ImportService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  async syncHotel(
    hotelId: string,
    actorUserId: string,
    activeRoleId: string,
  ): Promise<SyncSummary> {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    return this.runSync(hotelId, hotel.googleSheetId, actorUserId, activeRoleId);
  }

  async validateSpreadsheet(spreadsheetId: string): Promise<void> {
    await this.readWorkbook(spreadsheetId);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncAllHotels(): Promise<void> {
    if (this.isSyncing) {
      this.logger.warn("Google Sheets sync skipped because another job is running", {
        module: "hotels",
        service: GoogleSheetsServiceCatalogSyncService.name,
        event: "SERVICE_CATALOG_SYNC_SKIPPED_CONCURRENT",
      });
      return;
    }

    this.isSyncing = true;
    const startedAt = Date.now();
    try {
      const hotels = await this.prisma.hotel.findMany({
        where: { googleSheetId: { not: null } },
        select: { id: true, googleSheetId: true },
      });
      for (const hotel of hotels) {
        try {
          await this.runSync(hotel.id, hotel.googleSheetId, SYSTEM_ACTOR_USER_ID, undefined, false);
        } catch (error) {
          this.logger.error(error, {
            module: "hotels",
            service: GoogleSheetsServiceCatalogSyncService.name,
            event: "SERVICE_CATALOG_SYNC_HOTEL_ERROR",
            hotelId: hotel.id,
          });
        }
      }
    } catch (error) {
      this.logger.error(error, {
        module: "hotels",
        service: GoogleSheetsServiceCatalogSyncService.name,
        event: "SERVICE_CATALOG_SYNC_ERROR",
      });
    } finally {
      this.isSyncing = false;
      this.logger.info("Google Sheets sync all hotels finished", {
        module: "hotels",
        service: GoogleSheetsServiceCatalogSyncService.name,
        event: "SERVICE_CATALOG_SYNC_DURATION",
        durationMs: Date.now() - startedAt,
      });
    }
  }

  private async runSync(
    hotelId: string,
    spreadsheetId: string | null,
    actorUserId: string,
    activeRoleId?: string,
    enforceConcurrency = true,
  ): Promise<SyncSummary> {
    if (enforceConcurrency && this.isSyncing) {
      throw new BadRequestException("Google Sheets synchronization is already running");
    }

    if (enforceConcurrency) this.isSyncing = true;
    const startedAt = Date.now();
    const errors: string[] = [];

    this.logger.info("Google Sheets sync started", {
      module: "hotels",
      service: GoogleSheetsServiceCatalogSyncService.name,
      event: "SERVICE_CATALOG_SYNC_STARTED",
      hotelId,
    });

    try {
      if (!spreadsheetId) {
        throw new BadRequestException(
          "Khách sạn chưa cấu hình Google Sheets. Hãy lưu URL Google Sheets trước khi đồng bộ.",
        );
      }
      const workbook = await this.readWorkbook(spreadsheetId);
      this.logger.info("Google Sheets sync validation started", {
        module: "hotels",
        service: GoogleSheetsServiceCatalogSyncService.name,
        event: "SERVICE_CATALOG_SYNC_VALIDATION",
        hotelId,
      });

      const previewInput = {
        type: "service-catalog",
        mode: "upsert" as const,
        context: {
          hotelId,
          actorUserId,
          activeRoleId,
          systemSync: actorUserId === SYSTEM_ACTOR_USER_ID,
        },
        workbook,
      };
      const { preview, skippedIssues } = await this.previewValidRows(previewInput);

      this.logger.info("Google Sheets sync upsert started", {
        module: "hotels",
        service: GoogleSheetsServiceCatalogSyncService.name,
        event: "SERVICE_CATALOG_SYNC_UPSERT",
        hotelId,
      });
      const result = await this.importService.commit(preview);
      const durationMs = Date.now() - startedAt;
      const summary = {
        categoriesProcessed:
          result.summary.byEntityType.serviceCategory?.create ??
          0 +
            (result.summary.byEntityType.serviceCategory?.update ?? 0) +
            (result.summary.byEntityType.serviceCategory?.unchanged ?? 0),
        itemsProcessed:
          result.summary.byEntityType.serviceItem?.create ??
          0 +
            (result.summary.byEntityType.serviceItem?.update ?? 0) +
            (result.summary.byEntityType.serviceItem?.unchanged ?? 0),
        inserted: result.summary.create,
        updated: result.summary.update,
        skipped: result.summary.unchanged,
        skippedRows: new Set(skippedIssues.map((issue) => `${issue.sheet}:${issue.row}`)).size,
        durationMs,
        errors,
        warnings: skippedIssues.length ? [this.formatValidationErrors(skippedIssues)] : [],
      };

      this.logger.info("Google Sheets sync summary", {
        module: "hotels",
        service: GoogleSheetsServiceCatalogSyncService.name,
        event: "SERVICE_CATALOG_SYNC_SUMMARY",
        hotelId,
        ...summary,
      });
      return summary;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if (error instanceof Error && errors.length === 0) errors.push(error.message);
      this.logger.error(error, {
        module: "hotels",
        service: GoogleSheetsServiceCatalogSyncService.name,
        event: "SERVICE_CATALOG_SYNC_ERROR",
        hotelId,
        durationMs,
      });
      throw error;
    } finally {
      if (enforceConcurrency) this.isSyncing = false;
      this.logger.info("Google Sheets sync duration", {
        module: "hotels",
        service: GoogleSheetsServiceCatalogSyncService.name,
        event: "SERVICE_CATALOG_SYNC_DURATION",
        hotelId,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  private async readWorkbook(spreadsheetId: string): Promise<ParsedImportWorkbook> {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      throw new BadRequestException("Máy chủ chưa cấu hình tài khoản dịch vụ Google Sheets");
    }

    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });
      const sheets = google.sheets({ version: "v4", auth });
      const metadata = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties(index,title)",
      });
      const ranges = this.rangesForFirstTwoSheets(
        (metadata.data.sheets ?? [])
          .map((sheet) => sheet.properties)
          .filter((properties): properties is NonNullable<typeof properties> => Boolean(properties))
          .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
          .map((properties) => properties.title ?? ""),
      );
      const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: "UNFORMATTED_VALUE",
      });
      const valueRanges = response.data.valueRanges ?? [];

      return {
        fileName: `google-sheet:${spreadsheetId}`,
        sheets: [
          this.toParsedSheet("categories", valueRanges[0]?.values ?? []),
          this.toParsedSheet("items", valueRanges[1]?.values ?? []),
        ],
      };
    } catch (error) {
      throw this.toGoogleSheetsError(error);
    }
  }

  private toGoogleSheetsError(error: unknown): BadRequestException {
    const status =
      error && typeof error === "object" && "code" in error
        ? Number((error as { code?: unknown }).code)
        : undefined;

    if (status === 403) {
      return new BadRequestException(
        "Google Sheets từ chối truy cập. Hãy chia sẻ file cho email service account với quyền Người xem.",
      );
    }
    if (status === 404) {
      return new BadRequestException(
        "Không tìm thấy Google Sheets. Hãy kiểm tra URL và quyền chia sẻ.",
      );
    }
    if (status === 400) {
      return new BadRequestException(
        "Không đọc được vùng dữ liệu Google Sheets. Hãy kiểm tra tên sheet và cấu hình range.",
      );
    }
    return new BadRequestException(
      "Không thể kết nối Google Sheets. Vui lòng kiểm tra cấu hình và thử lại.",
    );
  }

  private rangesForFirstTwoSheets(titles: string[]): string[] {
    if (titles.length < 2 || !titles[0] || !titles[1]) {
      throw new BadRequestException("Google Sheets phải có ít nhất 2 tab dữ liệu");
    }
    return titles.slice(0, 2).map((title) => `'${title.replace(/'/g, "''")}'!A1:Z`);
  }

  private formatValidationErrors(issues: ImportValidationIssue[]): string {
    const missingCategories = new Map<string, number[]>();
    for (const issue of issues) {
      if (issue.code !== "CATEGORY_KEY_NOT_FOUND") continue;
      const key = issue.message.match(/"([^"]+)"/)?.[1];
      if (!key) continue;
      const rows = missingCategories.get(key) ?? [];
      if (issue.row != null) rows.push(issue.row);
      missingCategories.set(key, rows);
    }
    if (
      missingCategories.size > 0 &&
      issues.every((issue) => issue.code === "CATEGORY_KEY_NOT_FOUND")
    ) {
      const details = Array.from(
        missingCategories,
        ([key, rows]) => `${key} (dòng ${rows.join(", ")})`,
      ).join("; ");
      return `Tab Dịch vụ đang dùng mã nhóm chưa có trong tab Nhóm dịch vụ: ${details}. Hãy thêm các mã nhóm này vào tab Nhóm dịch vụ rồi đồng bộ lại.`;
    }
    return issues
      .map((issue) => `${issue.sheet}:${issue.row ?? "?"}:${issue.column ?? "?"} ${issue.message}`)
      .join("; ");
  }

  private async previewValidRows(input: Parameters<ImportService["preview"]>[0]) {
    const firstPreview = await this.importService.preview(input);
    const validationErrors = firstPreview.validation.filter((issue) => issue.severity === "error");
    if (validationErrors.length === 0) return { preview: firstPreview, skippedIssues: [] };

    const blockingErrors = validationErrors.filter((issue) => issue.row == null);
    if (blockingErrors.length) {
      throw new BadRequestException(this.formatValidationErrors(blockingErrors));
    }

    const invalidRows = new Set(validationErrors.map((issue) => `${issue.sheet}:${issue.row}`));
    const categories = input.workbook.sheets.find((sheet) => sheet.name === "categories");
    const invalidCategoryKeys = new Set(
      (categories?.rows ?? [])
        .filter((row) => invalidRows.has(`categories:${row.rowNumber}`))
        .map((row) => this.sheetCellText(row.values.category_key).trim())
        .filter(Boolean),
    );
    const dependentItemIssues: ImportValidationIssue[] = [];
    const workbook = {
      ...input.workbook,
      sheets: input.workbook.sheets.map((sheet) => ({
        ...sheet,
        rows: sheet.rows.filter((row) => {
          const directlyInvalid = invalidRows.has(`${sheet.name}:${row.rowNumber}`);
          const categoryKey = this.sheetCellText(row.values.category_key).trim();
          const dependsOnInvalidCategory =
            sheet.name === "items" && invalidCategoryKeys.has(categoryKey);
          if (dependsOnInvalidCategory && !directlyInvalid) {
            dependentItemIssues.push({
              severity: "error",
              sheet: "items",
              row: row.rowNumber,
              column: "category_key",
              code: "CATEGORY_KEY_NOT_FOUND",
              message: `Mã nhóm "${categoryKey}" chưa có trong tab Nhóm dịch vụ`,
            });
          }
          return !directlyInvalid && !dependsOnInvalidCategory;
        }),
      })),
    };

    const cleanPreview = await this.importService.preview({ ...input, workbook });
    const remainingErrors = cleanPreview.validation.filter((issue) => issue.severity === "error");
    if (remainingErrors.length) {
      throw new BadRequestException(this.formatValidationErrors(remainingErrors));
    }
    return {
      preview: cleanPreview,
      skippedIssues: [...validationErrors, ...dependentItemIssues],
    };
  }

  private toParsedSheet(name: "categories" | "items", values: unknown[][]) {
    const [headers = [], ...rows] = values;
    const keys = headers.map((header) => this.normalizeHeader(this.sheetCellText(header)));
    return {
      name,
      rows: rows
        .map((row, index) => ({
          rowNumber: index + 2,
          values: Object.fromEntries(keys.map((key, columnIndex) => [key, row[columnIndex] ?? ""])),
        }))
        .filter((row) =>
          Object.values(row.values).some((value) => this.sheetCellText(value).trim().length > 0),
        ),
    };
  }

  private normalizeHeader(value: string): string {
    const normalized = this.stripVietnameseDiacritics(value)
      .trim()
      .toLowerCase()
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, "_");
    const aliases: Record<string, string> = {
      mã_danh_mục: "category_key",
      ma_danh_muc: "category_key",
      "tên_danh_mục_(tiếng_việt)": "name_vi",
      "ten_danh_muc_(tieng_viet)": "name_vi",
      "mô_tả_(tiếng_việt)": "description_vi",
      "mo_ta_(tieng_viet)": "description_vi",
      giá_mặc_định: "default_price",
      gia_mac_dinh: "default_price",
      đơn_vị_tiền_tệ: "currency",
      don_vi_tien_te: "currency",
      thứ_tự_hiển_thị: "sort_order",
      thu_tu_hien_thi: "sort_order",
      trạng_thái: "status",
      trang_thai: "status",
      mã_dịch_vụ: "item_key",
      ma_dich_vu: "item_key",
      "tên_dịch_vụ_(tiếng_việt)": "name_vi",
      "ten_dich_vu_(tieng_viet)": "name_vi",
      giá_riêng_để_trống_nếu_dùng_giá_mặc_định_của_danh_mục: "price_override",
      gia_rieng_de_trong_neu_dung_gia_mac_dinh_cua_danh_muc: "price_override",
      "cho_phép_nhập_số_lượng_true/false_hoặc_có/không": "quantity_enabled",
      "cho_phep_nhap_so_luong_true/false_hoac_co/khong": "quantity_enabled",
      số_lượng_tối_thiểu: "min_quantity",
      so_luong_toi_thieu: "min_quantity",
      số_lượng_tối_đa: "max_quantity",
      so_luong_toi_da: "max_quantity",
      "ten_(tieng_anh)": "name_en",
      "ten_danh_muc_(tieng_anh)": "name_en",
      "ten_dich_vu_(tieng_anh)": "name_en",
      "mo_ta_(tieng_anh)": "description_en",
      "ten_(tieng_trung)": "name_zh",
      "ten_danh_muc_(tieng_trung)": "name_zh",
      "ten_dich_vu_(tieng_trung)": "name_zh",
      "mo_ta_(tieng_trung)": "description_zh",
      "ten_(tieng_han)": "name_ko",
      "ten_danh_muc_(tieng_han)": "name_ko",
      "ten_dich_vu_(tieng_han)": "name_ko",
      "mo_ta_(tieng_han)": "description_ko",
      "ten_(tieng_nga)": "name_ru",
      "ten_danh_muc_(tieng_nga)": "name_ru",
      "ten_dich_vu_(tieng_nga)": "name_ru",
      "mo_ta_(tieng_nga)": "description_ru",
      "ten_(tieng_an_do)": "name_hi",
      "ten_(tieng_hindi)": "name_hi",
      "ten_danh_muc_(tieng_an_do)": "name_hi",
      "ten_danh_muc_(tieng_hindi)": "name_hi",
      "ten_dich_vu_(tieng_an_do)": "name_hi",
      "ten_dich_vu_(tieng_hindi)": "name_hi",
      "mo_ta_(tieng_an_do)": "description_hi",
      "mo_ta_(tieng_hindi)": "description_hi",
    };
    return aliases[normalized] ?? normalized;
  }

  private stripVietnameseDiacritics(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D");
  }

  private sheetCellText(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    return JSON.stringify(value);
  }
}
