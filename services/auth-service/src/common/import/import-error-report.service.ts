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
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
}
