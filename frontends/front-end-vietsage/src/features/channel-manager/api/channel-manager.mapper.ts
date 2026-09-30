import type {
  ChannelConnection,
  ChannelType,
  InventoryGridResponse,
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
    days: Array<{
      date: string;
      totalRooms: number;
      availableRooms: number;
      rate: number | string | null;
      minStayArrival: number;
      stopSell: boolean;
      closedToArrival: boolean;
      closedToDeparture: boolean;
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
    roomTypes: grid.roomTypes.map((roomType) => ({
      roomTypeId: roomType.roomType,
      roomTypeName: roomType.roomType,
      roomTypeCode: roomType.roomType,
      basePrice:
        roomType.days[0]?.rate === null || roomType.days[0]?.rate === undefined
          ? null
          : Number(roomType.days[0].rate),
      totalRooms: roomType.totalInventoryRooms,
      days: roomType.days.map((day) => ({
        date: day.date,
        available: day.availableRooms,
        total: day.totalRooms,
        rate: day.rate === null ? null : Number(day.rate),
        minStay: day.minStayArrival,
        stopSell: day.stopSell,
        closedToArrival: day.closedToArrival,
        closedToDeparture: day.closedToDeparture,
      })),
    })),
  };
}
