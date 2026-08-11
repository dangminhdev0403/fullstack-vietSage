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
    const status = typeof error.status === "number" ? error.status : undefined;
    const detail = nestedDetail(error.data);
    if (detail) return status ? `[Lỗi ${status}] ${detail}` : detail;

    if (isRecord(error.data)) {
      if (typeof error.data.message === "string" && error.data.message.trim()) {
        return status ? `[Lỗi ${status}] ${error.data.message}` : error.data.message;
      }
      if (Array.isArray(error.data.message) && error.data.message.length > 0) {
        return status ? `[Lỗi ${status}] ${error.data.message.join(", ")}` : error.data.message.join(", ");
      }
    }

    if (
      typeof error.message === "string" &&
      error.message.trim() &&
      error.message !== "BAD_REQUEST"
    ) {
      return status ? `[Lỗi ${status}] ${error.message}` : error.message;
    }

    if (status === 404) return "[Lỗi 404] Không tìm thấy Google Sheets hoặc tài nguyên (404 Not Found).";
    if (status === 403) return "[Lỗi 403] Google Sheets từ chối truy cập hoặc không có quyền (403 Forbidden).";
    if (status) return `[Lỗi ${status}] Yêu cầu đồng bộ thất bại với mã ${status}.`;
  }

  if (
    error instanceof Error &&
    error.message &&
    error.message !== "BAD_REQUEST"
  ) {
    if (
      /network|failed to fetch|fetch failed|connection/i.test(error.message)
    ) {
      return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng rồi thử lại.";
    }
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
