import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("FrontDeskArrivalDetailPanel enforces accessibility and dialog contract", () => {
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

test("FrontDeskArrivalsTable wires row click and keyboard Enter/Space without forcing redirect", () => {
  // Row button contract
  assert.match(arrivalsTableSource, /role="button"/);
  assert.match(arrivalsTableSource, /tabIndex=\{0\}/);
  assert.match(arrivalsTableSource, /e\.key === "Enter" \|\| e\.key === " "/);
  assert.match(arrivalsTableSource, /setSelectedArrival\(arrival\)/);
  assert.match(arrivalsTableSource, /lastFocusedTriggerRef\.current = e\.currentTarget/);

  // Strictly avoid depending on router.push or redirect link in table row
  assert.doesNotMatch(arrivalsTableSource, /router\.push/);
  assert.doesNotMatch(arrivalsTableSource, /targetHref/);

  // Chevron right indicator matching in-house table
  assert.match(arrivalsTableSource, /name="chevron_right"/);

  // Mounts FrontDeskArrivalDetailPanel
  assert.match(arrivalsTableSource, /<FrontDeskArrivalDetailPanel/);
});

test("front-desk page.tsx passes explicit capability props to FrontDeskArrivalsTable", () => {
  assert.match(frontDeskPageSource, /canOperateArrivals=\{canOperateArrivals\}/);
  assert.match(frontDeskPageSource, /canCheckInStay=\{canCheckInStay\}/);
  assert.match(frontDeskPageSource, /canManageReservations=\{canManageReservations\}/);
});

test("FrontDeskArrivalDetailPanel room assignment dropdown complies with Frontend Dropdown Rule", () => {
  // Dropdown element for selecting room
  assert.match(panelSource, /<select\s+id="arrival-assign-room-select"/);

  // Renders human-readable room number and room type
  assert.match(panelSource, /Phòng \{r\.roomNumber/);

  // Does not ask user to manually type UUID
  assert.doesNotMatch(panelSource, /Nhập mã phòng/);
});

test("FrontDeskArrivalDetailPanel check-in and room assignment API isolation", () => {
  // Check-in API call
  assert.match(
    panelSource,
    /\/api\/hotel-ops\/hotels\/\$\{encodeURIComponent\(hotelId\)\}\/reservations\/\$\{encodeURIComponent\(arrival\.id\)\}\/check-in/,
  );

  // Room assignment API call
  assert.match(
    panelSource,
    /\/api\/hotel-ops\/hotels\/\$\{encodeURIComponent\(hotelId\)\}\/reservations\/\$\{encodeURIComponent\(arrival\.id\)\}\/room/,
  );

  // Realtime query cache invalidation
  assert.match(panelSource, /invalidateHotelRealtimeQueries\(queryClient, hotelId\)/);

  // Timezone standard
  assert.match(panelSource, /timeZone:\s*"Asia\/Ho_Chi_Minh"/);
});
