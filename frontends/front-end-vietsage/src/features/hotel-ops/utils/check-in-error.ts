export function formatFriendlyCheckInError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error || "");
  const normalized = msg.toUpperCase();

  if (normalized.includes("EARLY_CHECK_IN_NOT_ALLOWED")) {
    return "Chưa tới ngày nhận phòng dự kiến. Đơn đặt phòng này có ngày đến trong tương lai. Vui lòng xác nhận nhận phòng sớm nếu phòng đã sẵn sàng.";
  }

  if (normalized.includes("LATE_CHECK_IN") || normalized.includes("OVERDUE_CHECK_IN")) {
    return "Đơn đặt phòng đã quá hạn nhận phòng dự kiến. Vui lòng xác nhận để tiếp tục làm thủ tục nhận phòng trễ cho khách.";
  }

  if (
    normalized.includes("ROOM_CHECK_IN_CONFLICT") ||
    normalized.includes("409") ||
    normalized.includes("CONFLICT")
  ) {
    return "Xung đột dữ liệu nhận phòng. Trạng thái phòng hoặc đơn đặt phòng vừa bị thay đổi bởi thao tác khác. Vui lòng tải lại dữ liệu để cập nhật trạng thái mới nhất.";
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

  if (normalized.includes("ROOM_NOT_READY_FOR_CHECK_IN")) {
    return "Phòng chưa sẵn sàng để đón khách (đang bảo trì hoặc chưa dọn dẹp). Vui lòng kiểm tra lại trạng thái phòng hoặc phân bổ phòng trống khác.";
  }

  if (normalized.includes("RESERVATION_NOT_READY_FOR_CHECK_IN")) {
    return "Đặt phòng chưa sẵn sàng đón khách (chưa được gán phòng hoặc trạng thái phòng vừa thay đổi). Vui lòng tải lại dữ liệu để cập nhật trạng thái mới nhất.";
  }

  if (normalized.includes("ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO")) {
    return "Phòng hiện đang có lượt lưu trú khác đang hoạt động. Vui lòng hoàn tất trả phòng cho khách trước hoặc phân bổ phòng trống khác.";
  }

  return msg || "Đã có lỗi xảy ra khi nhận phòng. Vui lòng thử lại.";
}

export function isEarlyCheckInError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  return msg.toUpperCase().includes("EARLY_CHECK_IN_NOT_ALLOWED");
}

export function isLateCheckInError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  const upper = msg.toUpperCase();
  return upper.includes("LATE_CHECK_IN") || upper.includes("OVERDUE_CHECK_IN");
}

export function isConflictOrStaleError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  const upper = msg.toUpperCase();
  return (
    upper.includes("ROOM_CHECK_IN_CONFLICT") ||
    upper.includes("RESERVATION_NOT_READY_FOR_CHECK_IN") ||
    upper.includes("ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO") ||
    upper.includes("CONFLICT") ||
    upper.includes("409")
  );
}

export function isAlreadyCheckedInError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  const upper = msg.toUpperCase();
  return (
    upper.includes("ALREADY_CHECKED_IN") ||
    upper.includes("CHECKED_IN_RESERVATION_MISSING") ||
    (upper.includes("CHECKED_IN") && !upper.includes("EARLY"))
  );
}

export function isCancelledReservationError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  return msg.toUpperCase().includes("CANCELLED");
}
