export type ChannelType =
  | "AIRBNB_ICAL"
  | "BOOKING_ICAL"
  | "AGODA_ICAL"
  | "DIRECT_ENGINE";

export type SyncStatus = "IDLE" | "SYNCING" | "SUCCESS" | "ERROR";

export interface ChannelConnection {
  id: string;
  hotelId: string;
  channelType: ChannelType;
  name: string;
  inboundUrl: string;
  outboundUrl: string;
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionPayload {
  channelType: ChannelType;
  name: string;
  inboundUrl: string;
}

export interface DayInventory {
  date: string; // YYYY-MM-DD
  available: number;
  total: number;
  rate: number;
  minStay: number;
  stopSell: boolean;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
}

export interface RoomTypeInventory {
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string;
  basePrice: number;
  totalRooms: number;
  days: DayInventory[];
}

export interface InventoryGridResponse {
  hotelId: string;
  dateFrom: string;
  dateTo: string;
  roomTypes: RoomTypeInventory[];
}

export interface RestrictionUpdateItem {
  roomTypeId: string;
  date: string;
  rate?: number;
  minStay?: number;
  stopSell?: boolean;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
}

export interface AvailabilityUpdateItem {
  roomTypeId: string;
  date: string;
  available: number;
}

export interface BulkUpdatePayload {
  roomTypeIds?: string[];
  dateFrom: string;
  dateTo: string;
  daysOfWeek: number[]; // 0 = CN, 1 = T2, 2 = T3, 3 = T4, 4 = T5, 5 = T6, 6 = T7
  rate?: number;
  minStay?: number;
  stopSell?: boolean;
}
