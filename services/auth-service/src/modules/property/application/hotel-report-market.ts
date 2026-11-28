type SourceType = "DIRECT" | "OTA" | "TA" | "CORPORATE" | "OTHER" | "WALK_IN";

export type MarketRoom = {
  id?: string; roomNumber?: string; type?: string | null;
  roomType?: { id?: string; name?: string } | null;
};
type Attribution = {
  sourceCategory?: string | null;
  sourcePartner?: { id: string; name: string } | null;
  bookingOwnerUserId?: string | null;
};
type MarketBooking = Attribution & {
  reservationCode?: string; groupCode?: string | null; group?: Attribution | null;
};
export type MarketEvent = {
  booking?: MarketBooking | null; room?: MarketRoom | null; roomType?: string | null;
  nationality?: string | null; actual?: number; actualRoom?: number; projected?: number;
  sold?: number; reserved?: number; bookings?: number; guests?: number;
};
type Metric = {
  key: string; label: string; actualRevenue: number; actualRoomRevenue: number; projectedRevenue: number;
  actualNights: number; projectedNights: number; bookingCount: number; guestCount: number;
};
type Dimension = "nationality" | "roomType" | "room" | "partner" | "owner";
export type MarketDimensions = Record<Dimension, Metric[]>;

const unknown = "Chưa xác định";
function channel(booking?: MarketBooking | null): { key: string; label: string; type: SourceType } {
  const category = booking?.sourceCategory ?? booking?.group?.sourceCategory;
  const partner = booking?.sourcePartner ?? booking?.group?.sourcePartner;
  const labels = { DIRECT: "Đặt trực tiếp", OTA: "Kênh OTA", TA: "Đại lý du lịch", CORPORATE: "Doanh nghiệp", OTHER: "Nguồn khác" };
  if (category) {
    const type = category === "TRAVEL_AGENCY" ? "TA" : category;
    const supported = type in labels ? type as keyof typeof labels : "OTHER";
    return { key: partner ? supported + "_" + partner.id : supported,
      label: partner?.name ?? labels[supported], type: supported };
  }
  // Channex writes this group prefix and puts the provider name before its external reference.
  if (booking?.groupCode?.startsWith("CHANNEX:")) {
    const provider = /^(?:OTA-)?(BOOKING(?:[.]COM)?|AGODA|AIRBNB|EXPEDIA|TRIP(?:[.]COM)?)-/i.exec(booking.reservationCode ?? "")?.[1].toUpperCase();
    const names: Record<string, string> = { BOOKING: "Booking.com", "BOOKING.COM": "Booking.com", AGODA: "Agoda", AIRBNB: "Airbnb", EXPEDIA: "Expedia", TRIP: "Trip.com", "TRIP.COM": "Trip.com" };
    return { key: "OTA_" + (provider?.split(".")[0] ?? "OTHER"), label: provider ? names[provider] : "OTA chưa xác định", type: "OTA" };
  }
  if (booking?.reservationCode) {
    return { key: "DIRECT", label: "Đặt trực tiếp", type: "DIRECT" };
  }
  return { key: "UNKNOWN", label: unknown, type: "OTHER" };
}

function accumulate(map: Map<string, Metric>, key: string, label: string, event: MarketEvent) {
  let row = map.get(key);
  if (!row) {
    row = { key, label, actualRevenue: 0, actualRoomRevenue: 0, projectedRevenue: 0,
      actualNights: 0, projectedNights: 0, bookingCount: 0, guestCount: 0 };
    map.set(key, row);
  }
  row.actualRevenue += event.actual ?? 0;
  row.actualRoomRevenue += event.actualRoom ?? 0;
  row.projectedRevenue += event.projected ?? 0;
  row.actualNights += event.sold ?? 0;
  row.projectedNights += event.reserved ?? 0;
  row.bookingCount += event.bookings ?? 0;
  row.guestCount += event.guests ?? 0;
}
const ranked = (rows: Map<string, Metric>) => [...rows.values()].sort(
  (a, b) => b.actualRevenue - a.actualRevenue || b.projectedRevenue - a.projectedRevenue || a.label.localeCompare(b.label),
);

export function aggregateMarket(events: MarketEvent[], staffNames: Map<string, string>) {
  const maps = {
    nationality: new Map<string, Metric>(), roomType: new Map<string, Metric>(), room: new Map<string, Metric>(),
    partner: new Map<string, Metric>(), owner: new Map<string, Metric>(),
  };
  const sources = new Map<string, Metric>();
  const sourceTypes = new Map<string, SourceType>();
  for (const event of events) {
    const source = channel(event.booking);
    const room = event.room;
    const typeName = room?.roomType?.name ?? room?.type ?? event.roomType;
    const owner = event.booking?.bookingOwnerUserId ?? event.booking?.group?.bookingOwnerUserId;
    const partner = event.booking?.sourcePartner ?? event.booking?.group?.sourcePartner;
    accumulate(sources, source.key, source.label, event);
    sourceTypes.set(source.key, source.type);
    accumulate(maps.nationality, event.nationality ?? unknown, event.nationality ?? unknown, event);
    accumulate(maps.roomType, typeName ?? unknown, typeName ?? unknown, event);
    accumulate(maps.room, room?.id ?? unknown, room?.roomNumber ?? unknown, event);
    accumulate(maps.partner, partner?.id ?? unknown, partner?.name ?? unknown, event);
    accumulate(maps.owner, owner ?? "UNASSIGNED", (owner && staffNames.get(owner)) || "Chưa xác định nhân viên", event);
  }
  const actual = [...sources.values()].reduce((sum, row) => sum + row.actualRevenue, 0);
  const revenueBySource = ranked(sources).map((row) => ({
    sourceKey: row.key, sourceName: row.label, sourceType: sourceTypes.get(row.key)!,
    bookingCount: row.bookingCount, guestCount: row.guestCount,
    roomNights: row.actualNights + row.projectedNights, totalRevenue: row.actualRevenue,
    actualRevenue: row.actualRevenue, projectedRevenue: row.projectedRevenue,
    sharePercent: actual > 0 ? Math.round(1000 * row.actualRevenue / actual) / 10 : 0,
    adr: row.actualNights > 0 ? Math.round(row.actualRoomRevenue / row.actualNights) : 0,
  }));
  const marketDimensions = {
    nationality: ranked(maps.nationality), roomType: ranked(maps.roomType), room: ranked(maps.room),
    partner: ranked(maps.partner), owner: ranked(maps.owner),
  };
  const revenueByBookingOwner = marketDimensions.owner.map((row) => ({
    ownerUserId: row.key, ownerName: row.label, bookingCount: row.bookingCount,
    roomNights: row.actualNights + row.projectedNights, revenue: row.actualRevenue,
  }));
  return { marketDimensions, revenueBySource, revenueByBookingOwner };
}
