import type {
  GuestRequestStatus,
  GuestRequestType,
} from "@/features/guest-os/types/guest-os-contract";

export type HotelServiceStatus = "ACTIVE" | "DISABLED";

export type ServiceCatalogTranslation = {
  id?: string;
  locale: string;
  name: string;
  description: string | null;
};

export type StaffRequestPriority = "NORMAL" | "URGENT";

export type StaffRequestAction = "ACCEPT" | "START" | "COMPLETE" | "CANCEL" | "FAIL";

export type HotelOpsPage<TItem> = {
  page: number;
  limit: number;
  total: number;
  totalItems?: number;
  totalPages?: number;
  totalAvailable?: number;
  floors?: string[];
  types?: string[];
  items: TItem[];
};

export type HotelServiceCategory = {
  id: string;
  hotelId: string;
  name: string;
  description: string | null;
  id_group?: string | null;
  defaultPrice: string | number | null;
  currency: string;
  sortOrder: number;
  status: HotelServiceStatus;
  createdAt: string;
  updatedAt: string;
  translations?: ServiceCatalogTranslation[];
};

export type HotelServiceItem = {
  id: string;
  hotelId: string;
  categoryId: string;
  category?: HotelServiceCategory | null;
  priceOverride: string | number | null;
  effectivePrice: string | number | null;
  effectiveCurrency: string;
  quantityEnabled: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  /** @deprecated Service routing now belongs to ServiceCategory. */
  name: string;
  description: string | null;
  /** @deprecated Use priceOverride/effectivePrice. */
  price: string | number | null;
  /** @deprecated Use category.currency/effectiveCurrency. */
  currency: string;
  metadata: Record<string, unknown> | null;
  sortOrder: number;
  status: HotelServiceStatus;
  createdAt: string;
  updatedAt: string;
  translations?: ServiceCatalogTranslation[];
};

