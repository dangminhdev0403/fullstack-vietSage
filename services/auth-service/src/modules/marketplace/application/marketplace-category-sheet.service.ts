import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import crypto from "node:crypto";
import { google } from "googleapis";
import { ImportService } from "../../../common/import/import.service";
import { ParsedImportRow, ParsedImportWorkbook } from "../../../common/import/import.types";

const MAX_ROWS = 2000;

@Injectable()
export class MarketplaceCategorySheetService {
  constructor(private readonly importService: ImportService) {}

  extractSpreadsheetId(url: string): string {
    if (!url) {
      throw new BadRequestException("URL Google Sheets không được để trống");
    }
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match?.[1]) {
      return match[1];
    }
    if (/^[a-zA-Z0-9_-]{20,100}$/.test(url.trim())) {
      return url.trim();
    }
    throw new BadRequestException(
      "URL Google Sheets không hợp lệ. Vui lòng kiểm tra lại URL có định dạng https://docs.google.com/spreadsheets/d/...",
    );
  }

  computeWorkbookHash(workbook: ParsedImportWorkbook): string {
    const dataString = JSON.stringify(workbook.sheets);
    return crypto.createHash("sha256").update(dataString).digest("hex");
  }

  async preview(spreadsheetUrl: string, actorUserId: string) {
    const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);
    const workbook = await this.readWorkbook(spreadsheetId);
    const workbookHash = this.computeWorkbookHash(workbook);

    const previewResult = await this.importService.preview({
      type: "marketplace-categories",
      mode: "replace",
      context: { actorUserId },
      workbook,
    });

    return {
      workbookHash,
      summary: previewResult.summary,
      validation: previewResult.validation,
      diff: previewResult.diff,
    };
  }

  async commit(spreadsheetUrl: string, expectedHash: string, actorUserId: string) {
    const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);
    const workbook = await this.readWorkbook(spreadsheetId);
    const currentHash = this.computeWorkbookHash(workbook);

    if (currentHash !== expectedHash) {
      throw new ConflictException(
        "Dữ liệu trên Google Sheets đã bị thay đổi kể từ lần xem trước. Vui lòng xem trước lại trước khi áp dụng.",
      );
    }

    const previewResult = await this.importService.preview({
      type: "marketplace-categories",
      mode: "replace",
      context: { actorUserId },
      workbook,
    });

    const hasErrors =
      previewResult.summary.errors > 0 ||
      previewResult.validation.some((issue) => issue.severity === "error");

    if (hasErrors) {
      throw new BadRequestException("Vẫn còn lỗi dữ liệu, không thể áp dụng thay đổi.");
    }

    const commitResult = await this.importService.commit(previewResult);
    return { summary: commitResult.summary };
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

      const firstSheetProperties = (metadata.data.sheets ?? [])
        .map((s) => s.properties)
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];

      if (!firstSheetProperties?.title) {
        throw new BadRequestException("Google Sheets không chứa tab dữ liệu nào");
      }

      const sheetTitle = firstSheetProperties.title;
      const range = `'${sheetTitle.replace(/'/g, "''")}'!A1:Z`;

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: "UNFORMATTED_VALUE",
      });

      const values = response.data.values ?? [];
      if (values.length < 2) {
        throw new BadRequestException(
          "Sheet không có dữ liệu hàng (yêu cầu hàng tiêu đề và ít nhất 1 dòng dữ liệu)",
        );
      }

      const headers = (values[0] ?? []).map((h) => String(h).trim());
      const parsedRows: ParsedImportRow[] = [];

      for (let i = 1; i < values.length; i++) {
        const row = values[i] ?? [];
        const isRowEmpty = row.every((cell) => cell == null || String(cell).trim() === "");
        if (isRowEmpty) continue;

        const rowValues: Record<string, unknown> = {};
        headers.forEach((header, colIdx) => {
          if (header) {
            rowValues[header] = row[colIdx] ?? "";
          }
        });

        parsedRows.push({
          rowNumber: i + 1,
          values: rowValues,
        });
      }

      if (parsedRows.length > MAX_ROWS) {
        throw new BadRequestException(
          `Số lượng dòng trong file Google Sheets vượt quá giới hạn ${MAX_ROWS} dòng`,
        );
      }

      return {
        fileName: `google-sheet:${spreadsheetId}`,
        sheets: [
          {
            name: "categories",
            rows: parsedRows,
          },
        ],
      };
    } catch (error) {
      throw this.toGoogleSheetsError(error);
    }
  }

  private toGoogleSheetsError(error: unknown): Error {
    if (
      error instanceof ForbiddenException ||
      error instanceof NotFoundException ||
      error instanceof BadRequestException ||
      error instanceof ConflictException
    ) {
      return error;
    }

    const status =
      error && typeof error === "object" && "code" in error
        ? Number((error as { code?: unknown }).code)
        : error && typeof error === "object" && "status" in error
          ? Number((error as { status?: unknown }).status)
          : undefined;

    if (status === 403) {
      return new ForbiddenException(
        "Google Sheets từ chối truy cập (403). Hãy chia sẻ file cho email service account với quyền Người xem.",
      );
    }
    if (status === 404) {
      return new NotFoundException(
        "Không tìm thấy Google Sheets (404). Hãy kiểm tra URL và quyền chia sẻ.",
      );
    }
    if (status === 400) {
      return new BadRequestException(
        "Không đọc được vùng dữ liệu Google Sheets (400). Hãy kiểm tra tên sheet và cấu hình range.",
      );
    }
    return new BadRequestException(
      `Không thể kết nối Google Sheets${status ? ` (${status})` : ""}. Vui lòng kiểm tra cấu hình và thử lại.`,
    );
  }
}
