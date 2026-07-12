import { BadRequestException, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { google } from "googleapis";
import { AppLogger } from "../../../../common/logging/app-logger.service";
import { ImportService } from "../../../../common/import/import.service";
import type { ParsedImportWorkbook } from "../../../../common/import/import.types";
import { PrismaService } from "../../../../prisma/prisma.service";

const CATEGORY_SHEET = "Nhóm dịch vụ";
const ITEM_SHEET = "Danh sách dịch vụ";
const SYSTEM_ACTOR_USER_ID = "google-sheets-sync";

type SyncSummary = {
  categoriesProcessed: number;
  itemsProcessed: number;
  inserted: number;
  updated: number;
  skipped: number;
  durationMs: number;
  errors: string[];
};

@Injectable()
export class GoogleSheetsServiceCatalogSyncService {
  private isSyncing = false;

  constructor(
    private readonly importService: ImportService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async syncHotel(hotelId: string, actorUserId: string): Promise<SyncSummary> {
    return this.runSync(hotelId, actorUserId);
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
      const hotels = await this.prisma.hotel.findMany({ select: { id: true } });
      for (const hotel of hotels) {
        await this.runSync(hotel.id, SYSTEM_ACTOR_USER_ID, false);
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
    actorUserId: string,
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
      const workbook = await this.readWorkbook();
      this.logger.info("Google Sheets sync validation started", {
        module: "hotels",
        service: GoogleSheetsServiceCatalogSyncService.name,
        event: "SERVICE_CATALOG_SYNC_VALIDATION",
        hotelId,
      });

      const preview = await this.importService.preview({
        type: "service-catalog",
        mode: "upsert",
        context: { hotelId, actorUserId, systemSync: actorUserId === SYSTEM_ACTOR_USER_ID },
        workbook,
      });

      const validationErrors = preview.validation.filter((issue) => issue.severity === "error");
      if (validationErrors.length) {
        errors.push(
          ...validationErrors.map(
            (issue) =>
              `${issue.sheet}:${issue.row ?? "?"}:${issue.column ?? "?"} ${issue.code} - ${issue.message}`,
          ),
        );
        throw new BadRequestException(errors.join("; "));
      }

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
        durationMs,
        errors,
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

  private async readWorkbook(): Promise<ParsedImportWorkbook> {
    const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
    if (!sheetId) throw new BadRequestException("GOOGLE_SHEET_ID is not configured");
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      throw new BadRequestException("GOOGLE_APPLICATION_CREDENTIALS is not configured");
    }

    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges: [CATEGORY_SHEET, ITEM_SHEET],
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    return {
      fileName: `google-sheet:${sheetId}`,
      sheets: (response.data.valueRanges ?? []).map((range, index) =>
        this.toParsedSheet(index === 0 ? "categories" : "items", range.values ?? []),
      ),
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
