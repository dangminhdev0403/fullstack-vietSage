import type {
  ClaimedRoomInfo,
  HotelRoomSummary,
  HousekeepingFilterState,
  HousekeepingSummaryMetrics,
  HousekeepingTaskCardModel,
  HousekeepingTask,
  StaffRequestListItem,
} from "../types/housekeeping-contract";

export function normalizeStatus(status?: string | null): string {
  return (status ?? "").trim().toUpperCase();
}

export function getFloorName(floor?: string | null): string {
  if (!floor || !floor.trim()) return "Tầng 1";
  const trimmed = floor.trim();
  if (/^\d+$/.test(trimmed)) return `Tầng ${trimmed}`;
  if (/^tầng/i.test(trimmed)) return trimmed;
  return `Tầng ${trimmed}`;
}

export function getActiveHousekeepingRequests(
  requests: readonly StaffRequestListItem[],
): StaffRequestListItem[] {
  return requests.filter((request) => {
    if (request.status !== "PENDING" && request.status !== "ACKNOWLEDGED") {
      return false;
    }

    const category = (request.categoryName ?? "").toLowerCase();
    const displayName = (request.displayName ?? "").toLowerCase();
    const description = (request.description ?? "").toLowerCase();
    return (
      category.includes("dọn") ||
      category.includes("clean") ||
      category.includes("buồng") ||
      category.includes("housekeeping") ||
      displayName.includes("dọn") ||
      displayName.includes("khăn") ||
      displayName.includes("ga") ||
      description.includes("dọn") ||
      description.includes("vệ sinh")
    );
  });
}

function getEffectiveRoomStatus(
  room: HotelRoomSummary,
  isClaimed: boolean,
  task?: HousekeepingTask,
): HousekeepingTaskCardModel["effectiveStatus"] {
  const rawStatus = normalizeStatus(room.status);
  if (task?.status === "BLOCKED") return "blocked";
  if (task?.status === "CLAIMED" || task?.status === "IN_PROGRESS" || isClaimed) return "cleaning";
  if (task?.status === "QUEUED" || rawStatus === "PROCESSING") return "processing";
  if (rawStatus === "OCCUPIED") return "occupied";
  if (rawStatus === "MAINTENANCE" || rawStatus === "BLOCKED" || rawStatus === "OUT_OF_SERVICE") return "maintenance";
  if (rawStatus === "RESERVED") return "reserved";
  return "available";
}

export function calculateHousekeepingMetrics(
  allRooms: readonly HotelRoomSummary[],
  claimedRoomsMap: Record<string, ClaimedRoomInfo>,
  cleaningRequests: readonly StaffRequestListItem[],
  tasksByRoom: Readonly<Record<string, HousekeepingTask>> = {},
): HousekeepingSummaryMetrics {
  let dirtyCount = 0;
  let cleaningCount = 0;
  let cleanCount = 0;
  let occupiedCount = 0;
  let maintenanceCount = 0;

  for (const room of allRooms) {
    const status = getEffectiveRoomStatus(room, Boolean(claimedRoomsMap[room.id]), tasksByRoom[room.id]);

    if (status === "cleaning") {
      cleaningCount += 1;
    }

    if (status === "processing" || status === "cleaning") {
      dirtyCount += 1;
    } else if (status === "available") {
      cleanCount += 1;
    } else if (status === "occupied") {
      occupiedCount += 1;
    } else if (status === "maintenance" || status === "blocked") {
      maintenanceCount += 1;
    }
  }

  const urgentCount = cleaningRequests.filter(
    (r) => r.priority === "URGENT",
  ).length;

  return {
    totalRooms: allRooms.length,
    dirtyRoomsCount: dirtyCount,
    cleaningRoomsCount: cleaningCount,
    cleanRoomsCount: cleanCount,
    occupiedRoomsCount: occupiedCount,
    maintenanceRoomsCount: maintenanceCount,
    cleaningRequestsCount: cleaningRequests.length,
    urgentRequestsCount: urgentCount,
  };
}

