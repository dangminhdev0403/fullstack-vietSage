import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires explicit extension.
import { calculateHousekeepingMetrics, buildHousekeepingTaskCards, buildHousekeepingRoomNotifications, getActiveHousekeepingRequests, normalizeStatus, getFloorName } from "../utils/housekeeping-helpers.ts";
// @ts-expect-error Node strip-types requires explicit extension.
import { buildWorkspaceNavigation, getWorkspaceDefinition, resolveWorkspacePersona } from "../../workspace/config/workspace-registry.ts";
import type { HotelRoomSummary, HousekeepingTask, StaffRequestListItem } from "../types/housekeeping-contract";

function makeTask(roomId: string, patch: Partial<HousekeepingTask> = {}): HousekeepingTask {
  return {
    id: `task-${roomId}`,
    hotelId: "hotel-123",
    roomId,
    stayId: null,
    status: "QUEUED",
    priority: "NORMAL",
    assignedToUserId: null,
    assignedAt: null,
    startedAt: null,
    completedAt: null,
    blockedAt: null,
    blockReason: null,
    notes: null,
    version: 1,
    createdAt: "2026-11-06T00:00:00Z",
    updatedAt: "2026-11-06T00:00:00Z",
    ...patch,
  };
}

function makeRequest(id: string, patch: Partial<StaffRequestListItem> = {}): StaffRequestListItem {
  return {
    id,
    displayName: "Dọn phòng",
    categoryName: "Buồng phòng",
    status: "PENDING",
    priority: "NORMAL",
    roomNumber: "101",
    quantity: 1,
    description: null,
    latestNote: null,
    createdAt: "2026-11-06T00:00:00Z",
    guestName: null,
    assignedToName: null,
    actions: [],
    ...patch,
  };
}

test("calculateHousekeepingMetrics correctly aggregates dirty, cleaning, clean, and occupied counts", () => {
  const mockRooms: HotelRoomSummary[] = [
    { id: "r1", roomNumber: "101", floor: "1", status: "PROCESSING" },
    { id: "r2", roomNumber: "102", floor: "1", status: "PROCESSING" },
    { id: "r3", roomNumber: "201", floor: "2", status: "AVAILABLE" },
    { id: "r4", roomNumber: "202", floor: "2", status: "OCCUPIED" },
    { id: "r5", roomNumber: "301", floor: "3", status: "MAINTENANCE" },
  ];

  const claimedRoomsMap = {
    r2: {
      staffId: "user-1",
      staffName: "Nhân viên A",
      claimedAt: "2026-11-06T00:00:00Z",
    },
  };

  const mockRequests: StaffRequestListItem[] = [
    {
      id: "req1",
      displayName: "Dọn phòng thêm khăn",
      status: "PENDING",
      priority: "URGENT",
      roomNumber: "202",
      quantity: 1,
      description: null,
      latestNote: null,
      createdAt: "2026-11-06T00:00:00Z",
      guestName: "Khách VIP",
      categoryName: "Dọn buồng",
      assignedToName: null,
      actions: [],
    },
  ];

  const metrics = calculateHousekeepingMetrics(mockRooms, claimedRoomsMap, mockRequests);

  assert.equal(metrics.totalRooms, 5);
  assert.equal(metrics.dirtyRoomsCount, 2);
  assert.equal(metrics.cleaningRoomsCount, 1);
  assert.equal(metrics.cleanRoomsCount, 1);
  assert.equal(metrics.occupiedRoomsCount, 1);
  assert.equal(metrics.maintenanceRoomsCount, 1);
  assert.equal(metrics.cleaningRequestsCount, 1);
  assert.equal(metrics.urgentRequestsCount, 1);
});

test("buildHousekeepingTaskCards maps room fields and applies status, floor, and search filters", () => {
  const mockRooms: HotelRoomSummary[] = [
    { id: "r1", roomNumber: "101", floor: "1", type: "Standard", status: "PROCESSING" },
    { id: "r2", roomNumber: "102", floor: "1", type: "VIP Suite", status: "PROCESSING" },
    { id: "r3", roomNumber: "201", floor: "2", type: "Deluxe", status: "AVAILABLE" },
  ];

  const claimedRoomsMap = {
    r2: {
      staffId: "current-user",
      staffName: "Tôi",
      claimedAt: "2026-11-06T00:00:00Z",
    },
  };

  // Filter: all
  const allCards = buildHousekeepingTaskCards(
    mockRooms,
    claimedRoomsMap,
    "current-user",
    [],
    { status: "all", floor: "all", search: "" },
  );
  assert.equal(allCards.length, 3);
  assert.equal(allCards[0].effectiveStatus, "processing");
  assert.equal(allCards[1].effectiveStatus, "cleaning");
  assert.equal(allCards[1].isClaimedByMe, true);
  assert.equal(allCards[1].isVip, true);
  assert.equal(allCards[2].effectiveStatus, "available");

  // Unfinished rooms include assigned work until the room is clean.
  const processingCards = buildHousekeepingTaskCards(
    mockRooms,
    claimedRoomsMap,
    "current-user",
    [],
    { status: "processing", floor: "all", search: "" },
  );
  assert.deepEqual(processingCards.map((card) => card.roomNumber), ["101", "102"]);

  // Filter: by floor
  const floor2Cards = buildHousekeepingTaskCards(
    mockRooms,
    claimedRoomsMap,
    "current-user",
    [],
    { status: "all", floor: "2", search: "" },
  );
  assert.equal(floor2Cards.length, 1);
  assert.equal(floor2Cards[0].roomNumber, "201");

  // Filter: by search query
  const searchCards = buildHousekeepingTaskCards(
    mockRooms,
    claimedRoomsMap,
    "current-user",
    [],
    { status: "all", floor: "all", search: "102" },
  );
  assert.equal(searchCards.length, 1);
  assert.equal(searchCards[0].roomNumber, "102");
});

