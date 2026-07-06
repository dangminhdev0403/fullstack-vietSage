import { Injectable } from "@nestjs/common";
import { ImportValidationIssue } from "./import.types";

@Injectable()
export class ImportErrorReportService {
  toCsv(issues: ImportValidationIssue[]): string {
    const rows = [
      ["sheet", "row", "column", "severity", "code", "message", "value"],
      ...issues.map((issue) => [
        issue.sheet,
        issue.row ?? "",
        issue.column ?? "",
        issue.severity,
        issue.code,
        issue.message,
        issue.value ?? "",
      ]),
    ];

    return rows.map((row) => row.map((value) => this.csv(value)).join(",")).join("\n");
  }

  private csv(value: unknown): string {
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
