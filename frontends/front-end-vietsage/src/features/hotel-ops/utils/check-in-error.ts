export function checkInRecovery(reason: string) {
  if (/không có quyền|chưa được cấp quyền|forbidden|permission|access.denied/i.test(reason)) {
    return { label: "Thiếu quyền nhận phòng", action: "permission" as const,
      guidance: "Nhờ quản lý kiểm tra quyền nhận phòng tại khách sạn này. Đổi phòng hoặc xử lý hóa đơn không khắc phục lỗi quyền." };
  }
  if (/hóa đơn|hoá đơn|folio|lượt lưu trú/i.test(reason)) {
    return { label: "Còn hồ sơ chưa đóng", action: "settlement" as const, guidance: "Kiểm tra khách đang ở và hóa đơn trước khi nhận khách mới." };
  }
  if (/dữ liệu|thay đổi|đồng bộ|đã.*nhận phòng|bị hủy|vắng mặt/i.test(reason)) {
    return { label: "Cần cập nhật đặt phòng", action: "refresh" as const, guidance: "Cập nhật trạng thái mới nhất trước khi thử lại. Thông tin khách đang nhập được giữ lại." };
  }
  if (/chưa sẵn sàng|mã QR|sức chứa/i.test(reason)) {
    return { label: "Cần kiểm tra phòng", action: "swap" as const, guidance: "Kiểm tra điều kiện phòng hoặc chọn phòng phù hợp khác." };
  }
  return { label: "Nhận phòng chưa thành công", action: "retry" as const, guidance: "Kiểm tra lại thông tin, cập nhật trạng thái rồi thử lại. Thông tin khách đang nhập được giữ lại." };
}

function extractErrorContext(error: unknown): {
  status?: number;
  code: string;
  detail: string;
  message: string;
  normalized: string;
} {
  const errObj = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const responseObj =
    errObj?.response && typeof errObj.response === "object"
      ? (errObj.response as Record<string, unknown>)
      : undefined;
  const directData =
    errObj?.data && typeof errObj.data === "object"
      ? (errObj.data as Record<string, unknown>)
      : responseObj?.data && typeof responseObj.data === "object"
        ? (responseObj.data as Record<string, unknown>)
        : undefined;
  const nestedData =
    directData?.data && typeof directData.data === "object"
      ? (directData.data as Record<string, unknown>)
      : undefined;
  const nestedError =
    directData?.error && typeof directData.error === "object"
      ? (directData.error as Record<string, unknown>)
      : responseObj?.error && typeof responseObj.error === "object"
        ? (responseObj.error as Record<string, unknown>)
        : undefined;

  const code =
    (typeof nestedData?.code === "string" ? nestedData.code : "") ||
    (typeof directData?.code === "string" ? directData.code : "") ||
    (typeof nestedError?.code === "string" ? nestedError.code : "") ||
    (typeof errObj?.code === "string" ? errObj.code : "");

  const detail =
    (typeof nestedData?.detail === "string" ? nestedData.detail : "") ||
    (typeof directData?.detail === "string" ? directData.detail : "") ||
    (typeof nestedData?.message === "string" ? nestedData.message : "") ||
    (typeof directData?.message === "string" ? directData.message : "");

  const message =
    error instanceof Error
      ? error.message
      : typeof errObj?.message === "string"
        ? errObj.message
        : String(error || "");

  const status = typeof errObj?.status === "number" ? errObj.status : undefined;
  const normalized = `${code} ${detail} ${message}`.trim().toUpperCase();
  return { status, code, detail, message, normalized };
}

