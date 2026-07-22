export type GuestRequestType =
  | "HOUSEKEEPING"
  | "EXTRA_TOWELS"
  | "LAUNDRY"
  | "MAINTENANCE"
  | "FOOD_ORDERING"
  | "AIRPORT_TRANSFER"
  | "TOUR_BOOKING"
  | "ESIM_PURCHASE"
  | "AI_CONCIERGE";

export type GuestRequestStatus =
  | "CREATED"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "FAILED";

export type GuestRequestPriority = "NORMAL" | "URGENT";

export type GuestPortalRequestStatus = GuestRequestStatus;

export type GuestPortalRequestPriority = "NORMAL" | "URGENT";

export type GuestSessionStatus = "CREATED" | "ACTIVE" | "IDLE" | "EXPIRED" | "CLOSED";

export type GuestLocaleCode = "vi" | "en" | "zh" | "ko" | "ru" | "hi";

export type GuestHotel = {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  timezone: string;
  brandSettings: unknown;
};

export type GuestRoom = {
  id: string;
  roomNumber: string;
  floor: string | null;
  type: string | null;
  status: string;
};

export type GuestStay = {
  id: string;
  reservationCode: string;
  guestDisplayName: string;
  status: string;
  plannedCheckOutAt: string;
  checkedOutAt: string | null;
};

export type GuestSession = {
  id: string;
  hotelId: string;
  roomId: string;
  stayId: string;
  status: GuestSessionStatus;
  createdAt: string;
  activatedAt: string | null;
  lastSeenAt: string | null;
  idleAt: string | null;
  expiresAt: string;
  closedAt: string | null;
  hotel: GuestHotel;
  room: GuestRoom;
  stay: GuestStay;
};

export type GuestScanQrRequest = {
  qrCode: string;
  deviceFingerprint?: string;
  currentSessionToken?: string;
  forceSwitch?: boolean;
  locale?: GuestLocaleCode;
};

export type GuestScanQrResult = {
  sessionToken: string;
  expiresAt: string;
  locale?: GuestLocaleCode;
  supportedLocales?: GuestLocaleCode[];
  hotel: {
    name: string;
    timezone: string;
    brandSettings: Record<string, unknown> | null;
  };
  room: {
    roomNumber: string;
    floor: string | null;
    type: string | null;
  };
  guest: {
    displayName: string;
    plannedCheckOutAt: string;
  };
};

export type GuestCurrentSessionResult = {
  session: GuestSession;
  availableRequestTypes: GuestRequestType[];
};

export type GuestServiceItem = {
  id: string;
  hotelId?: string;
  categoryId?: string;
  requestType?: GuestRequestType;
  name: string;
  description: string | null;
  price: string | number | null;
  currency: string;
  quantityEnabled: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  metadata?: unknown;
  sortOrder?: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GuestCatalogServiceItem = Omit<GuestServiceItem, "price" | "currency"> & {
  effectivePrice: string | number | null;
  effectiveCurrency: string;
};

export type GuestServiceCategory = {
  id: string;
  hotelId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  items: GuestServiceItem[];
};

export type GuestServicesResult = {
  hotelId: string;
  categories: Array<Omit<GuestServiceCategory, "items"> & { items: GuestCatalogServiceItem[] }>;
};

export type GuestCategoryServicesResult = {
  category: Omit<GuestServiceCategory, "items">;
  services: GuestServiceItem[];
  page?: number;
  limit?: number;
  total?: number;
};

export type CreateGuestRequestInput = {
  serviceItemId: string;
  description?: string;
  quantity?: number;
  priority?: GuestPortalRequestPriority;
};

export type GuestRequest = {
  id: string;
  displayName: string;
  displayLocale?: GuestLocaleCode;
  status: GuestPortalRequestStatus;
  priority?: GuestPortalRequestPriority;
  quantity: number;
  description: string | null;
  answer: string | null;
  answerLocale?: GuestLocaleCode | string | null;
  currency?: string | null;
  unitPrice?: string | number | null;
  price?: string | number | null;
  totalPrice?: string | number | null;
  totalAmount?: string | number | null;
  estimatedTotalPrice?: string | number | null;
  estimatedTotalAmount?: string | number | null;
  createdAt: string;
  canCancel: boolean;
};

export type ListGuestRequestsQuery = {
  page?: number;
  limit?: number;
  status?: GuestPortalRequestStatus;
};

export type GuestRequestsResult = {
  page: number;
  limit: number;
  total: number;
  items: GuestRequest[];
};

export type CancelGuestRequestResult = GuestRequest;

export type GuestSessionCloseResult = {
  closed: true;
  session: GuestSession;
};

export type GuestMessageSenderType = "GUEST" | "STAFF" | "SYSTEM";
export type GuestMessage = {
  id: string;
  senderType: GuestMessageSenderType;
  senderName: string | null;
  body: string;
  createdAt: string;
  readAt?: string | null;
};
export type GuestMessageThread = {
  id: string;
  stayId: string;
  status: string;
  roomNumber: string;
  floor: string | null;
  roomType: string | null;
  guestName: string;
  lastMessageAt: string;
  expiresAt: string;
  clearedAt: string | null;
  unreadCount: number;
  latestMessage?: GuestMessage | null;
};
export type GuestMessagesResult = {
  page: number;
  limit: number;
  total: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  thread: GuestMessageThread | null;
  items: GuestMessage[];
};

export type EmergencyLocationSource =
  | "GPS"
  | "QR"
  | "INVITE"
  | "HOST_SELECTED"
  | "GUEST_SELECTED"
  | "MANUAL_ADDRESS"
  | "TENANT_DEFAULT"
  | "IP_DERIVED"
  | "UNKNOWN";

export type EmergencyLocationConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type CreateGuestEmergencyCallInput = {
  dialedNumber: string;
  callbackNumber?: string;
  callerReference?: string;
  location?: {
    emergencyLocationId?: string;
    dispatchableAddress?: string;
    source?: EmergencyLocationSource;
    confidence?: EmergencyLocationConfidence;
    latitude?: number;
    longitude?: number;
  };
  metadata?: Record<string, unknown>;
};

export type GuestEmergencyCallResult = {
  callEvent: {
    id: string;
    dialedNumber: string;
    lifecycleStatus: string;
    locationUncertain: boolean;
    incidentId: string | null;
  };
  incident: {
    id: string;
    status: string;
    severity: string;
    callCount: number;
    uniqueRoomCount: number;
    uniqueFloorCount: number;
    locationUncertain: boolean;
  };
};
