export type ChannelType =
  "AIRBNB_ICAL" | "BOOKING_ICAL" | "AGODA_ICAL" | "DIRECT_BOOKING" | "CHANNEX";

export type SyncStatus = "IDLE" | "SYNCING" | "SUCCESS" | "ERROR" | "PAUSED";

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
  rate: number | null;
  minStay: number;
  stopSell: boolean;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
}

export interface RoomTypeInventory {
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string;
  basePrice: number | null;
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
  rate: number;
  minStay?: number;
  stopSell?: boolean;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
}

export interface AvailabilityUpdateItem {
  roomTypeId: string;
  date: string;
  available: number;
  totalRooms: number;
}

export interface BulkUpdatePayload {
  roomTypeIds: string[];
  dateFrom: string;
  dateTo: string;
  daysOfWeek: number[]; // 0 = CN, 1 = T2, 2 = T3, 3 = T4, 4 = T5, 5 = T6, 6 = T7
  rate?: number;
  minStay?: number;
  stopSell?: boolean;
}

export interface ChannexMappingItem {
  id: string;
  kind: string;
  localId: string;
  channexId: string;
  createdAt: string;
  metadata?: unknown;
}

export interface ChannexDoctorCheck {
  id: string;
  name: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  details?: unknown;
}

export interface ChannexDoctorReport {
  hotelId: string;
  healthy: boolean;
  timestamp: string;
  environment: string;
  checks: ChannexDoctorCheck[];
}

export interface ChannexChannelSession {
  iframeUrl: string;
  expiresInSeconds: number;
}

export type ChannexSettingValue = string | number | boolean;

export interface ChannexChannelParameter {
  key: string;
  title?: string;
  type: string;
  position: number;
  default?: ChannexSettingValue;
  options?: string[];
  rules?: Array<{
    apply: string;
    when: string | boolean;
    influence_field: string;
    with_value: string;
  }>;
}

export interface ChannexChannelProvider {
  code: string;
  title: string;
  kind: "ota" | "meta" | "cm";
  mappingMode: string | null;
  propertyMapping: string | null;
  messageSupport: boolean;
  nativeSupported: boolean;
  parameters: ChannexChannelParameter[];
  rateParameters: ChannexChannelParameter[];
}

export interface ChannexConnectedChannel {
  id: string;
  code: string;
  title: string;
  currency: string | null;
  isActive: boolean;
}

export interface ChannexChannelCatalog {
  propertyId: string | null;
  providers: ChannexChannelProvider[];
  connections: ChannexConnectedChannel[];
}

export interface ChannexLocalRatePlan {
  id: string;
  title: string;
  roomTypeId: string | null;
  occupancy: number | null;
}

export interface ChannexChannelPrepareInput {
  channel: string;
  settings: Record<string, ChannexSettingValue>;
}

export interface ChannexChannelPrepareResult {
  supported: boolean;
  reason?: string;
  propertyId?: string;
  propertyTitle?: string;
  groupId?: string;
  currency?: string;
  adapter: ChannexChannelProvider;
  localRatePlans?: ChannexLocalRatePlan[];
  mappingDetails?: unknown;
}

export interface ChannexChannelCreateInput {
  channel: string;
  title: string;
  settings: Record<string, ChannexSettingValue>;
  ratePlans: Array<{
    rate_plan_id: string;
    settings: Record<string, ChannexSettingValue>;
  }>;
}

export interface ChannexChannelCreateResult {
  channelId: string;
  ready: boolean;
  issues: unknown[];
}

export interface SimulateBookingInput {
  otaName: string;
  roomType?: string;
  checkinDate?: string;
  checkoutDate?: string;
  amount?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface SimulateBookingResult {
  success: boolean;
  channexBookingId: string;
  otaReservationCode: string;
  channelName: string;
  feedProcessed?: {
    totalProcessed: number;
    newBookingsCount: number;
  };
  reservation?: {
    id: string;
    bookingCode: string;
    status: string;
    roomId?: string | null;
    roomNumber?: string | null;
    checkInDate: string;
    checkOutDate: string;
    totalAmount: number;
  };
  message: string;
}

export interface AvailableChannexProperty {
  id: string;
  title: string;
  currency: string;
  url: string;
}

export interface ChannexPropertyConfig {
  hotelId: string;
  hotelName: string;
  hotelCode?: string | null;
  tenantName?: string | null;
  channexPropertyId: string | null;
  isConfigured: boolean;
  channexPropertyUrl: string | null;
  availableProperties: AvailableChannexProperty[];
}

export interface ConfigureChannexPropertyResult {
  success: boolean;
  hotelId: string;
  channexPropertyId: string;
  propertyTitle: string;
  propertyUrl: string;
  message: string;
}

export interface SimulatedBookingItem {
  bookingId: string;
  reservationId: string;
  reservationCode: string;
  otaName: string;
  otaReservationCode: string | null;
  guestName: string;
  guestPhone: string | null;
  roomType: string | null;
  roomNumber: string | null;
  status: string;
  checkInDate: string | null;
  checkOutDate: string | null;
  amount: number | null;
  currency?: string | null;
  createdAt: string;
}

export interface CancelSimulatedBookingInput {
  bookingId?: string;
  reservationId?: string;
  otaReservationCode?: string;
}

export interface CancelSimulatedBookingResult {
  success: boolean;
  bookingId: string;
  reservationId: string;
  status: string;
  otaName?: string;
  otaReservationCode?: string;
  message: string;
}