export function formatFriendlyCheckInError(error: unknown): string {
  const { status, detail, message: msg, normalized } = extractErrorContext(error);

  if (status === 403 || /FORBIDDEN|PERMISSION_DENIED|ACCESS_DENIED|KHÔNG CÓ QUYỀN/.test(normalized)) {
    return "Tài khoản chưa được cấp quyền nhận phòng tại khách sạn này. Vui lòng nhờ quản lý kiểm tra quyền truy cập.";
  }

  if (normalized.includes("OVERDUE_STAY_HAS_UNPAID_FOLIO")) {
    return "Phòng đang còn lượt lưu trú quá hạn và hóa đơn chưa tất toán. Vui lòng thanh toán và trả phòng cũ trước khi nhận khách mới.";
  }

  if (normalized.includes("ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO")) {
    return "Phòng còn lượt lưu trú hoặc hóa đơn lưu trú chưa tất toán. Vui lòng kiểm tra trả phòng, đóng hóa đơn trước hoặc đổi phòng trống khác.";
  }

  if (normalized.includes("ROOM_NOT_READY_FOR_CHECK_IN")) {
    return "Phòng chưa sẵn sàng đón khách (đang có khách ở, bảo trì hoặc chưa dọn buồng). Vui lòng kiểm tra lại trạng thái phòng hoặc đổi phòng trống khác.";
  }

  if (normalized.includes("CHƯA CÓ QR") || normalized.includes("QR KHẢ DỤNG") || normalized.includes("ROOM_QR")) {
    return "Phòng chưa có mã QR khả dụng để kích hoạt hệ thống lưu trú. Vui lòng tạo mã QR cho phòng trước khi nhận phòng.";
  }

  if (normalized.includes("ROOM_CAPACITY_OVERFLOW")) {
    return "Số lượng khách nhận phòng vượt quá sức chứa tối đa của hạng phòng này.";
  }

  if (normalized.includes("STALE_RESERVATION_RECORD") || normalized.includes("STALE_ROOM_ASSIGNMENT")) {
    return "Dữ liệu đặt phòng vừa được thay đổi bởi thao tác khác. Vui lòng làm mới dữ liệu để cập nhật thông tin mới nhất.";
  }

  if (
    normalized.includes("EARLY_CHECK_IN_NOT_ALLOWED") ||
    normalized.includes("EARLY_CHECK_IN_CONFIRMATION_REQUIRED")
  ) {
    return "Chưa tới ngày nhận phòng dự kiến. Đơn đặt phòng này có ngày đến trong tương lai. Vui lòng xác nhận nhận phòng sớm nếu phòng đã sẵn sàng.";
  }

  if (normalized.includes("LATE_CHECK_IN") || normalized.includes("OVERDUE_CHECK_IN")) {
    return "Đơn đặt phòng đã quá hạn nhận phòng dự kiến. Vui lòng xác nhận để tiếp tục làm thủ tục nhận phòng trễ cho khách.";
  }

  if (
    normalized.includes("CHECKED_IN_RESERVATION_MISSING_STAY") ||
    normalized.includes("CHECKED_IN_RESERVATION_MISSING_FOLIO")
  ) {
    return "Đơn đặt phòng đã ở trạng thái nhận phòng nhưng hồ sơ lưu trú chưa được đồng bộ hoàn tất. Vui lòng làm mới trang để cập nhật lại hệ thống.";
  }

  if (
    normalized.includes("ALREADY_CHECKED_IN") ||
    (normalized.includes("CHECKED_IN") && !normalized.includes("EARLY"))
  ) {
    return "Đơn đặt phòng này đã được hoàn tất nhận phòng trước đó. Vui lòng tải lại trang để xem thông tin lưu trú hiện tại.";
  }

  if (
    normalized.includes("CANCELLED") ||
    normalized.includes("RESERVATION_CANCELLED")
  ) {
    return "Đơn đặt phòng này đã bị hủy trước đó. Không thể làm thủ tục nhận phòng. Vui lòng tạo đơn đặt phòng mới nếu khách tiếp tục lưu trú.";
  }

  if (normalized.includes("NO_SHOW")) {
    return "Đơn đặt phòng này đã được ghi nhận vắng mặt (No-show). Không thể nhận phòng. Vui lòng kiểm tra lại trạng thái hoặc tạo đơn mới.";
  }

  if (normalized.includes("IDEMPOTENT")) {
    return "Thao tác nhận phòng đã được xử lý thành công trước đó (yêu cầu trùng lặp). Dữ liệu lưu trú đã được đồng bộ an toàn.";
  }

  if (normalized.includes("RESERVATION_NOT_READY_FOR_CHECK_IN")) {
    return "Đặt phòng chưa sẵn sàng đón khách (chưa được gán phòng hoặc trạng thái phòng vừa thay đổi). Vui lòng tải lại dữ liệu để cập nhật trạng thái mới nhất.";
  }

  if (
    normalized.includes("ROOM_CHECK_IN_CONFLICT") ||
    normalized.includes("DỮ LIỆU ĐẶT PHÒNG ĐÃ THAY ĐỔI") ||
    normalized.includes("409") ||
    normalized.includes("CONFLICT")
  ) {
    return "Xung đột dữ liệu nhận phòng. Trạng thái phòng hoặc đơn đặt phòng vừa bị thay đổi bởi thao tác khác. Vui lòng tải lại dữ liệu để cập nhật trạng thái mới nhất.";
  }

  return detail || msg || "Đã có lỗi xảy ra khi nhận phòng. Vui lòng thử lại.";
}

