function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedDetail(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.detail === "string" && value.detail.trim())
    return value.detail.trim();
  return nestedDetail(value.data) ?? nestedDetail(value.error);
}

export function getServiceCatalogErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    const detail = nestedDetail(error.data);
    if (detail) return detail;
  }
  if (
    error instanceof Error &&
    error.message &&
    error.message !== "BAD_REQUEST"
  ) {
    return error.message;
  }
  return "Vui lòng kiểm tra dữ liệu trong hai tab đầu của Google Sheets rồi thử lại.";
}

type SyncNoticeInput = {
  inserted: number;
  updated: number;
  disabled: number;
  unchanged: number;
  skippedRows?: number;
  skipped?: number;
  warnings: string[];
};

export function getServiceCatalogSyncNotice(result: SyncNoticeInput) {
  const skippedRows = result.skippedRows ?? result.skipped ?? 0;
  if (skippedRows > 0) {
    return {
      icon: "warning" as const,
      title: "Đồng bộ một phần",
      text: `Đã thêm ${result.inserted}, cập nhật ${result.updated}, vô hiệu hóa ${result.disabled}, giữ nguyên ${result.unchanged}, bỏ qua ${skippedRows} dòng lỗi. ${result.warnings.join(" ")}`,
    };
  }
  return {
    icon: "success" as const,
    title: "Đồng bộ Google Sheets thành công.",
    text: `Đã thêm ${result.inserted}, cập nhật ${result.updated}, vô hiệu hóa ${result.disabled}, giữ nguyên ${result.unchanged}.`,
  };
}
