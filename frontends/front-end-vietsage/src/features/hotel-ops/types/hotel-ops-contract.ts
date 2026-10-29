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

export type StaffRequestAction = "ACCEPT" | "COMPLETE" | "CANCEL" | "REJECT";

export type HotelOpsPage<TItem> = {
  page: number;
  limit: number;
  total: number;
  totalItems?: number;
  totalPages?: number;
  totalAvailable?: number;
  byStatus?: {
    available: number;
    occupied: number;
    processing: number;
    maintenance: number;
    blocked?: number;
  };
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
  roomTypeId?: string | null;
  hotelId?: string;
  roomNumber?: string | null;
  floor?: string | null;
  zone?: string | null;
  type?: string | null;
  roomTypeName?: string | null;
  maxOccupancy?: number | null;
  price?: string | number | null;
  maxActiveGuestDevices?: number | null;
  activeGuestDeviceCount?: number | null;
  status?: string | null;
  physicalStatus?: string | null;
  projectedStatus?: string | null;
  statusConflictCode?: string | null;
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
  projectedStay?: HotelStaySummary | null;
  projectedReservation?: HotelReservationSummary | null;
  upcomingReservation?: HotelReservationSummary | null;
  businessDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type HotelRoomType = {
  id: string;
  name: string;
  basePrice: number | null;
  maxOccupancy?: number | null;
  readiness: "READY" | "MISSING_PRICE";
  roomCount: number;
};

export type HotelReservationSummary = {
  id: string;
  sourceType: "RESERVATION" | "STAY";
  groupCode?: string | null;
  hotelId?: string;
  roomId?: string | null;
  roomTypeSnapshot?: string | null;
  reservationCode: string;
  guestDisplayName: string;
  guestPhone?: string | null;
  status: string;
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
  nightlyRateSnapshot?: number | string | null;
  assignedAt?: string | null;
  assignedByUserId?: string | null;
  checkedInAt?: string | null;
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
  guestIdentityNumber?: string | null;
  guestDateOfBirth?: string | null;
  guestGender?: string | null;
  guestNationality?: string | null;
  guestResidencePlace?: string | null;
  status?: string | null;
  plannedCheckInAt?: string | null;
  plannedCheckOutAt?: string | null;
  nightlyRateSnapshot?: number | string | null;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  occupants?: Array<{
    id: string;
    fullName: string;
    phone?: string | null;
    identityNumber?: string | null;
    dateOfBirth?: string | null;
    gender?: string | null;
    nationality?: string | null;
    residencePlace?: string | null;
    isPrimary?: boolean;
  }> | null;
};

export type HotelCheckInResult = {
  stay: HotelStaySummary;
  roomQrCode: HotelRoomSummary["qr"];
  accessCode: string;
};

export type AssignReservationRoomInput = {
  roomId: string;
  nightlyRateSnapshot?: number;
  expectedUpdatedAt?: string;
  expectedRoomId?: string | null;
};

export type ReservationChargeLineInput = {
  lineType: "ROOM_NIGHT" | "EXTRA";
  serviceDate?: string;
  serviceItemId?: string;
  nameSnapshot: string;
  codeSnapshot?: string;
  quantity?: number;
  unitPriceSnapshot: number;
  taxAmountSnapshot?: number;
  discountAmountSnapshot?: number;
  totalSnapshot: number;
  currency?: string;
};

export type BookingSourceCategoryType =
  | "DIRECT"
  | "OTA"
  | "TA"
  | "TRAVEL_AGENCY"
  | "CORPORATE"
  | "OTHER";

export type BookingSourcePartnerItem = {
  id: string;
  hotelId: string;
  name: string;
  code: string;
  category: BookingSourceCategoryType;
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateBookingSourcePartnerInput = {
  name: string;
  code: string;
  category?: BookingSourceCategoryType;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  isActive?: boolean;
};

export type HotelStaffAssignmentItem = {
  id: string;
  hotelId: string;
  userId: string;
  status: "ACTIVE" | "REVOKED";
  role?: string;
  user: {
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
  };
};

export type HotelReservationInput = {
  guestDisplayName: string;
  guestPhone?: string;
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
  roomId?: string;
  roomTypeId?: string;
  guestCount?: number;
  notes?: string;
  nightlyRateSnapshot?: number | string;
  chargeLines?: ReservationChargeLineInput[];
  sourceCategory?: BookingSourceCategoryType;
  sourcePartnerId?: string | null;
  bookingOwnerUserId?: string | null;
  reservationCode?: string;
  groupCode?: string;
};

export type HotelReservationCheckInResult = {
  idempotent: boolean;
  accessCode: string | null;
  reservation: { id: string; status: string };
  stay: HotelStaySummary;
  folio: { id: string; status: string };
  roomQrCode: HotelRoomSummary["qr"];
};

export type BulkAllocationItem = {
  roomTypeId: string;
  quantity: number;
  rate?: number | string | null;
  nightlyRateSnapshot?: number | string | null;
};

export type BulkReservationInput = {
  leadGuestName: string;
  leadGuestPhone?: string;
  checkInDate: string;
  checkOutDate: string;
  roomIds?: string[];
  allocations?: BulkAllocationItem[];
  autoAssign?: boolean;
  rate?: number | string | null;
  nightlyRateSnapshot?: number | string | null;
  roomRates?: Record<string, number | string | null>;
  chargeLines?: ReservationChargeLineInput[];
  sourceCategory?: BookingSourceCategoryType;
  sourcePartnerId?: string | null;
  bookingOwnerUserId?: string | null;
  reservationCode?: string;
  groupCode?: string;
};

export type BulkReservationResult = {
  groupCode: string;
  reservations: HotelArrival[];
};

export type BulkReservationConflictData = {
  code?: string;
  detail?: string;
  unavailableRoomIds?: string[];
  conflictRoomIds?: string[];
  [key: string]: unknown;
};

export type HotelDashboard = {
  hotelId: string;
  generatedAt: string;
  rooms: {
    total: number;
    occupied: number;
    occupancyRate: number;
    byStatus: {
      available: number;
      occupied: number;
      processing: number;
      maintenance: number;
    };
  };
  guests?: {
    inHouse: number;
    advanceReservations: number;
    arrivalsToday: number;
    arrivalsTomorrow: number;
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
    byStatus: {
      sent: number;
      processing: number;
      completed: number;
      cancelled: number;
    };
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
    factors: Array<{
      type: string;
      label: string;
      impact: string;
      message: string;
    }>;
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
  roomTypeId?: string | null;
  room?: Pick<HotelRoomSummary, "id" | "roomNumber" | "type" | "maxOccupancy"> | null;
  reservationCode: string;
  groupCode?: string | null;
  guestCount?: number | null;
  notes?: string | null;
  guestDisplayName: string;
  guestPhone: string | null;
  status: "CONFIRMED" | "ARRIVAL_READY" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW";
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
  nightlyRateSnapshot?: number | string | null;
  rate?: string | null;
  updatedAt?: string | null;
};

export type ListHotelArrivalsQuery = {
  from?: string;
  to?: string;
  q?: string;
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
  assignedToUser?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
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
  isOverdue?: boolean;
  ackDeadlineAt?: string | null;
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
  zone?: string;
  type?: string;
  vipOnly?: boolean;
  businessDate?: string;
  page?: number;
  limit?: number;
};

export type CreateHotelRoomInput = {
  roomNumber: string;
  floor?: string;
  zone?: string | null;
  type?: string;
  roomTypeId?: string;
  newRoomType?: { name: string; basePrice: number; maxOccupancy?: number | null };
  price?: number;
  maxActiveGuestDevices?: number;
};

export type UpdateHotelRoomInput = {
  roomNumber?: string;
  floor?: string | null;
  zone?: string | null;
  type?: string | null;
  roomTypeId?: string;
  price?: number | null;
  maxActiveGuestDevices?: number | null;
};

export type CreateHotelStayInput = {
  roomId: string;
  guestDisplayName: string;
  guestPhone?: string;
  guestIdentityNumber?: string;
  guestDateOfBirth?: string;
  guestGender?: string;
  guestNationality?: string;
  guestResidencePlace?: string;
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
  nightlyRateSnapshot?: number;
  occupants?: Array<{
    fullName: string;
    phone?: string;
    identityNumber?: string;
    dateOfBirth?: string;
    gender?: string;
    nationality?: string;
    residencePlace?: string;
    isPrimary?: boolean;
  }>;
};

export type ServiceCatalogTranslationsInput = Partial<
  Record<
    "en" | "zh" | "ko" | "ru" | "hi",
    { name: string; description?: string | null }
  >
>;

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

export const hotelServiceStatuses: HotelServiceStatus[] = [
  "ACTIVE",
  "DISABLED",
];

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
  "PENDING",
  "ACKNOWLEDGED",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
];

export const hotelRequestPriorities: StaffRequestPriority[] = [
  "NORMAL",
  "URGENT",
];

export const validNextRequestStatuses: Record<
  GuestRequestStatus,
  GuestRequestStatus[]
> = {
  PENDING: ["ACKNOWLEDGED", "CANCELLED", "REJECTED"],
  ACKNOWLEDGED: ["COMPLETED", "CANCELLED", "REJECTED"],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

export type RoomPlanRoom = {
  id: string;
  roomNumber: string;
  floor: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
  status: string;
  physicalStatus?: string;
  statusConflictCode?: string | null;
  price?: number | null;
};

export type RoomPlanBlock = {
  id: string;
  kind: "RESERVATION" | "STAY";
  reservationId: string | null;
  guestStayId: string | null;
  reservationCode: string | null;
  groupCode?: string | null;
  guestName: string;
  guestCount?: number | null;
  phone: string | null;
  source: string | null;
  channel: string | null;
  channelName?: string | null;
  sourceCategory?: string | null;
  sourcePartnerId?: string | null;
  sourcePartnerName?: string | null;
  bookingOwnerUserId?: string | null;
  bookingOwnerName?: string | null;
  status: string;
  roomId: string;
  roomNumber: string;
  roomTypeId: string | null;
  roomTypeName: string | null;
  startDate: string;
  endDate: string;
  nights: number;
  nightlyRate: number | null;
  roomSubtotal?: number | null;
  serviceSubtotal?: number | null;
  totalAmount?: number | null;
  services?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  movable: boolean;
  expectedUpdatedAt: string;
  notes?: string | null;
};

export type RoomPlanResponse = {
  hotelId: string;
  timezone: string;
  from: string;
  to: string;
  rooms: RoomPlanRoom[];
  blocks: RoomPlanBlock[];
};

export type UpdateReservationPlacementInput = {
  targetRoomId: string;
  expectedUpdatedAt: string;
  swapWithReservationId?: string;
  swapExpectedUpdatedAt?: string;
};

export type ConfirmationHotelInfo = {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string | null;
  checkInTimePolicy: string;
  checkOutTimePolicy: string;
};

export type ConfirmationNightlyItem = {
  date: string;
  description: string;
  rate: number;
  lineType: string;
};

export type ConfirmationServiceItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type ConfirmationPricing = {
  nightlyBreakdown: ConfirmationNightlyItem[];
  serviceBreakdown?: ConfirmationServiceItem[];
  roomSubtotal: number;
  taxAmount: number;
  serviceAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  currency: string;
};

export type ConfirmationPolicies = {
  checkInTime: string;
  checkOutTime: string;
  cancellationPolicy: string;
  terms: string[];
  footerNoteText?: string;
};

export type HotelConfirmationTemplateConfig = {
  id?: string;
  hotelId?: string;
  title?: string;
  subtitle?: string | null;
  contactInfo?: string | null;
  checkInPolicy?: string | null;
  checkOutPolicy?: string | null;
  paymentTerms?: string | null;
  footerNotes?: string | null;
  showLogo?: boolean;
  showPriceBreakdown?: boolean;
};

export type ReservationConfirmationData = {
  hotel: ConfirmationHotelInfo;
  template?: HotelConfirmationTemplateConfig | null;
  reservation: {
    id: string;
    reservationCode: string;
    groupCode: string | null;
    status: string;
    guestDisplayName: string;
    guestPhone: string | null;
    guestCount: number;
    roomType: { id: string | null; name: string; code?: string } | null;
    room: { id: string; roomNumber: string; floor?: string | null } | null;
    plannedCheckInAt: string;
    plannedCheckOutAt: string;
    nights: number;
    notes: string | null;
    sourceCategory?: string | null;
    sourcePartnerId?: string | null;
    sourcePartnerName?: string | null;
    bookingOwnerUserId?: string | null;
    bookingOwnerName?: string | null;
    createdAt: string;
  };
  pricing: ConfirmationPricing;
  policies: ConfirmationPolicies;
};

export type GroupConfirmationRoomItem = {
  reservationId: string;
  reservationCode: string;
  guestDisplayName: string;
  guestPhone: string | null;
  guestCount: number;
  roomNumber: string;
  floor: string | null;
  roomTypeName: string;
  plannedCheckInAt: string;
  plannedCheckOutAt: string;
  nights: number;
  nightlyRate: number;
  roomSubtotal: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
};

export type GroupConfirmationData = {
  hotel: ConfirmationHotelInfo;
  template?: HotelConfirmationTemplateConfig | null;
  group: {
    groupCode: string;
    groupName: string | null;
    leadGuestName: string;
    leadGuestPhone: string | null;
    notes: string | null;
    totalRooms: number;
    checkInDate: string;
    checkOutDate: string;
    nights: number;
  };
  rooms: GroupConfirmationRoomItem[];
  pricing: {
    totalRooms: number;
    totalGuests: number;
    roomSubtotal: number;
    serviceBreakdown?: ConfirmationServiceItem[];
    taxAmount: number;
    serviceAmount: number;
    discountAmount: number;
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    currency: string;
  };
  policies: ConfirmationPolicies;
};