export function buildHousekeepingTaskCards(
  allRooms: readonly HotelRoomSummary[],
  claimedRoomsMap: Record<string, ClaimedRoomInfo>,
  currentUserId: string,
  cleaningRequests: readonly StaffRequestListItem[],
  filter: HousekeepingFilterState,
  tasksByRoom: Readonly<Record<string, HousekeepingTask>> = {},
): HousekeepingTaskCardModel[] {
  const { status: filterStatus, floor: filterFloor, search: filterSearch } = filter;
  const cleanSearch = filterSearch.trim().toLowerCase();

  return allRooms
    .map((room) => {
      const isClaimed = Boolean(claimedRoomsMap[room.id]);
      const claimedInfo = claimedRoomsMap[room.id];
      const isClaimedByMe = claimedInfo?.staffId === currentUserId;
      const task = tasksByRoom[room.id];

      const effectiveStatus = getEffectiveRoomStatus(room, isClaimed, task);

      const roomNumber = (room.roomNumber ?? "").trim();
      const floor = getFloorName(room.floor);
      const roomType = room.roomTypeName || room.type || "Phòng tiêu chuẩn";
      const isVip = /suite|vip|premium|penthouse/i.test(roomType);
      const hasActiveStay = Boolean(room.activeStay);

      const roomRequests = cleaningRequests.filter(
        (req) => req.roomNumber === roomNumber,
      );

      return {
        room,
        roomNumber,
        floor,
        roomType,
        effectiveStatus,
        isClaimedByMe,
        claimedInfo,
        isVip,
        hasActiveStay,
        guestName: room.activeStay?.guestDisplayName ?? null,
        plannedCheckOutAt: room.activeStay?.plannedCheckOutAt ?? null,
        cleaningRequests: roomRequests,
        task,
      };
    })
    .filter((card) => {
      // Status filter
      if (filterStatus === "processing") {
        if (card.effectiveStatus !== "processing" && card.effectiveStatus !== "cleaning") return false;
      } else if (filterStatus === "cleaning") {
        if (card.effectiveStatus !== "cleaning") return false;
      } else if (filterStatus === "blocked") {
        if (card.effectiveStatus !== "blocked") return false;
      } else if (filterStatus === "available") {
        if (card.effectiveStatus !== "available") return false;
      } else if (filterStatus === "occupied") {
        if (card.effectiveStatus !== "occupied") return false;
      } else if (filterStatus === "maintenance") {
        if (card.effectiveStatus !== "maintenance") return false;
      }

      // Floor filter
      if (filterFloor !== "all") {
        const cardFloorNum = (card.room.floor ?? "").trim();
        if (cardFloorNum !== filterFloor) return false;
      }

      // Search filter
      if (cleanSearch) {
        const matchNum = card.roomNumber.toLowerCase().includes(cleanSearch);
        const matchType = card.roomType.toLowerCase().includes(cleanSearch);
        const matchGuest = (card.guestName ?? "").toLowerCase().includes(cleanSearch);
        if (!matchNum && !matchType && !matchGuest) return false;
      }

      return true;
    });
}

export function buildHousekeepingRoomNotifications(
  cards: readonly HousekeepingTaskCardModel[],
): HousekeepingTaskCardModel[] {
  return cards
    .filter((card) => card.effectiveStatus === "processing")
    .sort((a, b) => {
      const aUrgent = a.task?.priority === "URGENT" || a.cleaningRequests.some((request) => request.priority === "URGENT");
      const bUrgent = b.task?.priority === "URGENT" || b.cleaningRequests.some((request) => request.priority === "URGENT");
      if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;

      const aCreatedAt = a.task?.createdAt ?? "";
      const bCreatedAt = b.task?.createdAt ?? "";
      if (aCreatedAt !== bCreatedAt) {
        if (!aCreatedAt) return 1;
        if (!bCreatedAt) return -1;
        return aCreatedAt.localeCompare(bCreatedAt);
      }
      return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
    });
}
