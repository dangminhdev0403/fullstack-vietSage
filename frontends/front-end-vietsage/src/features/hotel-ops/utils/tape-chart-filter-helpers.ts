export interface NormalizedSearchQuery {
  raw: string;
  clean: string;
  lower: string;
}

/**
 * Normalizes user search input once:
 * - Trims leading and trailing whitespace
 * - Strips leading '#' characters (e.g. "#VSH_GROUP_0015" -> "vsh_group_0015")
 * - Converts to lowercase for robust case-insensitive comparisons
 */
export function normalizeSearchQuery(query?: string | null): NormalizedSearchQuery {
  if (!query) {
    return { raw: "", clean: "", lower: "" };
  }
  const raw = query.trim();
  const lower = raw.toLowerCase();
  const clean = lower.replace(/^#+/, "").trim();
  return { raw, clean, lower };
}

/**
 * Checks if a code (reservationCode or groupCode) matches normalized search query.
 * Matches full code, partial code, and handles codes with or without leading '#'.
 */
export function matchesReservationOrGroupCode(
  code: string | null | undefined,
  cleanQuery: string,
): boolean {
  if (!code || !cleanQuery) return false;
  const cleanCode = code.trim().toLowerCase().replace(/^#+/, "").trim();
  if (!cleanCode) return false;

  return cleanCode.includes(cleanQuery);
}

export interface MatchableBlock {
  reservationCode?: string | null;
  groupCode?: string | null;
  guestName?: string | null;
  guestDisplayName?: string | null;
  phone?: string | null;
  channel?: string | null;
  channelName?: string | null;
  source?: string | null;
  notes?: string | null;
  roomNumber?: string | null;
}

/**
 * Evaluates whether a RoomPlanBlock matches the search query.
 * Preserves checking actual reservationCode and groupCode even if the UI display
 * label is cleaned of code prefixes.
 */
export function matchesBlockQuery(
  block: MatchableBlock,
  query: string | NormalizedSearchQuery,
): boolean {
  const norm =
    typeof query === "string" ? normalizeSearchQuery(query) : query;
  if (!norm.raw) return false;

  const { clean, lower } = norm;

  // 1. Direct code matching (reservation and group codes)
  if (matchesReservationOrGroupCode(block.reservationCode, clean)) return true;
  if (matchesReservationOrGroupCode(block.groupCode, clean)) return true;

  // 2. Guest names (check original uncleaned names)
  const gName = (block.guestName || "").toLowerCase();
  if (gName.includes(lower) || (clean && gName.includes(clean))) return true;

  const gDisp = (block.guestDisplayName || "").toLowerCase();
  if (gDisp.includes(lower) || (clean && gDisp.includes(clean))) return true;

  // 3. Phone and contact
  const phone = (block.phone || "").toLowerCase();
  if (phone.includes(lower) || (clean && phone.includes(clean))) return true;

  // 4. Source and channels
  const channel = (block.channel || "").toLowerCase();
  if (channel.includes(lower)) return true;

  const channelName = (block.channelName || "").toLowerCase();
  if (channelName.includes(lower)) return true;

  const source = (block.source || "").toLowerCase();
  if (source.includes(lower)) return true;

  // 5. Notes
  const notes = (block.notes || "").toLowerCase();
  if (notes.includes(lower) || (clean && notes.includes(clean))) return true;

  return false;
}

export interface MatchableRoom {
  roomNumber: string;
  roomTypeName?: string | null;
}

export interface MatchablePropRoom {
  projectedReservation?: {
    reservationCode?: string | null;
    groupCode?: string | null;
    guestName?: string | null;
    phone?: string | null;
  } | null;
  upcomingReservation?: {
    reservationCode?: string | null;
    groupCode?: string | null;
    guestName?: string | null;
    phone?: string | null;
  } | null;
  activeStay?: {
    reservationCode?: string | null;
    guestDisplayName?: string | null;
    guestPhone?: string | null;
    reservation?: {
      reservationCode?: string | null;
      groupCode?: string | null;
      guestName?: string | null;
      phone?: string | null;
    } | null;
    guestName?: string | null;
    phone?: string | null;
  } | null;
}

/**
 * Evaluates whether a room should be visible given the search query.
 * Matches room number, room type, associated blocks, and propRoom reservations.
 */
export function matchesRoomFilter(
  room: MatchableRoom,
  blocksForRoom: MatchableBlock[],
  query: string | NormalizedSearchQuery,
  propRoom?: MatchablePropRoom | null,
): boolean {
  const norm =
    typeof query === "string" ? normalizeSearchQuery(query) : query;

  // Empty query matches all rooms (clearing restores filter)
  if (!norm.raw) return true;

  const { clean, lower } = norm;

  // 1. Check room number
  const cleanQueryRoom = lower.replace(/^(p\.|p|phòng\s*)/i, "").trim();
  const roomNumLower = room.roomNumber.toLowerCase();
  if (
    roomNumLower.includes(lower) ||
    (cleanQueryRoom.length > 0 && roomNumLower.includes(cleanQueryRoom))
  ) {
    return true;
  }

  // 2. Check room type name
  const typeNameLower = (room.roomTypeName || "").toLowerCase();
  if (typeNameLower && typeNameLower.includes(lower)) {
    return true;
  }

  // 3. Check blocks on this room
  if (blocksForRoom.some((b) => matchesBlockQuery(b, norm))) {
    return true;
  }

  // 4. Check propRoom summary (projected, upcoming, stay reservations)
  if (propRoom) {
    const proj = propRoom.projectedReservation;
    if (
      proj &&
      (matchesReservationOrGroupCode(proj.reservationCode, clean) ||
        matchesReservationOrGroupCode(proj.groupCode, clean) ||
        (proj.guestName && proj.guestName.toLowerCase().includes(lower)) ||
        (proj.phone && proj.phone.toLowerCase().includes(lower)))
    ) {
      return true;
    }

    const upc = propRoom.upcomingReservation;
    if (
      upc &&
      (matchesReservationOrGroupCode(upc.reservationCode, clean) ||
        matchesReservationOrGroupCode(upc.groupCode, clean) ||
        (upc.guestName && upc.guestName.toLowerCase().includes(lower)) ||
        (upc.phone && upc.phone.toLowerCase().includes(lower)))
    ) {
      return true;
    }

    const stayRes = propRoom.activeStay?.reservation;
    if (
      stayRes &&
      (matchesReservationOrGroupCode(stayRes.reservationCode, clean) ||
        matchesReservationOrGroupCode(stayRes.groupCode, clean) ||
        (stayRes.guestName && stayRes.guestName.toLowerCase().includes(lower)) ||
        (stayRes.phone && stayRes.phone.toLowerCase().includes(lower)))
    ) {
      return true;
    }
    const stay = propRoom.activeStay;
    if (stay && matchesBlockQuery({
      reservationCode: stay.reservationCode,
      guestDisplayName: stay.guestDisplayName,
      phone: stay.guestPhone,
    }, norm)) return true;
  }

  return false;
}