test("room notifications contain only waiting rooms and prioritize urgent work before older normal tasks", () => {
  const rooms: HotelRoomSummary[] = [
    { id: "normal", roomNumber: "101", floor: "1", status: "PROCESSING" },
    { id: "urgent-new", roomNumber: "202", floor: "2", status: "AVAILABLE" },
    { id: "assigned", roomNumber: "103", floor: "1", status: "PROCESSING" },
    { id: "blocked", roomNumber: "104", floor: "1", status: "PROCESSING" },
    { id: "urgent-old", roomNumber: "305", floor: "3", status: "PROCESSING" },
    { id: "clean", roomNumber: "106", floor: "1", status: "AVAILABLE" },
    { id: "legacy", roomNumber: "001", floor: "1", status: "PROCESSING" },
  ];
  const tasksByRoom = {
    normal: makeTask("normal"),
    "urgent-new": makeTask("urgent-new", { priority: "URGENT", createdAt: "2026-11-06T02:00:00Z" }),
    assigned: makeTask("assigned", { status: "IN_PROGRESS", assignedToUserId: "other-user" }),
    blocked: makeTask("blocked", { status: "BLOCKED" }),
    "urgent-old": makeTask("urgent-old", { priority: "URGENT", createdAt: "2026-11-06T01:00:00Z" }),
  };
  const cards = buildHousekeepingTaskCards(rooms, {}, "current-user", [], { status: "all", floor: "all", search: "" }, tasksByRoom);

  assert.deepEqual(buildHousekeepingRoomNotifications(cards).map((card) => card.roomNumber), ["305", "202", "101", "001"]);
  assert.deepEqual(cards.map((card) => card.roomNumber), ["101", "202", "103", "104", "305", "106", "001"]);
  const metrics = calculateHousekeepingMetrics(rooms, {}, [], tasksByRoom);
  assert.equal(metrics.dirtyRoomsCount, 5);
  assert.equal(metrics.cleaningRoomsCount, 1);
  assert.equal(metrics.maintenanceRoomsCount, 1);
  assert.equal(metrics.cleanRoomsCount, 1);
});

test("active housekeeping requests retain accepted work until completion and exclude unrelated or closed requests", () => {
  const requests = [
    makeRequest("waiting"),
    makeRequest("accepted", { status: "ACKNOWLEDGED" }),
    makeRequest("done", { status: "COMPLETED" }),
    makeRequest("cancelled", { status: "CANCELLED" }),
    makeRequest("rejected", { status: "REJECTED" }),
    makeRequest("other-service", { displayName: "Đặt taxi", categoryName: "Di chuyển" }),
  ];

  assert.deepEqual(getActiveHousekeepingRequests(requests).map((request) => request.id), ["waiting", "accepted"]);
});

test("helper functions normalizeStatus and getFloorName behave predictably", () => {
  assert.equal(normalizeStatus("processing"), "PROCESSING");
  assert.equal(normalizeStatus("  available  "), "AVAILABLE");
  assert.equal(normalizeStatus(null), "");

  assert.equal(getFloorName("2"), "Tầng 2");
  assert.equal(getFloorName("Tầng 5"), "Tầng 5");
  assert.equal(getFloorName(""), "Tầng 1");
  assert.equal(getFloorName(null), "Tầng 1");
});

test("enforces strict housekeeping role mapping and workspace navigation containment", () => {
  assert.equal(resolveWorkspacePersona("HOTEL_HOUSEKEEPING"), "housekeeping");
  assert.equal(resolveWorkspacePersona("HOUSEKEEPING"), "housekeeping");

  const definition = getWorkspaceDefinition("housekeeping");
  assert.equal(definition.title, "Vận hành buồng phòng");
  assert.equal(definition.profileLabel, "Buồng phòng");
  assert.equal(definition.homePath, "/staff");

  // Navigation: only staff.rooms is provided, keeping housekeeping isolated from billing, front-desk, channel-manager, owner routes
  const navigation = buildWorkspaceNavigation({
    persona: "housekeeping",
    permissions: [
      "hotel.rooms.view",
      "hotel.rooms.ready.confirm",
      "hotel.requests.view",
    ],
    hotelId: "hotel-123",
  });

  assert.deepEqual(
    navigation.map((item) => ({ key: item.key, href: item.href })),
    [{ key: "staff.rooms", href: "/hotels/hotel-123/rooms" }],
  );
  assert.equal(navigation[0].label, "Sơ đồ phòng & Buồng phòng");
});