export function formatFriendlyHotelOpsError(error: unknown): string {
  const { normalized } = extractErrorContext(error);

  if (normalized.includes("ROOM_RESERVATION_OVERLAP")) {
    return "Phòng đã có đặt phòng trùng thời gian. Vui lòng chọn phòng trống khác hoặc cập nhật lịch.";
  }
  if (normalized.includes("ROOM_TYPE_MISMATCH")) {
    return "Phòng được chọn không cùng hạng với đặt phòng. Vui lòng chọn phòng cùng hạng.";
  }
  if (normalized.includes("MISSING_AGREED_ROOM_RATE_SNAPSHOT")) {
    return "Đặt phòng chưa có giá phòng đã chốt. Vui lòng cập nhật giá trước khi xem kế hoạch phòng.";
  }
  if (normalized.includes("OVERDUE_STAY_HAS_UNPAID_FOLIO")) {
    return "Phòng đang còn lượt lưu trú quá hạn và hóa đơn chưa tất toán. Vui lòng thanh toán và trả phòng cũ trước khi nhận khách mới.";
  }

  return formatFriendlyCheckInError(error);
}

export function isEarlyCheckInError(error: unknown): boolean {
  const { normalized } = extractErrorContext(error);
  return (
    normalized.includes("EARLY_CHECK_IN_NOT_ALLOWED") ||
    normalized.includes("EARLY_CHECK_IN_CONFIRMATION_REQUIRED")
  );
}

export function isLateCheckInError(error: unknown): boolean {
  const { normalized } = extractErrorContext(error);
  return normalized.includes("LATE_CHECK_IN") || normalized.includes("OVERDUE_CHECK_IN");
}

export function isConflictOrStaleError(error: unknown): boolean {
  const { normalized } = extractErrorContext(error);
  return (
    normalized.includes("ROOM_CHECK_IN_CONFLICT") ||
    normalized.includes("RESERVATION_NOT_READY_FOR_CHECK_IN") ||
    normalized.includes("ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO") ||
    normalized.includes("STALE_RESERVATION_RECORD") ||
    normalized.includes("STALE_ROOM_ASSIGNMENT") ||
    normalized.includes("STALE") ||
    normalized.includes("CONFLICT") ||
    normalized.includes("409") ||
    /DỮ LIỆU.*THAY ĐỔI|PHIÊN KHÁC|XUNG ĐỘT/.test(normalized)
  );
}

export function isAlreadyCheckedInError(error: unknown): boolean {
  const { normalized } = extractErrorContext(error);
  return (
    normalized.includes("ALREADY_CHECKED_IN") ||
    normalized.includes("CHECKED_IN_RESERVATION_MISSING") ||
    (normalized.includes("CHECKED_IN") && !normalized.includes("EARLY"))
  );
}

export function isCancelledReservationError(error: unknown): boolean {
  const { normalized } = extractErrorContext(error);
  return normalized.includes("CANCELLED");
}
