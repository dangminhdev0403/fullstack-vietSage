import type { HotelRoomSummary } from "@/features/hotel-ops/types/hotel-ops-contract";

export function getRoomNumber(room: HotelRoomSummary): string {
  return room.roomNumber?.trim() || "--";
}

export function getQrStatus(room: HotelRoomSummary): string {
  return (room.qr?.status ?? room.qrStatus ?? "INACTIVE").trim().toUpperCase();
}

export function getQrValue(room: HotelRoomSummary): string | null {
  return (
    room.qr?.publicCode?.trim() ||
    room.publicCode?.trim() ||
    room.qr?.code?.trim() ||
    room.qr?.qrCode?.trim() ||
    room.qrCode?.trim() ||
    null
  );
}

export function getGuestQrUrl(
  room: HotelRoomSummary,
  origin = "",
): string | null {
  const qrCode = getQrValue(room);
  if (!qrCode) {
    return null;
  }

  const path = `/g/${encodeURIComponent(qrCode)}`;
  return origin ? `${origin.replace(/\/$/, "")}${path}` : path;
}
