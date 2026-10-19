import type {
  ChannelConnection,
  ChannelType,
  ChannexMappingBlocker,
  InventoryGridResponse,
  OtaAssignmentStatus,
  SimulatedBookingItem,
  SimulatedBookingSegmentItem,
  SyncStatus,
} from "../types/channel-manager.types";

export type BackendConnection = {
  id: string;
  hotelId: string;
  channelCode: ChannelType;
  title: string;
  status: "ACTIVE" | "PAUSED" | "ERROR";
  inboundIcalUrl: string | null;
  outboundToken: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  syncErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BackendInventoryGrid = {
  hotelId: string;
  startDate: string;
  endDate: string;
  roomTypes: Array<{
    roomType: string;
    totalInventoryRooms: number;
    channexMappingBlockers: ChannexMappingBlocker[];
    days: Array<{
      date: string;
      totalRooms: number;
      availableRooms: number;
      rate: number | string | null;
      minStayArrival: number;
      stopSell: boolean;
      closedToArrival: boolean;
      closedToDeparture: boolean;
      isFallbackRate?: boolean;
    }>;
  }>;
};

function mapSyncStatus(connection: BackendConnection): SyncStatus {
  if (
    connection.status === "ERROR" ||
    connection.lastSyncStatus === "FAILED" ||
    connection.lastSyncStatus === "ERROR"
  ) {
    return "ERROR";
  }
  if (connection.status === "PAUSED") return "PAUSED";
  if (connection.lastSyncStatus === "SUCCESS") return "SUCCESS";
  return "IDLE";
}

export function mapChannelConnection(
  connection: BackendConnection,
  appOrigin: string,
): ChannelConnection {
  return {
    id: connection.id,
    hotelId: connection.hotelId,
    channelType: connection.channelCode,
    name: connection.title,
    inboundUrl: connection.inboundIcalUrl ?? "",
    outboundUrl: `${appOrigin}/api/channel-manager/ical/${encodeURIComponent(connection.outboundToken)}.ics`,
    syncStatus: mapSyncStatus(connection),
    lastSyncAt: connection.lastSyncAt,
    errorReason: connection.syncErrorMessage,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export function mapInventoryGrid(
  grid: BackendInventoryGrid,
): InventoryGridResponse {
  return {
    hotelId: grid.hotelId,
    dateFrom: grid.startDate,
    dateTo: grid.endDate,
    roomTypes: grid.roomTypes.map((roomType) => {
      if (!Array.isArray(roomType.channexMappingBlockers)) {
        throw new Error("Inventory row missing channexMappingBlockers");
      }

      return {
        roomTypeId: roomType.roomType,
        roomTypeName: roomType.roomType,
        roomTypeCode: roomType.roomType,
        basePrice:
          roomType.days[0]?.rate === null ||
          roomType.days[0]?.rate === undefined
            ? null
            : Number(roomType.days[0].rate),
        totalRooms: roomType.totalInventoryRooms,
        channexMappingBlockers: [...roomType.channexMappingBlockers],
        days: roomType.days.map((day) => ({
          date: day.date,
          available: day.availableRooms,
          total: day.totalRooms,
          rate: day.rate === null ? null : Number(day.rate),
          minStay: day.minStayArrival,
          stopSell: day.stopSell,
          closedToArrival: day.closedToArrival,
          closedToDeparture: day.closedToDeparture,
          isFallbackRate: day.isFallbackRate ?? false,
        })),
      };
    }),
  };
}

export type BackendSimulatedBookingSegment =
  Partial<SimulatedBookingSegmentItem> & {
    id?: string;
  };

export type BackendSimulatedBooking = Omit<
  SimulatedBookingItem,
  "reservationId" | "reservationCode" | "status" | "segments"
> & {
  reservationId?: string;
  reservationCode?: string;
  status?: string;
  segments?: BackendSimulatedBookingSegment[];
};

export function mapSimulatedBooking(
  raw: BackendSimulatedBooking,
): SimulatedBookingItem {
  const segments: SimulatedBookingSegmentItem[] = raw.segments?.length
    ? raw.segments.map((segment, index) => ({
        segmentId: segment.segmentId ?? segment.reservationId ?? segment.id,
        reservationId:
          segment.reservationId ??
          segment.id ??
          `${raw.bookingId}-segment-${index + 1}`,
        reservationCode:
          segment.reservationCode ??
          `${raw.reservationCode ?? raw.bookingId}-${index + 1}`,
        roomType: segment.roomType ?? raw.roomType,
        roomId: segment.roomId ?? null,
        roomNumber: segment.roomNumber ?? null,
        status: segment.status ?? raw.status ?? "CONFIRMED",
        stayId: segment.stayId ?? null,
        stayStatus: segment.stayStatus ?? null,
        checkInDate: segment.checkInDate ?? raw.checkInDate,
        checkOutDate: segment.checkOutDate ?? raw.checkOutDate,
        amount: segment.amount ?? null,
        currency: segment.currency ?? raw.currency ?? null,
        groupCode: segment.groupCode ?? raw.groupCode ?? null,
      }))
    : [
        {
          segmentId: raw.reservationId ?? raw.bookingId,
          reservationId: raw.reservationId ?? raw.bookingId,
          reservationCode: raw.reservationCode ?? raw.bookingId,
          roomType: raw.roomType,
          roomId: raw.roomId ?? null,
          roomNumber: raw.roomNumber ?? null,
          status: raw.status ?? "CONFIRMED",
          stayId: raw.stayId ?? null,
          stayStatus: raw.stayStatus ?? null,
          checkInDate: raw.checkInDate,
          checkOutDate: raw.checkOutDate,
          amount: raw.amount,
          currency: raw.currency ?? null,
          groupCode: raw.groupCode ?? null,
        },
      ];
  const assignedCount =
    raw.assignedCount ?? segments.filter((item) => item.roomId).length;
  const totalSegments = raw.totalSegments ?? segments.length;
  const assignmentStatus: OtaAssignmentStatus =
    raw.assignmentStatus ??
    (assignedCount === 0
      ? "UNASSIGNED"
      : assignedCount === totalSegments
        ? "FULLY_ASSIGNED"
        : "PARTIALLY_ASSIGNED");
  const primary = segments[0];

  return {
    ...raw,
    reservationId: raw.reservationId ?? primary.reservationId,
    reservationCode: raw.reservationCode ?? primary.reservationCode,
    status: raw.status ?? primary.status ?? "CONFIRMED",
    roomId: raw.roomId ?? primary.roomId ?? null,
    roomType: raw.roomType ?? primary.roomType ?? null,
    roomNumber: raw.roomNumber ?? primary.roomNumber ?? null,
    stayId: raw.stayId ?? primary.stayId ?? null,
    stayStatus: raw.stayStatus ?? primary.stayStatus ?? null,
    checkInDate: raw.checkInDate ?? primary.checkInDate ?? null,
    checkOutDate: raw.checkOutDate ?? primary.checkOutDate ?? null,
    groupCode: raw.groupCode ?? primary.groupCode ?? null,
    assignedCount,
    totalSegments,
    assignmentStatus,
    segments,
  };
}

export function mapSimulatedBookings(
  bookings: BackendSimulatedBooking[] | null | undefined,
): SimulatedBookingItem[] {
  return Array.isArray(bookings) ? bookings.map(mapSimulatedBooking) : [];
}
