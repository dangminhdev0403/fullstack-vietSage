export function formatFriendlyCheckInError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error || "");
  if (msg.includes("EARLY_CHECK_IN_NOT_ALLOWED")) {
    return "Chưa tới ngày nhận phòng. Đơn đặt phòng này dự kiến nhận phòng vào ngày mai hoặc tương lai.";
  }
  if (msg.includes("ROOM_NOT_READY_FOR_CHECK_IN")) {
    return "Phòng chưa sẵn sàng để nhận khách (đang bảo trì hoặc có vấn đề kỹ thuật).";
  }
  if (msg.includes("RESERVATION_NOT_READY_FOR_CHECK_IN")) {
    return "Đặt phòng chưa được gán phòng hoặc chưa ở trạng thái sẵn sàng đón khách.";
  }
  if (msg.includes("ROOM_ALREADY_HAS_ACTIVE_STAY_OR_FOLIO")) {
    return "Phòng hiện đang có lượt lưu trú khác đang hoạt động.";
  }
  if (msg.includes("ROOM_CHECK_IN_CONFLICT")) {
    return "Xung đột nhận phòng. Trạng thái phòng vừa bị thay đổi bởi thao tác khác.";
  }
  return msg || "Đã có lỗi xảy ra khi nhận phòng.";
}
