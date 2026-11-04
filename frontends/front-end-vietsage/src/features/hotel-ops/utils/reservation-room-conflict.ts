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
}: {
  roomId: string;
  reservationRoomId?: string | null;
  liveRoom?: LiveRoom;
  fallbackStay?: ReservationStayConflict | null;
}): ReservationStayConflict | null {
  if (!liveRoom) return roomId === reservationRoomId ? fallbackStay ?? null : null;
  const stay = liveRoom.activeStay;
  if (!stay?.id || stay.status?.toUpperCase() === "CHECKED_OUT") return null;
  return {
    stayId: stay.id,
    guestName: stay.guestDisplayName || "Khách đang lưu trú",
    endDate: stay.plannedCheckOutAt || null,
    status: stay.status || "OCCUPIED",
    phone: stay.guestPhone || null,
  };
}
