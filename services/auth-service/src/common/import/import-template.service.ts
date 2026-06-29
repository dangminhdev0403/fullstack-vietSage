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
    if (value === undefined || value === null) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
}
