export type ReservationStayConflict = {
  stayId: string;
  guestName: string;
  endDate?: string | null;
  status?: string | null;
  phone?: string | null;
};

type LiveRoom = {
  activeStay?: {
    id: string;
    status?: string | null;
    guestDisplayName?: string | null;
    plannedCheckOutAt?: string | null;
    guestPhone?: string | null;
  } | null;
};

export function resolveReservationRoomConflict({
  roomId,
  reservationRoomId,
  liveRoom,
  fallbackStay,
  checkInDate,
  checkOutDate: _checkOutDate,
}: {
  roomId: string;
  reservationRoomId?: string | null;
  liveRoom?: LiveRoom;
  fallbackStay?: ReservationStayConflict | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
}): ReservationStayConflict | null {
  if (!liveRoom) return roomId === reservationRoomId ? fallbackStay ?? null : null;
  const stay = liveRoom.activeStay;
  if (!stay?.id || stay.status?.toUpperCase() === "CHECKED_OUT") return null;

  // Nếu có thông tin ngày nhận phòng dự kiến của đơn đặt trước:
  // Nếu ngày nhận phòng diễn ra sau ngày khách cũ trả phòng -> không xung đột
  if (checkInDate && stay.plannedCheckOutAt) {
    const resCheckInTime = new Date(checkInDate).getTime();
    const stayCheckOutTime = new Date(stay.plannedCheckOutAt).getTime();

    if (!Number.isNaN(resCheckInTime) && !Number.isNaN(stayCheckOutTime)) {
      if (resCheckInTime >= stayCheckOutTime) {
        return null;
      }
    } else {
      const resInYmd = checkInDate.includes("T") ? checkInDate.slice(0, 10) : checkInDate;
      const stayOutYmd = stay.plannedCheckOutAt.includes("T")
        ? stay.plannedCheckOutAt.slice(0, 10)
        : stay.plannedCheckOutAt;
      if (resInYmd && stayOutYmd && resInYmd >= stayOutYmd) {
        return null;
      }
    }
  }

  return {
    stayId: stay.id,
    guestName: stay.guestDisplayName || "Khách đang lưu trú",
    endDate: stay.plannedCheckOutAt || null,
    status: stay.status || "OCCUPIED",
    phone: stay.guestPhone || null,
  };
}
