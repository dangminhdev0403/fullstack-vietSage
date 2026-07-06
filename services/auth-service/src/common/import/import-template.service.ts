import { Injectable } from "@nestjs/common";
import { ImportWorkbookSchema } from "./import.types";

@Injectable()
export class ImportTemplateService {
  toCsvSheets(schema: ImportWorkbookSchema): Record<string, string> {
    return Object.fromEntries(
      schema.sheets.map((sheet) => [
        sheet.name,
        [
          sheet.columns.map((column) => column.header ?? column.key).join(","),
          sheet.columns
            .map((column) => this.example(column.example ?? column.defaultValue))
            .join(","),
        ].join("\n"),
      ]),
    );
  }

  private example(value: unknown): string {
    const text = this.toCellText(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private toCellText(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    return JSON.stringify(value);
  }
}
