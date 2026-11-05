import type {
  HotelOpsPage,
  HotelRoomSummary,
  StaffRequestListItem,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export type {
  HotelOpsPage,
  HotelRoomSummary,
  StaffRequestListItem,
};

export type HousekeepingTaskStatus =
  | "QUEUED"
  | "CLAIMED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";

export type HousekeepingTaskPriority = "NORMAL" | "URGENT";

export type HousekeepingTask = {
  id: string;
  hotelId: string;
  roomId: string;
  roomNumber?: string;
  roomFloor?: string | null;
  roomTypeName?: string | null;
  stayId: string | null;
  status: HousekeepingTaskStatus;
  priority: HousekeepingTaskPriority;
  assignedToUserId: string | null;
  assignedToName?: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  blockedAt: string | null;
  blockReason: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type HousekeepingTasksSummary = {
  queued: number;
  claimed: number;
  inProgress: number;
  blocked: number;
  completed: number;
  totalActive: number;
};

export type HousekeepingTaskPage = HotelOpsPage<HousekeepingTask>;

export type HousekeepingRoomStatus =
  | "all"
  | "processing"
  | "cleaning"
  | "blocked"
  | "available"
  | "occupied"
  | "maintenance";

export type HousekeepingViewMode = "tasklist" | "grid";

export type HousekeepingFilterState = {
  status: HousekeepingRoomStatus;
  floor: string;
  search: string;
};

export type HousekeepingSummaryMetrics = {
  totalRooms: number;
  dirtyRoomsCount: number;
  cleaningRoomsCount: number;
  cleanRoomsCount: number;
  occupiedRoomsCount: number;
  maintenanceRoomsCount: number;
  cleaningRequestsCount: number;
  urgentRequestsCount: number;
};

export type ClaimedRoomInfo = {
  staffId: string;
  staffName: string;
  claimedAt: string;
};

export type HousekeepingTaskCardModel = {
  room: HotelRoomSummary;
  roomNumber: string;
  floor: string;
  roomType: string;
  effectiveStatus: "processing" | "cleaning" | "available" | "occupied" | "maintenance" | "blocked" | "reserved";
  isClaimedByMe: boolean;
  claimedInfo?: ClaimedRoomInfo;
  isVip: boolean;
  hasActiveStay: boolean;
  guestName?: string | null;
  plannedCheckOutAt?: string | null;
  cleaningRequests: StaffRequestListItem[];
  task?: HousekeepingTask;
};

export type HousekeepingAssignmentScope = {
  mode: "ALL" | "FLOORS" | "ROOMS";
  floors: string[];
  roomIds: string[];
  label: string | null;
  allowedRoomIds: string[] | null;
};

export type HousekeepingRoom = Pick<HotelRoomSummary, "id" | "roomNumber" | "floor" | "status" | "updatedAt" | "roomTypeName"> & { hotelId: string };
