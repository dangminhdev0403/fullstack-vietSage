import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawerSource = readFileSync(
  new URL("./components/group-operations-drawer.tsx", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL("./components/front-desk-arrival-detail-panel.tsx", import.meta.url),
  "utf8",
);
const arrivalsTableSource = readFileSync(
  new URL("../../app/(vietsage)/hotels/[hotelId]/front-desk/front-desk-arrivals-table.tsx", import.meta.url),
  "utf8",
);
const frontDeskPageSource = readFileSync(
  new URL("../../app/(vietsage)/hotels/[hotelId]/front-desk/page.tsx", import.meta.url),
  "utf8",
);
const groupsTableSource = readFileSync(
  new URL("../../app/(vietsage)/hotels/[hotelId]/front-desk/front-desk-groups-table.tsx", import.meta.url),
  "utf8",
);

test("GroupOperationsDrawer enforces dialog accessibility, focus management, and touch targets", () => {
  // Modal / dialog accessibility attributes
  assert.match(drawerSource, /role="dialog"/);
  assert.match(drawerSource, /aria-modal="true"/);
  assert.match(drawerSource, /aria-labelledby=/);
  assert.match(drawerSource, /aria-describedby=/);

  // Keyboard navigation & focus trap
  assert.match(drawerSource, /event\.key === "Escape"/);
  assert.match(drawerSource, /event\.key === "Tab"/);

  // Focus return to trigger element on close
  assert.match(drawerSource, /const triggerEl = triggerElementRef\?\.current/);
  assert.match(drawerSource, /triggerEl\?\.focus\(\)/);

  // Touch target floor >= 44px
  assert.match(drawerSource, /min-h-\[44px\]/);
});

test("GroupOperationsDrawer strictly satisfies In-Place Tab Isolation (zero disruptive redirects)", () => {
  // Never uses navigation router or redirects inside drawer
  assert.doesNotMatch(drawerSource, /router\.push/);
  assert.doesNotMatch(drawerSource, /router\.replace/);
  assert.doesNotMatch(drawerSource, /redirect\(/);
});

test("GroupOperationsDrawer provides Batch Check-in and Batch Check-out operations", () => {
  // Batch check-in and check-out handlers
  assert.match(drawerSource, /handleBatchCheckIn/);
  assert.match(drawerSource, /handleBatchCheckOut/);

  // Selection actions
  assert.match(drawerSource, /handleSelectCheckInReady/);
  assert.match(drawerSource, /handleSelectCheckedIn/);
  assert.match(drawerSource, /handleToggleSelectAll/);

  // Calls staffRoomsRepository APIs
  assert.match(drawerSource, /staffRoomsRepository\.checkInReservation/);
  assert.match(drawerSource, /staffRoomsRepository\.checkOutStay/);

  // Invalidates realtime queries upon completion
  assert.match(drawerSource, /invalidateHotelRealtimeQueries\(queryClient, hotelId\)/);
});

test("GroupOperationsDrawer implements individual room result feedback without aborting other rooms", () => {
  // Results mapping state per reservation
  assert.match(drawerSource, /resultsMap/);
  assert.match(drawerSource, /setResultsMap/);

  // Individual try/catch error containment
  assert.match(drawerSource, /newResults\[item\.reservationId\]\s*=\s*\{\s*reservationId:\s*item\.reservationId,\s*success:\s*true/);
  assert.match(drawerSource, /newResults\[item\.reservationId\]\s*=\s*\{\s*reservationId:\s*item\.reservationId,\s*success:\s*false/);

  // Displays individual per-room results in table
  assert.match(drawerSource, /result\.success\s*\?/);
  assert.match(drawerSource, /result\.message/);
});

test("FrontDeskArrivalDetailPanel and FrontDeskArrivalsTable wire GroupOperationsDrawer with 'Mở quản lý đoàn'", () => {
  // FrontDeskArrivalDetailPanel wires button when groupCode is present
  assert.match(panelSource, /arrival\.groupCode\s*\?/);
  assert.match(panelSource, /Mở quản lý đoàn/);
  assert.match(panelSource, /<GroupOperationsDrawer/);
  assert.match(panelSource, /setIsGroupDrawerOpen\(true\)/);

  // FrontDeskArrivalsTable wires button and mounts drawer
  assert.match(arrivalsTableSource, /arrival\.groupCode\s*\?/);
  assert.match(arrivalsTableSource, /Mở quản lý đoàn/);
  assert.match(arrivalsTableSource, /<GroupOperationsDrawer/);
  assert.match(arrivalsTableSource, /setActiveGroupCode/);
});

test("GroupOperationsDrawer satisfies UI Design Gate standards", () => {
  // Floor limit >= 12px (no sub-12px micro classes)
  assert.doesNotMatch(drawerSource, /text-\[10px\]/);
  assert.doesNotMatch(drawerSource, /text-\[11px\]/);
  assert.doesNotMatch(drawerSource, /text-\[9px\]/);

  // Typographic balance and pretty body
  assert.match(drawerSource, /text-balance/);
  assert.match(drawerSource, /text-pretty/);
  assert.match(drawerSource, /whitespace-nowrap/);

  // Hospitality tone without wireframe or dev placeholders
  assert.doesNotMatch(drawerSource, /VD:\s*Test/i);
  assert.doesNotMatch(drawerSource, /01\s*\/\s*/);
  assert.doesNotMatch(drawerSource, /02\s*\/\s*/);
});

test("FrontDeskPage has horizontal tab 'Quản lý đoàn' and FrontDeskGroupsTable enables clicking a group for details", () => {
  // Horizontal tab in FrontDeskPage
  assert.match(frontDeskPageSource, /tab === "groups"/);
  assert.match(frontDeskPageSource, /<span>Quản lý đoàn<\/span>/);
  assert.match(frontDeskPageSource, /<FrontDeskGroupsTable/);

  // FrontDeskGroupsTable displays table of groups and opens detail drawer on click
  assert.match(groupsTableSource, /export function FrontDeskGroupsTable/);
  assert.match(groupsTableSource, /buildFrontDeskGroupSummaries/);
  assert.match(groupsTableSource, /<table/);
  assert.match(groupsTableSource, /setActiveGroupCode\(group\.groupCode\)/);
  assert.match(groupsTableSource, /<GroupOperationsDrawer/);
  assert.match(groupsTableSource, /Xem chi tiết đoàn/);
});