export type HotelRoomSummary = {
  id: string;
  hotelId?: string;
  roomNumber?: string | null;
  floor?: string | null;
  type?: string | null;
  price?: string | number | null;
  maxActiveGuestDevices?: number | null;
  activeGuestDeviceCount?: number | null;
  status?: string | null;
  publicCode?: string | null;
  qrCode?: string | null;
  qrStatus?: string | null;
  qr?: {
    id?: string | null;
    publicCode?: string | null;
    code?: string | null;
    qrCode?: string | null;
    status?: string | null;
  } | null;
  activeStay?: HotelStaySummary | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type HotelStaySummary = {
  id: string;
  hotelId?: string;
  roomId?: string | null;
  reservationCode?: string | null;
  guestDisplayName?: string | null;
  guestPhone?: string | null;
  status?: string | null;
  plannedCheckInAt?: string | null;
  plannedCheckOutAt?: string | null;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type HotelCheckInResult = {
  stay: HotelStaySummary;
  roomQrCode: HotelRoomSummary["qr"];
  accessCode: string;
};

export type HotelReservationInput = {
  guestDisplayName: string;
  guestPhone?: string;
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
};

export type HotelReservationCheckInResult = {
  idempotent: boolean;
  accessCode: string | null;
  reservation: { id: string; status: string };
  stay: HotelStaySummary;
  folio: { id: string; status: string };
  roomQrCode: HotelRoomSummary["qr"];
};

export type HotelDashboard = {
  hotelId: string;
  generatedAt: string;
  rooms: {
    total: number;
    occupied: number;
    occupancyRate: number;
    byStatus: { available: number; occupied: number; processing: number; maintenance: number };
  };
  stays: {
    todayCheckIns: number;
    todayCheckOuts: number;
    pendingCheckOuts: number;
    activeStays: number;
  };
  requests: {
    unprocessed: number;
    urgentUnprocessed: number;
    byStatus: { sent: number; processing: number; completed: number; cancelled: number };
    topServices: Array<{ serviceName: string; count: number }>;
  };
  revenue: {
    available: boolean;
    currency: string;
    today: number;
    last7Days: number;
    currentMonth: number;
    issues: Array<{ type: string; count: number }>;
  };
  health: {
    score: number;
    status: "excellent" | "good" | "warning" | "critical";
    title: string;
    factors: Array<{ type: string; label: string; impact: string; message: string }>;
  };
  attention: Array<{
    id: string;
    type: string;
    priority: string;
    title: string;
    description: string;
    createdAt: string;
    action: { label: string; route: string };
  }>;
  insights: Array<{
    id: string;
    type: string;
    severity: "info" | "warning" | "critical";
    title: string;
    description: string;
    metric?: { current: number; previous?: number; changePercent?: number };
  }>;
  sla: {
    available: boolean;
    averageResponseMinutes: number | null;
    averageCompletionMinutes: number | null;
    completedWithinSlaPercent: number | null;
    thresholdMinutes: number;
  };
  activities: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    createdAt: string;
  }>;
  warnings: string[];
};

export type HotelArrival = {
  id: string;
  hotelId: string;
  roomId: string | null;
  reservationCode: string;
  guestDisplayName: string;
  guestPhone: string | null;
  status: "CONFIRMED" | "ARRIVAL_READY" | "CHECKED_IN";
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
};

export type ListHotelArrivalsQuery = {
  from: string;
  to: string;
  page?: number;
  limit?: number;
};

export type HotelRequestEvent = {
  id: string;
  requestId: string;
  type?: string | null;
  status?: GuestRequestStatus | null;
  note?: string | null;
  visibility?: "GUEST" | "INTERNAL" | string | null;
  metadata?: Record<string, unknown> | null;
  actorUserId?: string | null;
  createdAt: string;
};

export type HotelGuestRequest = {
  id: string;
  hotelId: string;
  roomId: string;
  stayId: string;
  sessionId: string | null;
  serviceItemId: string | null;
  serviceItem?: HotelServiceItem | null;
  room?: HotelRoomSummary | null;
  stay?: HotelStaySummary | null;
  type: GuestRequestType;
  status: GuestRequestStatus;
  priority: StaffRequestPriority;
  title: string | null;
  details: string | null;
  metadata: Record<string, unknown> | null;
  assignedToUserId: string | null;
  assignedToUser?: { id?: string; name?: string | null; email?: string | null } | null;
  events?: HotelRequestEvent[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type StaffRequestListItem = {
  id: string;
  displayName: string;
  status: GuestRequestStatus;
  priority: StaffRequestPriority;
  quantity: number;
  description: string | null;
  latestNote: string | null;
  createdAt: string;
  roomNumber: string;
  guestName: string | null;
  categoryName: string | null;
  assignedToName: string | null;
  stayStatus?: string | null;
  checkedOutAt?: string | null;
  actions: StaffRequestAction[];
};

export type StaffRequestSummaryResponse = {
  total: number;
  statuses: Record<GuestRequestStatus, number>;
};

export type ListServiceCategoriesQuery = {
  status?: HotelServiceStatus;
  page?: number;
  limit?: number;
  q?: string;
};

export type ListServiceItemsQuery = {
  categoryId?: string;
  status?: HotelServiceStatus;
  page?: number;
  limit?: number;
  q?: string;
};

export type ListHotelRequestsQuery = {
  q?: string;
  roomNumber?: string;
  serviceItemId?: string;
  priority?: StaffRequestPriority;
  status?: GuestRequestStatus;
  assignedToUserId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export type ListHotelRoomsQuery = {
  q?: string;
  status?: string;
  floor?: string;
  type?: string;
  vipOnly?: boolean;
  page?: number;
  limit?: number;
};

export type CreateHotelRoomInput = {
  roomNumber: string;
  floor?: string;
  type?: string;
  price?: number;
  maxActiveGuestDevices?: number;
};

export type UpdateHotelRoomInput = {
  roomNumber?: string;
  floor?: string | null;
  type?: string | null;
  price?: number | null;
  maxActiveGuestDevices?: number | null;
  status?: string | null;
};

export type CreateHotelStayInput = {
  roomId: string;
  guestDisplayName: string;
  guestPhone?: string;
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
};

export type ServiceCatalogTranslationsInput = Partial<Record<"en" | "zh" | "ko" | "ru" | "hi", { name: string; description?: string | null }>>;

export type CreateServiceCategoryInput = {
  name: string;
  description?: string;
  id_group?: string | null;
  defaultPrice?: number;
  currency?: string;
  sortOrder?: number;
  status?: HotelServiceStatus;
  translations?: ServiceCatalogTranslationsInput;
};

export type UpdateServiceCategoryInput = {
  name?: string;
  description?: string | null;
  id_group?: string | null;
  defaultPrice?: number | null;
  currency?: string;
  priceUpdateMode?: "CATEGORY_ONLY" | "OVERRIDE_ALL_ITEMS";
  sortOrder?: number;
  status?: HotelServiceStatus;
  translations?: ServiceCatalogTranslationsInput;
};

export type CreateServiceItemInput = {
  categoryId: string;
  name: string;
  description?: string;
  priceOverride?: number | null;
  quantityEnabled?: boolean;
  minQuantity?: number;
  maxQuantity?: number | null;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
  status?: HotelServiceStatus;
  translations?: ServiceCatalogTranslationsInput;
};

export type UpdateServiceItemInput = {
  categoryId?: string;
  name?: string;
  description?: string | null;
  priceOverride?: number | null;
  quantityEnabled?: boolean;
  minQuantity?: number;
  maxQuantity?: number | null;
  metadata?: Record<string, unknown> | null;
  sortOrder?: number;
  status?: HotelServiceStatus;
  translations?: ServiceCatalogTranslationsInput;
};

export type UpdateHotelRequestStatusInput = {
  status: GuestRequestStatus;
  note?: string;
  assignedToUserId?: string;
};

export type UpdateHotelRequestAssignmentInput = {
  assignedToUserId?: string | null;
  note?: string;
};

export type CreateHotelRequestEventInput = {
  note: string;
  visibility?: "GUEST" | "INTERNAL";
  metadata?: Record<string, unknown>;
};

export const hotelServiceStatuses: HotelServiceStatus[] = ["ACTIVE", "DISABLED"];

export const hotelRequestTypes: GuestRequestType[] = [
  "HOUSEKEEPING",
  "EXTRA_TOWELS",
  "LAUNDRY",
  "MAINTENANCE",
  "FOOD_ORDERING",
  "AIRPORT_TRANSFER",
  "TOUR_BOOKING",
  "ESIM_PURCHASE",
  "AI_CONCIERGE",
];

export const hotelRequestStatuses: GuestRequestStatus[] = [
  "CREATED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
];

export const hotelRequestPriorities: StaffRequestPriority[] = ["NORMAL", "URGENT"];

export const validNextRequestStatuses: Record<GuestRequestStatus, GuestRequestStatus[]> = {
  CREATED: ["ACKNOWLEDGED", "CANCELLED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};
