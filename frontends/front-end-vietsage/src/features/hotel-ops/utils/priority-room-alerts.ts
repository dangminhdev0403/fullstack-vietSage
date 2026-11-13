import type { SimulatedBookingItem } from "@/features/channel-manager/types/channel-manager.types";
import type {
  HotelArrival,
  HotelPriorityAlertItem,
  HotelPriorityAlertsResponse,
  HotelReservationSummary,
  HotelRoomSummary,
  HotelStaySummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";
import { toVietnamYmd } from "@/libs/vietnam-temporal";

export type PriorityRoomBucket = "overdue" | "urgent" | "due";

export type PriorityActionKind =
  | "check-in"
  | "assign-room"
  | "mark-ready"
  | "manage-stay"
  | "resolve-room";

export type PriorityRoomAlertItem = {
  id: string;
  bucket: PriorityRoomBucket;
  priorityRank: number;
  badgeLabel: string;
  reasonText: string;
  readinessLabel: string;
  actionKind: PriorityActionKind;
  actionLabel: string;
  roomId: string | null;
  roomUpdatedAt?: string | null;
  roomNumber: string | null;
  floorLabel: string | null;
  roomTypeName: string | null;
  guestName: string;
  guestPhone: string | null;
  guestCount: number | null;
  code: string | null;
  groupCode: string | null;
  sourceLabel: string | null;
  scheduleText: string;
  sortTimestamp: number;
  reservationId?: string | null;
  stayId?: string | null;
  room: HotelRoomSummary | null;
  arrival: HotelArrival | null;
  otaBooking: SimulatedBookingItem | null;
  fallbackReservation: HotelReservationSummary | null;
};

type NormalizedPhysicalStatus =
  | "available"
  | "occupied"
  | "processing"
  | "maintenance"
  | "blocked";

type ReservationCandidate = {
  key: string;
  reservationId: string;
  code: string | null;
  groupCode: string | null;
  guestName: string;
  guestPhone: string | null;
  guestCount: number | null;
  roomId: string | null;
  roomNumber: string | null;
  checkInYmd: string;
  checkOutYmd: string;
  plannedCheckInAt: string | null;
  plannedCheckOutAt: string | null;
  sourceLabel: string | null;
  arrival: HotelArrival | null;
  otaBooking: SimulatedBookingItem | null;
  fallbackReservation: HotelReservationSummary | null;
};

const ACTIVE_RESERVATION_STATUSES = new Set(["CONFIRMED", "ARRIVAL_READY"]);
const ACTIVE_STAY_STATUSES = new Set(["ACTIVE", "CHECKED_IN", "CHECKOUT_PENDING"]);
const MS_PER_DAY = 86_400_000;

function normalizeStatusToken(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function normalizeRoomPhysicalStatus(room: HotelRoomSummary): NormalizedPhysicalStatus {
  const raw = normalizeStatusToken(room.physicalStatus ?? room.status);
  if (
    raw === "CLEANING" ||
    raw === "PROCESSING" ||
    raw === "DIRTY" ||
    raw === "INSPECTING" ||
    raw === "WAITING_CLEAN"
  ) {
    return "processing";
  }
  if (raw === "MAINTENANCE") return "maintenance";
  if (raw === "BLOCKED" || raw === "OUT_OF_ORDER" || raw === "HOLD") return "blocked";
  if (raw === "OCCUPIED" || raw === "IN_HOUSE") return "occupied";
  if (hasActiveStay(room.activeStay)) return "occupied";
  return "available";
}

function hasActiveStay(stay: HotelStaySummary | null | undefined): stay is HotelStaySummary {
  if (!stay || stay.checkedOutAt) return false;
  const status = normalizeStatusToken(stay.status);
  return !status || ACTIVE_STAY_STATUSES.has(status);
}

function extractVnYmd(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return toVietnamYmd(trimmed) || "";
}

function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T14:00:00+07:00`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function calendarDaysDiff(earlierYmd: string, laterYmd: string): number {
  if (!earlierYmd || !laterYmd) return 0;
  const start = Date.parse(`${earlierYmd}T00:00:00+07:00`);
  const end = Date.parse(`${laterYmd}T00:00:00+07:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / MS_PER_DAY);
}

function formatVnShortDate(value: string | null | undefined): string {
  const ymd = extractVnYmd(value);
  if (!ymd) return "--/--";
  const [, month, day] = ymd.split("-");
  return `${day}/${month}`;
}

function formatVnDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return formatVnShortDate(trimmed);
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatOverdueDuration(targetMs: number | null, nowMs: number): string {
  if (targetMs === null || targetMs >= nowMs) return "Quá hạn";
  const diffMinutes = Math.max(1, Math.floor((nowMs - targetMs) / 60_000));
  if (diffMinutes < 60) return `Quá ${diffMinutes} phút`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Quá ${diffHours} giờ`;
  const diffDays = Math.floor(diffHours / 24);
  return `Quá ${diffDays} ngày`;
}

function describeScheduleRange(start: string | null | undefined, end: string | null | undefined): string {
  const startLabel = formatVnDateTime(start);
  const endLabel = formatVnDateTime(end);
  if (startLabel === "--" && endLabel === "--") return "Chưa rõ lịch";
  if (endLabel === "--") return startLabel;
  return `${startLabel} -> ${endLabel}`;
}

function describeConflictCode(code: string | null | undefined): string {
  switch (normalizeStatusToken(code)) {
    case "OVERDUE_STAY_CONFLICT":
      return "Quá hạn trả phòng cần xử lý";
    case "NON_SELLABLE_OCCUPIED_CONFLICT":
      return "Phòng đang tạm ngưng nhưng vẫn còn khách ở";
    case "AVAILABLE_WITH_ACTIVE_STAY_CONFLICT":
      return "Trạng thái phòng chưa khớp hồ sơ khách đang ở";
    case "OCCUPIED_WITHOUT_ACTIVE_STAY_CONFLICT":
      return "Phòng báo có khách nhưng thiếu hồ sơ lưu trú";
    default:
      return "Trạng thái phòng cần đối soát";
  }
}

function describePhysicalReadiness(status: NormalizedPhysicalStatus): string {
  switch (status) {
    case "available":
      return "Phòng sạch, sẵn sàng đón";
    case "processing":
      return "Phòng đang chờ dọn buồng";
    case "occupied":
      return "Phòng đang có khách lưu trú";
    case "maintenance":
      return "Phòng đang bảo trì";
    case "blocked":
      return "Phòng đang khóa / tạm ngưng";
  }
}

function resolveGuestDisplayName(name: string | null | undefined): string {
  const cleaned = (name ?? "").trim();
  return cleaned || "Khách đặt phòng";
}

function formatFloorLabel(floor: string | null | undefined): string | null {
  const raw = (floor ?? "").trim();
  if (!raw) return null;
  return raw.toLowerCase().startsWith("tầng") ? raw : `Tầng ${raw}`;
}

function buildReservationCandidates(params: {
  rooms: HotelRoomSummary[];
  arrivalsList: HotelArrival[];
  otaBookings: SimulatedBookingItem[];
}): {
  candidates: ReservationCandidate[];
  roomById: Map<string, HotelRoomSummary>;
} {
  const roomById = new Map<string, HotelRoomSummary>();
  const roomByNumber = new Map<string, HotelRoomSummary>();

  for (const room of params.rooms) {
    roomById.set(room.id, room);
    if (room.roomNumber) {
      roomByNumber.set(room.roomNumber.trim().toUpperCase(), room);
    }
  }

  const otaByReservationId = new Map<string, SimulatedBookingItem>();
  for (const booking of params.otaBookings) {
    if (normalizeStatusToken(booking.status) === "CANCELLED") continue;
    const stayStatus = normalizeStatusToken(booking.stayStatus);
    if (stayStatus && stayStatus !== "PENDING" && stayStatus !== "CANCELLED") continue;
    if (booking.reservationId) {
      otaByReservationId.set(booking.reservationId, booking);
    }
  }

  const mergedById = new Map<string, ReservationCandidate>();

  const upsertArrival = (arrival: HotelArrival) => {
    if (!ACTIVE_RESERVATION_STATUSES.has(normalizeStatusToken(arrival.status))) return;
    const checkInYmd = extractVnYmd(arrival.plannedCheckInAt);
    if (!checkInYmd) return;

    const linkedOta = otaByReservationId.get(arrival.id) ?? null;
    const matchedRoom =
      (arrival.roomId ? roomById.get(arrival.roomId) : undefined) ??
      (arrival.room?.roomNumber
        ? roomByNumber.get(arrival.room.roomNumber.trim().toUpperCase())
        : undefined);

    mergedById.set(arrival.id, {
      key: arrival.id,
      reservationId: arrival.id,
      code: arrival.reservationCode || linkedOta?.reservationCode || null,
      groupCode: arrival.groupCode || linkedOta?.groupCode || null,
      guestName: resolveGuestDisplayName(arrival.guestDisplayName || linkedOta?.guestName),
      guestPhone: arrival.guestPhone ?? linkedOta?.guestPhone ?? null,
      guestCount: arrival.guestCount ?? null,
      roomId: matchedRoom?.id ?? arrival.roomId ?? arrival.room?.id ?? null,
      roomNumber: matchedRoom?.roomNumber ?? arrival.room?.roomNumber ?? linkedOta?.roomNumber ?? null,
      checkInYmd,
      checkOutYmd: extractVnYmd(arrival.plannedCheckOutAt),
      plannedCheckInAt: arrival.plannedCheckInAt,
      plannedCheckOutAt: arrival.plannedCheckOutAt,
      sourceLabel: linkedOta?.otaName || (arrival.groupCode ? "Đoàn khách" : "Đặt trực tiếp"),
      arrival,
      otaBooking: linkedOta,
      fallbackReservation: null,
    });
  };

  for (const arrival of params.arrivalsList) upsertArrival(arrival);

  for (const room of params.rooms) {
    const embedded = [room.projectedReservation, room.upcomingReservation];
    for (const res of embedded) {
      if (!res || res.sourceType !== "RESERVATION") continue;
      if (!ACTIVE_RESERVATION_STATUSES.has(normalizeStatusToken(res.status))) continue;
      if (mergedById.has(res.id)) continue;

      const checkInYmd = extractVnYmd(res.plannedCheckInAt);
      if (!checkInYmd) continue;

      const linkedOta = otaByReservationId.get(res.id) ?? null;
      mergedById.set(res.id, {
        key: res.id,
        reservationId: res.id,
        code: res.reservationCode || linkedOta?.reservationCode || null,
        groupCode: res.groupCode || linkedOta?.groupCode || null,
        guestName: resolveGuestDisplayName(res.guestDisplayName || linkedOta?.guestName),
        guestPhone: res.guestPhone ?? linkedOta?.guestPhone ?? null,
        guestCount: res.guestCount ?? null,
        roomId: room.id,
        roomNumber: room.roomNumber ?? null,
        checkInYmd,
        checkOutYmd: extractVnYmd(res.plannedCheckOutAt),
        plannedCheckInAt: res.plannedCheckInAt,
        plannedCheckOutAt: res.plannedCheckOutAt,
        sourceLabel: linkedOta?.otaName || (res.groupCode ? "Đoàn khách" : "Đặt trước"),
        arrival: null,
        otaBooking: linkedOta,
        fallbackReservation: res,
      });
    }
  }

  for (const booking of params.otaBookings) {
    if (normalizeStatusToken(booking.status) !== "CONFIRMED") continue;
    const stayStatus = normalizeStatusToken(booking.stayStatus);
    if (stayStatus && stayStatus !== "PENDING" && stayStatus !== "CANCELLED") continue;

    const dedupeKey = booking.reservationId || `ota-${booking.bookingId}`;
    if (mergedById.has(dedupeKey)) continue;

    const checkInYmd = extractVnYmd(booking.checkInDate);
    if (!checkInYmd) continue;

    const matchedRoom =
      (booking.roomId ? roomById.get(booking.roomId) : undefined) ??
      (booking.roomNumber ? roomByNumber.get(booking.roomNumber.trim().toUpperCase()) : undefined);

    mergedById.set(dedupeKey, {
      key: dedupeKey,
      reservationId: booking.reservationId,
      code: booking.otaReservationCode || booking.reservationCode || null,
      groupCode: booking.groupCode ?? null,
      guestName: resolveGuestDisplayName(booking.guestName),
      guestPhone: booking.guestPhone ?? null,
      guestCount: null,
      roomId: matchedRoom?.id ?? booking.roomId ?? null,
      roomNumber: matchedRoom?.roomNumber ?? booking.roomNumber ?? null,
      checkInYmd,
      checkOutYmd: extractVnYmd(booking.checkOutDate),
      plannedCheckInAt: booking.checkInDate,
      plannedCheckOutAt: booking.checkOutDate,
      sourceLabel: booking.otaName || "Kênh OTA",
      arrival: null,
      otaBooking: booking,
      fallbackReservation: null,
    });
  }

  return { candidates: Array.from(mergedById.values()), roomById };
}

export type MapBackendPriorityAlertsInput = {
  response: HotelPriorityAlertsResponse | null | undefined;
  rooms?: HotelRoomSummary[];
  arrivalsList?: HotelArrival[];
  otaBookings?: SimulatedBookingItem[];
  nowMs?: number;
};

function describeBackendPhysicalReadiness(
  status: string | null | undefined,
  room: HotelRoomSummary | null,
): string {
  if (room) {
    return describePhysicalReadiness(normalizeRoomPhysicalStatus(room));
  }
  const normalized = normalizeStatusToken(status);
  if (normalized === "PROCESSING" || normalized === "CLEANING" || normalized === "DIRTY") {
    return "Đang chờ dọn";
  }
  if (normalized === "MAINTENANCE") return "Đang bảo trì";
  if (normalized === "BLOCKED" || normalized === "OUT_OF_SERVICE") return "Đang khóa";
  if (normalized === "OCCUPIED") return "Đang có khách";
  return "Sẵn sàng đón khách";
}

function describeArrivalBlocker(
  blockerCode: string | null | undefined,
  plannedCheckInAt: string | null | undefined,
): { badgeLabel: string; reasonText: string; readinessLabel: string; actionKind: PriorityActionKind; actionLabel: string } {
  const normalized = normalizeStatusToken(blockerCode);
  if (normalized === "UNASSIGNED_ROOM") {
    return {
      badgeLabel: "Chưa gán phòng",
      reasonText: `Đơn đến ${formatVnDateTime(plannedCheckInAt)} chưa được xếp số phòng`,
      readinessLabel: "Chờ gán phòng trống phù hợp",
      actionKind: "assign-room",
      actionLabel: "Gán phòng",
    };
  }
  if (normalized === "ROOM_PROCESSING") {
    return {
      badgeLabel: "Chờ dọn đón khách",
      reasonText: `Khách đặt đến lúc ${formatVnDateTime(plannedCheckInAt)} nhưng buồng chưa dọn xong`,
      readinessLabel: "Ưu tiên hoàn tất dọn buồng",
      actionKind: "mark-ready",
      actionLabel: "Đã dọn xong",
    };
  }
  if (normalized === "ROOM_OCCUPIED") {
    return {
      badgeLabel: "Đảo phòng hôm nay",
      reasonText: `Phòng đang có khách trước giờ nhận (${formatVnDateTime(plannedCheckInAt)})`,
      readinessLabel: "Cần trả phòng cũ & dọn trước giờ nhận",
      actionKind: "manage-stay",
      actionLabel: "Xử lý phòng",
    };
  }
  if (normalized === "ROOM_MAINTENANCE" || normalized === "ROOM_BLOCKED") {
    return {
      badgeLabel: "Phòng chưa sẵn sàng",
      reasonText:
        normalized === "ROOM_MAINTENANCE"
          ? "Phòng đang bảo trì trước giờ nhận"
          : "Phòng đang khóa / tạm ngưng đón khách",
      readinessLabel: normalized === "ROOM_MAINTENANCE" ? "Đang bảo trì" : "Đang khóa",
      actionKind: "assign-room",
      actionLabel: "Đổi / Xử lý",
    };
  }
  return {
    badgeLabel: "Đặt trước đến ngày",
    reasonText: `Lịch nhận ${formatVnDateTime(plannedCheckInAt)}`,
    readinessLabel: "Phòng sạch, sẵn sàng nhận",
    actionKind: "check-in",
    actionLabel: "Nhận phòng",
  };
}

/**
 * Maps indexed backend priority alerts response into PriorityRoomsControlSection view items,
 * enriching each alert with locally loaded Room/Arrival/OTA objects when present.
 */
export function mapBackendPriorityAlerts(
  input: MapBackendPriorityAlertsInput,
): PriorityRoomAlertItem[] {
  const { response, rooms = [], arrivalsList = [], otaBookings = [] } = input;
  if (!response?.items?.length) return [];

  const nowMs = input.nowMs ?? Date.now();
  const roomById = new Map<string, HotelRoomSummary>();
  for (const room of rooms) roomById.set(room.id, room);

  const arrivalById = new Map<string, HotelArrival>();
  for (const arr of arrivalsList) arrivalById.set(arr.id, arr);

  const otaByReservationId = new Map<string, SimulatedBookingItem>();
  for (const booking of otaBookings) {
    if (booking.reservationId) otaByReservationId.set(booking.reservationId, booking);
  }

  const arrivalCoveredDirtyRoomIds = new Set<string>();
  const arrivalCoveredBlockedRoomIds = new Set<string>();
  for (const raw of response.items) {
    if (!raw.roomId) continue;
    if (
      (raw.category === "DUE_TODAY_ARRIVAL" || raw.category === "OVERDUE_ARRIVAL") &&
      raw.blockerCode === "ROOM_PROCESSING"
    ) {
      arrivalCoveredDirtyRoomIds.add(raw.roomId);
    }
    if (
      (raw.category === "DUE_TODAY_ARRIVAL" || raw.category === "OVERDUE_ARRIVAL") &&
      (raw.blockerCode === "ROOM_BLOCKED" || raw.blockerCode === "ROOM_MAINTENANCE")
    ) {
      arrivalCoveredBlockedRoomIds.add(raw.roomId);
    }
  }

  const items: PriorityRoomAlertItem[] = [];

  for (const raw of response.items) {
    const matchedRoom = raw.roomId ? roomById.get(raw.roomId) ?? null : null;
    const matchedArrival = raw.reservationId ? arrivalById.get(raw.reservationId) ?? null : null;
    const matchedOta = raw.reservationId ? otaByReservationId.get(raw.reservationId) ?? null : null;
    const checkInMs = parseTimestampMs(raw.plannedCheckInAt);
    const checkOutMs = parseTimestampMs(raw.plannedCheckOutAt);
    const floorLabel = formatFloorLabel(matchedRoom?.floor ?? raw.floor);
    const roomTypeName = matchedRoom?.roomTypeName ?? matchedRoom?.type ?? raw.roomType ?? null;
    const roomNumber = matchedRoom?.roomNumber ?? raw.roomNumber ?? null;

    if (raw.category === "OVERDUE_CHECKOUT") {
      items.push({
        id: raw.id,
        bucket: "overdue",
        priorityRank: 1,
        badgeLabel: "Quá hạn trả phòng",
        reasonText: `Quá hạn ${formatOverdueDuration(checkOutMs, nowMs)} (dự kiến ${formatVnDateTime(raw.plannedCheckOutAt)})`,
        readinessLabel:
          raw.blockerCode === "NON_SELLABLE_WITH_ACTIVE_STAY"
            ? "Phòng đang khóa/bảo trì nhưng còn khách"
            : raw.blockerCode === "ROOM_OCCUPIED"
              ? "Có khách đặt kế tiếp hôm nay"
              : "Khách đang lưu trú quá giờ trả",
        actionKind: "manage-stay",
        actionLabel: "Xử lý phòng",
        roomId: raw.roomId,
        roomUpdatedAt: raw.roomUpdatedAt,
        roomNumber,
        floorLabel,
        roomTypeName,
        guestName: resolveGuestDisplayName(raw.guestDisplayName),
        guestPhone: raw.guestPhone ?? null,
        guestCount: raw.guestCount ?? matchedRoom?.activeStay?.occupants?.length ?? null,
        code: raw.reservationCode ?? null,
        groupCode: raw.groupCode ?? null,
        sourceLabel: matchedOta?.otaName || "Đang lưu trú",
        scheduleText: describeScheduleRange(raw.plannedCheckInAt, raw.plannedCheckOutAt),
        sortTimestamp: checkOutMs ?? nowMs,
        reservationId: raw.reservationId,
        stayId: raw.stayId,
        room: matchedRoom,
        arrival: matchedArrival,
        otaBooking: matchedOta,
        fallbackReservation: null,
      });
      continue;
    }

    if (raw.category === "OVERDUE_ARRIVAL") {
      const fullyExpired = checkOutMs !== null && checkOutMs < nowMs;
      const isCleanReady = Boolean(raw.roomId && !raw.blockerCode);
      const actionKind: PriorityActionKind = !raw.roomId
        ? "assign-room"
        : isCleanReady
          ? "check-in"
          : raw.blockerCode === "ROOM_PROCESSING"
            ? "mark-ready"
            : "resolve-room";

      items.push({
        id: raw.id,
        bucket: "overdue",
        priorityRank: 1,
        badgeLabel: fullyExpired ? "Quá hạn cả lịch" : "Quá hạn nhận phòng",
        reasonText: `Lịch nhận ${formatVnDateTime(raw.plannedCheckInAt)} (quá hạn)`,
        readinessLabel: !raw.roomId
          ? "Chưa gán số phòng"
          : describeBackendPhysicalReadiness(raw.roomStatus, matchedRoom),
        actionKind,
        actionLabel:
          actionKind === "assign-room"
            ? "Gán phòng"
            : actionKind === "check-in"
              ? "Nhận phòng"
              : actionKind === "mark-ready"
                ? "Đã dọn xong"
                : "Xử lý đơn",
        roomId: raw.roomId,
        roomUpdatedAt: raw.roomUpdatedAt,
        roomNumber,
        floorLabel,
        roomTypeName,
        guestName: resolveGuestDisplayName(raw.guestDisplayName),
        guestPhone: raw.guestPhone ?? null,
        guestCount: raw.guestCount ?? null,
        code: raw.reservationCode ?? null,
        groupCode: raw.groupCode ?? null,
        sourceLabel: matchedOta?.otaName || (raw.groupCode ? "Đoàn khách" : "Đặt trước"),
        scheduleText: describeScheduleRange(raw.plannedCheckInAt, raw.plannedCheckOutAt),
        sortTimestamp: checkInMs ?? nowMs,
        reservationId: raw.reservationId,
        stayId: raw.stayId,
        room: matchedRoom,
        arrival: matchedArrival,
        otaBooking: matchedOta,
        fallbackReservation: null,
      });
      continue;
    }

    if (raw.category === "DUE_TODAY_CHECKOUT") {
      const isTurnaround = raw.blockerCode === "ROOM_OCCUPIED";
      items.push({
        id: raw.id,
        bucket: "urgent",
        priorityRank: 2,
        badgeLabel: isTurnaround ? "Đảo phòng hôm nay" : "Trả phòng hôm nay",
        reasonText: isTurnaround
          ? `Khách cũ trả hôm nay (${formatVnDateTime(raw.plannedCheckOutAt)}) trước giờ nhận khách mới`
          : `Dự kiến trả phòng hôm nay (${formatVnDateTime(raw.plannedCheckOutAt)})`,
        readinessLabel: isTurnaround
          ? "Cần trả phòng cũ & dọn kịp giờ đón khách"
          : "Cần theo dõi trả phòng đúng giờ",
        actionKind: "manage-stay",
        actionLabel: "Xử lý phòng",
        roomId: raw.roomId,
        roomUpdatedAt: raw.roomUpdatedAt,
        roomNumber,
        floorLabel,
        roomTypeName,
        guestName: resolveGuestDisplayName(raw.guestDisplayName),
        guestPhone: raw.guestPhone ?? null,
        guestCount: raw.guestCount ?? null,
        code: raw.reservationCode ?? null,
        groupCode: raw.groupCode ?? null,
        sourceLabel: "Đang lưu trú",
        scheduleText: describeScheduleRange(raw.plannedCheckInAt, raw.plannedCheckOutAt),
        sortTimestamp: checkOutMs ?? nowMs,
        reservationId: raw.reservationId,
        stayId: raw.stayId,
        room: matchedRoom,
        arrival: matchedArrival,
        otaBooking: matchedOta,
        fallbackReservation: null,
      });
      continue;
    }

    if (raw.category === "DIRTY_ROOM") {
      if (raw.roomId && arrivalCoveredDirtyRoomIds.has(raw.roomId)) continue;
      const hasIncomingToday = raw.blockerCode === "RESERVATION_TODAY_ON_DIRTY_ROOM";
      items.push({
        id: raw.id,
        bucket: "urgent",
        priorityRank: 2,
        badgeLabel: hasIncomingToday ? "Chờ dọn đón khách" : "Chờ dọn buồng",
        reasonText: hasIncomingToday
          ? "Phòng chờ dọn trước khi khách đặt hôm nay nhận phòng"
          : "Phòng đang chờ làm sạch trước khi đón khách",
        readinessLabel: "Ưu tiên hoàn tất dọn buồng",
        actionKind: "mark-ready",
        actionLabel: "Đã dọn xong",
        roomId: raw.roomId,
        roomUpdatedAt: raw.roomUpdatedAt,
        roomNumber,
        floorLabel,
        roomTypeName,
        guestName: resolveGuestDisplayName(raw.guestDisplayName),
        guestPhone: raw.guestPhone ?? null,
        guestCount: raw.guestCount ?? null,
        code: raw.reservationCode ?? null,
        groupCode: raw.groupCode ?? null,
        sourceLabel: hasIncomingToday ? "Đặt trước hôm nay" : "Buồng phòng",
        scheduleText: hasIncomingToday ? "Ưu tiên trước giờ check-in" : "Cần xác nhận sẵn sàng",
        sortTimestamp: nowMs,
        reservationId: raw.reservationId,
        stayId: raw.stayId,
        room: matchedRoom,
        arrival: matchedArrival,
        otaBooking: matchedOta,
        fallbackReservation: null,
      });
      continue;
    }

    if (raw.category === "BLOCKED_OR_MAINTENANCE") {
      if (raw.roomId && arrivalCoveredBlockedRoomIds.has(raw.roomId)) continue;
      const isConflict = raw.blockerCode === "NON_SELLABLE_WITH_ACTIVE_STAY";
      items.push({
        id: raw.id,
        bucket: "urgent",
        priorityRank: 2,
        badgeLabel: isConflict ? "Xung đột phòng" : "Phòng chưa sẵn sàng",
        reasonText: isConflict
          ? "Phòng đang đánh dấu khóa/bảo trì nhưng vẫn còn lượt lưu trú hoạt động"
          : raw.roomStatus === "MAINTENANCE"
            ? "Phòng đang bảo trì, tạm ngưng đón khách"
            : "Phòng đang khóa tạm thời",
        readinessLabel: describeBackendPhysicalReadiness(raw.roomStatus, matchedRoom),
        actionKind: "resolve-room",
        actionLabel: "Kiểm tra phòng",
        roomId: raw.roomId,
        roomUpdatedAt: raw.roomUpdatedAt,
        roomNumber,
        floorLabel,
        roomTypeName,
        guestName: resolveGuestDisplayName(raw.guestDisplayName),
        guestPhone: raw.guestPhone ?? null,
        guestCount: raw.guestCount ?? null,
        code: raw.reservationCode ?? null,
        groupCode: raw.groupCode ?? null,
        sourceLabel: raw.sourceType === "STAY" ? "Đang lưu trú" : "Vận hành phòng",
        scheduleText: raw.plannedCheckOutAt
          ? describeScheduleRange(raw.plannedCheckInAt, raw.plannedCheckOutAt)
          : "Cần đối soát trạng thái",
        sortTimestamp: nowMs,
        reservationId: raw.reservationId,
        stayId: raw.stayId,
        room: matchedRoom,
        arrival: matchedArrival,
        otaBooking: matchedOta,
        fallbackReservation: null,
      });
      continue;
    }

    // DUE_TODAY_ARRIVAL
    const blockerInfo = describeArrivalBlocker(raw.blockerCode, raw.plannedCheckInAt);
    const isBlocker = Boolean(raw.blockerCode);
    const isSameDayLate = !isBlocker && checkInMs !== null && nowMs > checkInMs + 2 * 3_600_000;
    items.push({
      id: raw.id,
      bucket: isBlocker ? "urgent" : "due",
      priorityRank: isBlocker ? 2 : 3,
      badgeLabel: blockerInfo.badgeLabel,
      reasonText: isSameDayLate
        ? `Quá giờ hẹn nhận (${formatVnDateTime(raw.plannedCheckInAt)}), phòng đã sẵn sàng`
        : blockerInfo.reasonText,
      readinessLabel: blockerInfo.readinessLabel,
      actionKind: blockerInfo.actionKind,
      actionLabel: blockerInfo.actionLabel,
      roomId: raw.roomId,
      roomUpdatedAt: raw.roomUpdatedAt,
      roomNumber,
      floorLabel,
      roomTypeName,
      guestName: resolveGuestDisplayName(raw.guestDisplayName),
      guestPhone: raw.guestPhone ?? null,
      guestCount: raw.guestCount ?? null,
      code: raw.reservationCode ?? null,
      groupCode: raw.groupCode ?? null,
      sourceLabel: matchedOta?.otaName || (raw.groupCode ? "Đoàn khách" : "Đặt trước"),
      scheduleText: describeScheduleRange(raw.plannedCheckInAt, raw.plannedCheckOutAt),
      sortTimestamp: checkInMs ?? nowMs,
      reservationId: raw.reservationId,
      stayId: raw.stayId,
      room: matchedRoom,
      arrival: matchedArrival,
      otaBooking: matchedOta,
      fallbackReservation: null,
    });
  }

  return items.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    if (a.sortTimestamp !== b.sortTimestamp) return a.sortTimestamp - b.sortTimestamp;
    return (a.roomNumber ?? "ZZZ").localeCompare(b.roomNumber ?? "ZZZ", undefined, { numeric: true });
  });
}

export type BuildPriorityRoomAlertsInput = {
  rooms: HotelRoomSummary[];
  arrivalsList: HotelArrival[];
  otaBookings: SimulatedBookingItem[];
  todayYmd: string;
  targetYmd: string;
  isFutureDate: boolean;
  nowMs?: number;
};

/**
 * Classifies and deduplicates overdue stays, overdue arrivals, rooms needing
 * operational attention first, and pre-booked arrivals due on targetYmd.
 */
export function buildPriorityRoomAlerts(
  input: BuildPriorityRoomAlertsInput,
): PriorityRoomAlertItem[] {
  const { rooms, arrivalsList, otaBookings, todayYmd, targetYmd, isFutureDate } = input;
  const nowMs = input.nowMs ?? Date.now();
  const items: PriorityRoomAlertItem[] = [];
  const handledRoomIds = new Set<string>();

  const { candidates, roomById } = buildReservationCandidates({
    rooms,
    arrivalsList,
    otaBookings,
  });

  // Track reservations relevant for today / targetYmd by roomId so stay rows can show incoming context
  const incomingByRoomId = new Map<string, ReservationCandidate>();
  for (const candidate of candidates) {
    if (!candidate.roomId) continue;
    const isRelevantDate = isFutureDate
      ? candidate.checkInYmd === targetYmd
      : candidate.checkInYmd <= todayYmd;
    if (!isRelevantDate) continue;

    const existing = incomingByRoomId.get(candidate.roomId);
    if (!existing || candidate.checkInYmd < existing.checkInYmd) {
      incomingByRoomId.set(candidate.roomId, candidate);
    }
  }

  // 1. Live overdue check-outs and room state conflicts (current operating day only)
  if (!isFutureDate) {
    for (const room of rooms) {
      const stay = hasActiveStay(room.activeStay) ? room.activeStay : null;
      const checkoutMs = parseTimestampMs(stay?.plannedCheckOutAt);
      const isOverdueCheckout =
        Boolean(stay && checkoutMs !== null && checkoutMs < nowMs) ||
        normalizeStatusToken(room.statusConflictCode) === "OVERDUE_STAY_CONFLICT";

      if (isOverdueCheckout) {
        handledRoomIds.add(room.id);
        const incoming = incomingByRoomId.get(room.id);
        const overdueText = formatOverdueDuration(checkoutMs, nowMs);
        const incomingNote = incoming
          ? `Có khách đặt đến ${formatVnShortDate(incoming.plannedCheckInAt)} (${incoming.guestName})`
          : "Cần làm thủ tục trả phòng hoặc gia hạn";

        items.push({
          id: `room-overdue-${room.id}`,
          bucket: "overdue",
          priorityRank: 1,
          badgeLabel: "Quá hạn trả phòng",
          reasonText: `${overdueText} · ${incomingNote}`,
          readinessLabel: describeConflictCode(room.statusConflictCode ?? "OVERDUE_STAY_CONFLICT"),
          actionKind: "manage-stay",
          actionLabel: "Trả / Gia hạn",
          roomId: room.id,
          roomNumber: room.roomNumber ?? null,
          floorLabel: formatFloorLabel(room.floor),
          roomTypeName: room.roomTypeName ?? room.type ?? null,
          guestName: resolveGuestDisplayName(stay?.guestDisplayName),
          guestPhone: stay?.guestPhone ?? null,
          guestCount: stay?.occupants?.length ?? null,
          code: stay?.reservationCode ?? null,
          groupCode: null,
          sourceLabel: "Đang lưu trú",
          scheduleText: describeScheduleRange(stay?.plannedCheckInAt, stay?.plannedCheckOutAt),
          sortTimestamp: checkoutMs ?? nowMs,
          room,
          arrival: null,
          otaBooking: null,
          fallbackReservation: null,
        });
        continue;
      }

      if (room.statusConflictCode) {
        handledRoomIds.add(room.id);
        items.push({
          id: `room-conflict-${room.id}`,
          bucket: "urgent",
          priorityRank: 2,
          badgeLabel: "Xung đột phòng",
          reasonText: describeConflictCode(room.statusConflictCode),
          readinessLabel: describePhysicalReadiness(normalizeRoomPhysicalStatus(room)),
          actionKind: "resolve-room",
          actionLabel: "Kiểm tra phòng",
          roomId: room.id,
          roomNumber: room.roomNumber ?? null,
          floorLabel: formatFloorLabel(room.floor),
          roomTypeName: room.roomTypeName ?? room.type ?? null,
          guestName: resolveGuestDisplayName(stay?.guestDisplayName),
          guestPhone: stay?.guestPhone ?? null,
          guestCount: stay?.occupants?.length ?? null,
          code: stay?.reservationCode ?? null,
          groupCode: null,
          sourceLabel: stay ? "Đang lưu trú" : null,
          scheduleText: stay
            ? describeScheduleRange(stay.plannedCheckInAt, stay.plannedCheckOutAt)
            : "Cần đối soát trạng thái",
          sortTimestamp: nowMs,
          room,
          arrival: null,
          otaBooking: null,
          fallbackReservation: null,
        });
      }
    }
  }

  // 2. Reservation candidates: overdue arrivals, turnaround/blocked arrivals, unassigned, and due arrivals
  for (const candidate of candidates) {
    const isPastDueArrival = !isFutureDate && candidate.checkInYmd < todayYmd;
    const isDueTodayOrTarget = candidate.checkInYmd === targetYmd;
    if (!isPastDueArrival && !isDueTodayOrTarget) continue;

    const assignedRoom = candidate.roomId ? roomById.get(candidate.roomId) ?? null : null;
    const checkInMs = parseTimestampMs(candidate.plannedCheckInAt);
    const checkOutMs = parseTimestampMs(candidate.plannedCheckOutAt);
    const physical = assignedRoom ? normalizeRoomPhysicalStatus(assignedRoom) : null;
    const stay = assignedRoom && hasActiveStay(assignedRoom.activeStay) ? assignedRoom.activeStay : null;
    const stayOutYmd = extractVnYmd(stay?.plannedCheckOutAt);

    if (isPastDueArrival) {
      const overdueDays = Math.max(1, calendarDaysDiff(candidate.checkInYmd, todayYmd));
      const fullyExpired = checkOutMs !== null && checkOutMs < nowMs;
      const readinessLabel = assignedRoom
        ? describePhysicalReadiness(physical ?? "available")
        : "Chưa gán số phòng";
      const canDirectCheckIn = Boolean(
        assignedRoom &&
          physical === "available" &&
          !stay &&
          (candidate.arrival || candidate.otaBooking || candidate.fallbackReservation),
      );

      items.push({
        id: `res-overdue-${candidate.key}`,
        bucket: "overdue",
        priorityRank: 1,
        badgeLabel: fullyExpired ? "Quá hạn cả lịch" : "Quá hạn nhận phòng",
        reasonText: `Lịch nhận ${formatVnDateTime(candidate.plannedCheckInAt)} (trễ ${overdueDays} ngày)`,
        readinessLabel,
        actionKind: !assignedRoom
          ? "assign-room"
          : canDirectCheckIn
            ? "check-in"
            : "resolve-room",
        actionLabel: !assignedRoom
          ? "Gán phòng"
          : canDirectCheckIn
            ? "Nhận phòng"
            : "Xử lý đơn",
        roomId: assignedRoom?.id ?? candidate.roomId,
        roomNumber: assignedRoom?.roomNumber ?? candidate.roomNumber,
        floorLabel: formatFloorLabel(assignedRoom?.floor),
        roomTypeName: assignedRoom?.roomTypeName ?? assignedRoom?.type ?? null,
        guestName: candidate.guestName,
        guestPhone: candidate.guestPhone,
        guestCount: candidate.guestCount,
        code: candidate.code,
        groupCode: candidate.groupCode,
        sourceLabel: candidate.sourceLabel,
        scheduleText: describeScheduleRange(candidate.plannedCheckInAt, candidate.plannedCheckOutAt),
        sortTimestamp: checkInMs ?? nowMs,
        room: assignedRoom,
        arrival: candidate.arrival,
        otaBooking: candidate.otaBooking,
        fallbackReservation: candidate.fallbackReservation,
      });
      if (assignedRoom) handledRoomIds.add(assignedRoom.id);
      continue;
    }

    // Arrival is due on targetYmd
    if (!assignedRoom) {
      items.push({
        id: `res-unassigned-${candidate.key}`,
        bucket: "urgent",
        priorityRank: 2,
        badgeLabel: "Chưa gán phòng",
        reasonText: `Đơn đến ${formatVnDateTime(candidate.plannedCheckInAt)} chưa được xếp số phòng`,
        readinessLabel: "Chờ gán phòng trống phù hợp",
        actionKind: "assign-room",
        actionLabel: "Gán phòng",
        roomId: null,
        roomNumber: null,
        floorLabel: null,
        roomTypeName: candidate.otaBooking?.roomType ?? null,
        guestName: candidate.guestName,
        guestPhone: candidate.guestPhone,
        guestCount: candidate.guestCount,
        code: candidate.code,
        groupCode: candidate.groupCode,
        sourceLabel: candidate.sourceLabel,
        scheduleText: describeScheduleRange(candidate.plannedCheckInAt, candidate.plannedCheckOutAt),
        sortTimestamp: checkInMs ?? nowMs,
        room: null,
        arrival: candidate.arrival,
        otaBooking: candidate.otaBooking,
        fallbackReservation: candidate.fallbackReservation,
      });
      continue;
    }

    const hasSameDayTurnaround = Boolean(!isFutureDate && stay && stayOutYmd === todayYmd);
    const hasStayConflict = Boolean(
      stay && (!isFutureDate ? stayOutYmd !== todayYmd : stayOutYmd > targetYmd),
    );

    if (hasSameDayTurnaround && !handledRoomIds.has(assignedRoom.id)) {
      handledRoomIds.add(assignedRoom.id);
      items.push({
        id: `res-turnaround-${candidate.key}`,
        bucket: "urgent",
        priorityRank: 2,
        badgeLabel: "Đảo phòng hôm nay",
        reasonText: `Khách cũ trả phòng hôm nay (${formatVnDateTime(stay?.plannedCheckOutAt)}) trước khi khách mới nhận`,
        readinessLabel: "Cần trả phòng cũ & dọn trước giờ nhận",
        actionKind: "manage-stay",
        actionLabel: "Xử lý phòng",
        roomId: assignedRoom.id,
        roomNumber: assignedRoom.roomNumber ?? null,
        floorLabel: formatFloorLabel(assignedRoom.floor),
        roomTypeName: assignedRoom.roomTypeName ?? assignedRoom.type ?? null,
        guestName: candidate.guestName,
        guestPhone: candidate.guestPhone,
        guestCount: candidate.guestCount,
        code: candidate.code,
        groupCode: candidate.groupCode,
        sourceLabel: candidate.sourceLabel,
        scheduleText: describeScheduleRange(candidate.plannedCheckInAt, candidate.plannedCheckOutAt),
        sortTimestamp: checkInMs ?? nowMs,
        room: assignedRoom,
        arrival: candidate.arrival,
        otaBooking: candidate.otaBooking,
        fallbackReservation: candidate.fallbackReservation,
      });
      continue;
    }

    if (hasStayConflict || physical === "maintenance" || physical === "blocked") {
      handledRoomIds.add(assignedRoom.id);
      const isExistingStayOverdue = Boolean(stay && stayOutYmd && stayOutYmd < todayYmd);
      const blockerReason = isExistingStayOverdue
        ? `Khách cũ quá hạn trả phòng từ ${formatVnDateTime(stay?.plannedCheckOutAt)} — cần xử lý hoặc đổi phòng`
        : hasStayConflict
          ? `Phòng đang có khách đến ${formatVnDateTime(stay?.plannedCheckOutAt)}`
          : physical === "maintenance"
            ? "Phòng đang bảo trì trước giờ nhận"
            : "Phòng đang khóa / tạm ngưng đón khách";

      items.push({
        id: `res-blocked-${candidate.key}`,
        bucket: "urgent",
        priorityRank: 2,
        badgeLabel: "Phòng chưa sẵn sàng",
        reasonText: blockerReason,
        readinessLabel: describePhysicalReadiness(physical ?? "blocked"),
        actionKind: candidate.arrival ? "assign-room" : "resolve-room",
        actionLabel: candidate.arrival ? "Đổi / Xử lý" : "Kiểm tra phòng",
        roomId: assignedRoom.id,
        roomNumber: assignedRoom.roomNumber ?? null,
        floorLabel: formatFloorLabel(assignedRoom.floor),
        roomTypeName: assignedRoom.roomTypeName ?? assignedRoom.type ?? null,
        guestName: candidate.guestName,
        guestPhone: candidate.guestPhone,
        guestCount: candidate.guestCount,
        code: candidate.code,
        groupCode: candidate.groupCode,
        sourceLabel: candidate.sourceLabel,
        scheduleText: describeScheduleRange(candidate.plannedCheckInAt, candidate.plannedCheckOutAt),
        sortTimestamp: checkInMs ?? nowMs,
        room: assignedRoom,
        arrival: candidate.arrival,
        otaBooking: candidate.otaBooking,
        fallbackReservation: candidate.fallbackReservation,
      });
      continue;
    }

    if (!isFutureDate && physical === "processing") {
      handledRoomIds.add(assignedRoom.id);
      items.push({
        id: `res-dirty-${candidate.key}`,
        bucket: "urgent",
        priorityRank: 2,
        badgeLabel: "Chờ dọn đón khách",
        reasonText: `Khách đặt đến lúc ${formatVnDateTime(candidate.plannedCheckInAt)} nhưng buồng chưa dọn xong`,
        readinessLabel: "Ưu tiên hoàn tất dọn buồng",
        actionKind: "mark-ready",
        actionLabel: "Đã dọn xong",
        roomId: assignedRoom.id,
        roomNumber: assignedRoom.roomNumber ?? null,
        floorLabel: formatFloorLabel(assignedRoom.floor),
        roomTypeName: assignedRoom.roomTypeName ?? assignedRoom.type ?? null,
        guestName: candidate.guestName,
        guestPhone: candidate.guestPhone,
        guestCount: candidate.guestCount,
        code: candidate.code,
        groupCode: candidate.groupCode,
        sourceLabel: candidate.sourceLabel,
        scheduleText: describeScheduleRange(candidate.plannedCheckInAt, candidate.plannedCheckOutAt),
        sortTimestamp: checkInMs ?? nowMs,
        room: assignedRoom,
        arrival: candidate.arrival,
        otaBooking: candidate.otaBooking,
        fallbackReservation: candidate.fallbackReservation,
      });
      continue;
    }

    // Pre-booked room is clean / ready for arrival
    if (handledRoomIds.has(assignedRoom.id)) {
      // Room is already listed as overdue checkout above, but still expose distinct reservation row under Due Arrivals
      // so the receptionist can inspect or reassign the incoming reservation separately.
    } else {
      handledRoomIds.add(assignedRoom.id);
    }

    const isSameDayLate = Boolean(
      !isFutureDate && checkInMs !== null && nowMs > checkInMs + 2 * 3_600_000,
    );

    items.push({
      id: `res-due-${candidate.key}`,
      bucket: "due",
      priorityRank: 3,
      badgeLabel: isFutureDate ? "Đặt trước theo ngày" : "Đặt trước đến ngày",
      reasonText: isSameDayLate
        ? `Quá giờ hẹn nhận (${formatVnDateTime(candidate.plannedCheckInAt)}), phòng đã sẵn sàng`
        : `Lịch nhận ${formatVnDateTime(candidate.plannedCheckInAt)}`,
      readinessLabel: isFutureDate
        ? `Phòng gán ${assignedRoom.roomNumber ?? "--"}`
        : "Phòng sạch, sẵn sàng nhận",
      actionKind: isFutureDate ? "resolve-room" : "check-in",
      actionLabel: isFutureDate ? "Chi tiết đơn" : "Nhận phòng",
      roomId: assignedRoom.id,
      roomNumber: assignedRoom.roomNumber ?? null,
      floorLabel: formatFloorLabel(assignedRoom.floor),
      roomTypeName: assignedRoom.roomTypeName ?? assignedRoom.type ?? null,
      guestName: candidate.guestName,
      guestPhone: candidate.guestPhone,
      guestCount: candidate.guestCount,
      code: candidate.code,
      groupCode: candidate.groupCode,
      sourceLabel: candidate.sourceLabel,
      scheduleText: describeScheduleRange(candidate.plannedCheckInAt, candidate.plannedCheckOutAt),
      sortTimestamp: checkInMs ?? nowMs,
      room: assignedRoom,
      arrival: candidate.arrival,
      otaBooking: candidate.otaBooking,
      fallbackReservation: candidate.fallbackReservation,
    });
  }

  // 3. Remaining daily operational rooms on current day (scheduled check-out today & dirty rooms waiting clean)
  if (!isFutureDate) {
    for (const room of rooms) {
      if (handledRoomIds.has(room.id)) continue;

      const stay = hasActiveStay(room.activeStay) ? room.activeStay : null;
      const stayOutYmd = extractVnYmd(stay?.plannedCheckOutAt);
      const physical = normalizeRoomPhysicalStatus(room);

      if (stay && stayOutYmd === todayYmd) {
        handledRoomIds.add(room.id);
        items.push({
          id: `room-departing-${room.id}`,
          bucket: "urgent",
          priorityRank: 4,
          badgeLabel: "Trả phòng hôm nay",
          reasonText: `Dự kiến trả phòng lúc ${formatVnDateTime(stay.plannedCheckOutAt)}`,
          readinessLabel: "Theo dõi trả phòng & kiểm buồng",
          actionKind: "manage-stay",
          actionLabel: "Trả phòng",
          roomId: room.id,
          roomNumber: room.roomNumber ?? null,
          floorLabel: formatFloorLabel(room.floor),
          roomTypeName: room.roomTypeName ?? room.type ?? null,
          guestName: resolveGuestDisplayName(stay.guestDisplayName),
          guestPhone: stay.guestPhone ?? null,
          guestCount: stay.occupants?.length ?? null,
          code: stay.reservationCode ?? null,
          groupCode: null,
          sourceLabel: "Khách đi hôm nay",
          scheduleText: describeScheduleRange(stay.plannedCheckInAt, stay.plannedCheckOutAt),
          sortTimestamp: parseTimestampMs(stay.plannedCheckOutAt) ?? nowMs,
          room,
          arrival: null,
          otaBooking: null,
          fallbackReservation: null,
        });
        continue;
      }

      if (physical === "processing") {
        handledRoomIds.add(room.id);
        items.push({
          id: `room-cleaning-${room.id}`,
          bucket: "urgent",
          priorityRank: 4,
          badgeLabel: "Chờ dọn buồng",
          reasonText: "Phòng đang chờ làm sạch để sẵn sàng đón khách",
          readinessLabel: "Chờ xác nhận hoàn tất dọn phòng",
          actionKind: "mark-ready",
          actionLabel: "Đã dọn xong",
          roomId: room.id,
          roomNumber: room.roomNumber ?? null,
          floorLabel: formatFloorLabel(room.floor),
          roomTypeName: room.roomTypeName ?? room.type ?? null,
          guestName: "Chưa có khách gán",
          guestPhone: null,
          guestCount: null,
          code: null,
          groupCode: null,
          sourceLabel: "Buồng phòng",
          scheduleText: room.roomTypeName ?? room.type ?? "Hoàn tất vệ sinh để mở bán",
          sortTimestamp: nowMs,
          room,
          arrival: null,
          otaBooking: null,
          fallbackReservation: null,
        });
      }
    }
  }

  return items.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    if (a.sortTimestamp !== b.sortTimestamp) return a.sortTimestamp - b.sortTimestamp;
    return (a.roomNumber ?? "ZZZ").localeCompare(b.roomNumber ?? "ZZZ", "vi", { numeric: true });
  });
}
