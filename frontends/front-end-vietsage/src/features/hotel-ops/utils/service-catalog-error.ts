function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedDetail(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.detail === "string" && value.detail.trim()) return value.detail.trim();
  return nestedDetail(value.data) ?? nestedDetail(value.error);
}

export function getServiceCatalogErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    const detail = nestedDetail(error.data);
    if (detail) return detail;
  }
  if (error instanceof Error && error.message && error.message !== "BAD_REQUEST") {
    return error.message;
  }
  return "Vui lòng kiểm tra dữ liệu trong hai tab đầu của Google Sheets rồi thử lại.";
}