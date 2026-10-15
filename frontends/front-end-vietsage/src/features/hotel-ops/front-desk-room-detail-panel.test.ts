import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(
  new URL("./components/front-desk-room-detail-panel.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../../app/(vietsage)/hotels/[hotelId]/rooms/staff-rooms-client.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../../app/(vietsage)/hotels/[hotelId]/rooms/page.tsx", import.meta.url),
  "utf8",
);
const roomsRouteSource = readFileSync(
  new URL("../../app/api/hotel-ops/hotels/[hotelId]/rooms/route.ts", import.meta.url),
  "utf8",
);

test("FrontDeskRoomDetailPanel enforces accessibility and dialog contract", () => {
  // Accessible modal attributes
  assert.match(panelSource, /role="dialog"/);
  assert.match(panelSource, /aria-modal="true"/);
  assert.match(panelSource, /aria-labelledby=/);
  assert.match(panelSource, /aria-describedby=/);

  // Focus trap and Escape key listener
  assert.match(panelSource, /event\.key === "Escape"/);
  assert.match(panelSource, /event\.key === "Tab"/);

  // Focus return to trigger element
  assert.match(panelSource, /const triggerEl = triggerElementRef\?\.current/);
  assert.match(panelSource, /triggerEl\?\.focus\(\)/);

  // Touch target minimum 44px
  assert.match(panelSource, /min-h-\[44px\]/);
});

test("StaffRoomsClient wires keyboard Enter/Space and accessible trigger ref to room cards", () => {
  assert.match(clientSource, /cardTriggerRefMap\.current\.set\(room\.id/);
  assert.match(clientSource, /e\.key === "Enter" \|\| e\.key === " "/);
  assert.match(clientSource, /role="button"/);
  assert.match(clientSource, /tabIndex=\{0\}/);
  assert.match(clientSource, /handleCardClick\(room,\s*e\.currentTarget\)/);
});

test("page.tsx passes explicit capability props to StaffRoomsClient", () => {
  assert.match(pageSource, /canViewBilling=\{/);
  assert.match(pageSource, /canCheckoutBilling=\{/);
  assert.match(pageSource, /canCheckOutStay=\{/);
  assert.match(pageSource, /canCheckInStay=\{/);
  assert.match(pageSource, /context\.permissions\.includes\("hotel\.stays\.check-in"\)/);
  assert.match(pageSource, /!isHousekeeping &&/);
});

test("rooms BFF forwards businessDate to the backend projection", () => {
  assert.match(roomsRouteSource, /businessDate:\s*z\.string\(\)\.trim\(\)\.optional\(\)/);
  assert.match(roomsRouteSource, /const \{ page, limit, q, status, floor, type, vipOnly, businessDate \}/);
  assert.match(roomsRouteSource, /\.\.\.\(businessDate \? \{ businessDate \} : \{\}\)/);
});

test("Housekeeping exclusion completely suppresses FrontDeskRoomDetailPanel", () => {
  // Housekeeping gate in panel component
  assert.match(panelSource, /if\s*\(isHousekeeping\s*\|\|\s*!room\s*\|\|\s*!isOpen\)\s*\{\s*return null;\s*\}/);

  // In staff-rooms-client, housekeeping clicks only trigger ready confirm on processing
  assert.match(clientSource, /if\s*\(isHousekeeping\)\s*\{\s*if\s*\(getRoomStatus\(room\)\s*===\s*"processing"\)\s*\{\s*void confirmRoomReady\(room\);/);
});

test("Safe billing checkout action URL computation and permission isolation", () => {
  const hotelId = "hotel-abc";
  const roomNumber = "101";
  const roomId = "room-101-uuid";
  const stayId = "stay-999-uuid";

  // Simulate buildCheckoutUrl logic
  const params = new URLSearchParams({
    roomNumber,
    roomId,
    stayId,
  });
  const checkoutUrl = `/hotels/${encodeURIComponent(hotelId)}/billing?${params.toString()}`;

  assert.equal(
    checkoutUrl,
    "/hotels/hotel-abc/billing?roomNumber=101&roomId=room-101-uuid&stayId=stay-999-uuid",
  );

  assert.match(panelSource, /canViewBilling\s*&&\s*\(canCheckoutBilling\s*\|\|\s*canCheckOutStay\)/);
  // Verify that panel routes to billing instead of direct unsafe checkout
  assert.match(panelSource, /router\.push\(`\/hotels\/\$\{encodeURIComponent\(hotelId\)\}\/billing\?\$\{params\.toString\(\)\}`\)/);
});

test("reserved-room check-in uses only the backend check-in capability", () => {
  assert.match(panelSource, /canCheckInStay\s*&&\s*onCheckInReservation/);
  assert.doesNotMatch(panelSource, /canManageReservations/);
});

test("Reserved room projection hides folio services and renders business-date reservation", () => {
  // In panel source, folio query is ONLY enabled for occupied/overdue stays
  assert.match(
    panelSource,
    /enabled:\s*Boolean\(isOpen\s*&&\s*canViewBilling\s*&&\s*stayId\s*&&\s*isOccupiedMode\)/,
  );

  // Reserved card renders matching reservation details
  assert.match(panelSource, /reservation\.reservationCode/);
  assert.match(panelSource, /reservation\.guestDisplayName/);
  assert.match(panelSource, /reservation\.nightlyRateSnapshot/);

  // Folio and stay sections are only rendered when occupied/stay mode is active
  assert.match(panelSource, /isOccupiedMode\s*&&\s*stay\s*&&/);
});

test("StaffRoomsClient renders purple reserved styling and collision guard for reserved-today rooms", () => {
  // Check that today arrivals are indexed by roomId
  assert.match(clientSource, /todayArrivalByRoomId/);
  assert.match(clientSource, /getRoomReservationDetails/);

  // Check that effectiveStatus switches to "reserved" when isReservedToday
  assert.match(clientSource, /const isReservedToday = !hasActiveStay && Boolean\(resDetails\?\.isReservedToday\);/);
  assert.match(clientSource, /const effectiveStatus: RoomStatusFilter = \(!hasActiveStay && isReservedToday\) \? "reserved" : rawEffectiveStatus;/);

  // Check that the room card displays "ĐÃ ĐẶT TRƯỚC" in purple
  assert.match(clientSource, /effectiveStatus === "reserved"/);
  assert.match(clientSource, /<span>Đã đặt trước<\/span>/);

  // Check that direct touch action button for reserved guest exists
  assert.match(clientSource, /<span>Nhận phòng<\/span>/);
  assert.match(clientSource, /bg-purple-700 hover:bg-purple-800/);

  // Check collision guard in openWalkIn
  assert.match(clientSource, /const conflictRes = getRoomReservationDetails\(room\);/);
  assert.match(clientSource, /if \(conflictRes\?\.isReservedToday\)/);
  assert.match(clientSource, /Phòng \$\{getRoomNumber\(room\)\} đã có khách đặt trước!/);

  // Check arrival prop is passed to FrontDeskRoomDetailPanel
  assert.match(clientSource, /arrival=\{selectedContextRoom \? todayArrivalByRoomId\.get\(selectedContextRoom\.id\)/);
});

