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

test("FrontDeskArrivalsTable does not use misleading action labels as status and uses getArrivalStatusDisplay", () => {
  // Uses getArrivalStatusDisplay
  assert.match(arrivalsTableSource, /getArrivalStatusDisplay/);

  // Does not use hardcoded action button label "Nhận phòng ngay" or informal "Đến ngày mới mở" in status column
  assert.doesNotMatch(arrivalsTableSource, /<span>Nhận phòng ngay<\/span>/);
  assert.doesNotMatch(arrivalsTableSource, /Đến ngày mới mở/);
});

test("getArrivalStatusDisplay accurately determines hospitality statuses", async () => {
  // @ts-expect-error Node's strip-types runner requires explicit extension
  const { getArrivalStatusDisplay } = await import("./utils/hotel-ops-display.ts");

  const today = "2026-10-15";

  // Case 1: Room not yet assigned -> "Chờ gán phòng" regardless of date
  assert.deepEqual(
    getArrivalStatusDisplay(
      {
        status: "CONFIRMED",
        roomId: null,
        plannedCheckInAt: "2026-10-15T14:00:00.000Z",
      },
      today,
    ),
    {
      label: "Chờ gán phòng",
      badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
      dotClass: "bg-amber-500",
    },
  );

  // Case 2: Room assigned and check-in date is today -> "Sẵn sàng đón khách"
  assert.deepEqual(
    getArrivalStatusDisplay(
      {
        status: "ARRIVAL_READY",
        roomId: "room-1009",
        plannedCheckInAt: "2026-10-15T14:00:00.000Z",
      },
      today,
    ),
    {
      label: "Sẵn sàng đón khách",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dotClass: "bg-emerald-500",
    },
  );

  // Case 3: Room assigned and check-in date is future -> "Đã xác nhận"
  assert.deepEqual(
    getArrivalStatusDisplay(
      {
        status: "ARRIVAL_READY",
        roomId: "room-1007",
        plannedCheckInAt: "2026-10-16T14:00:00.000Z",
      },
      today,
    ),
    {
      label: "Đã xác nhận",
      badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
      dotClass: "bg-blue-500",
    },
  );

  // Case 4: Room assigned and check-in date is in the past -> "Quá hạn nhận phòng"
  assert.deepEqual(
    getArrivalStatusDisplay(
      {
        status: "ARRIVAL_READY",
        roomId: "room-1007",
        plannedCheckInAt: "2026-10-14T14:00:00.000Z",
      },
      today,
    ),
    {
      label: "Quá hạn nhận phòng",
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      dotClass: "bg-rose-500 animate-pulse",
    },
  );

  // Case 5: Already checked in -> "Đã nhận phòng"
  assert.deepEqual(
    getArrivalStatusDisplay(
      {
        status: "CHECKED_IN",
        roomId: "room-1007",
        plannedCheckInAt: "2026-10-15T14:00:00.000Z",
      },
      today,
    ),
    {
      label: "Đã nhận phòng",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      dotClass: "bg-slate-400",
    },
  );
});

test("FrontDeskArrivalDetailPanel check-in uses stale guards and explicit confirmation flags", () => {
  assert.match(panelSource, /body:\s*basePayload/);
  const basePayloadMatch = panelSource.match(/const basePayload = \{([\s\S]*?)\};/);
  assert.ok(basePayloadMatch, "basePayload must be defined");
  assert.doesNotMatch(basePayloadMatch[1], /confirmEarlyCheckIn|confirmLateCheckIn/);
  assert.match(basePayloadMatch[1], /expectedRoomId/);
  assert.match(basePayloadMatch[1], /expectedUpdatedAt/);

  assert.match(panelSource, /warningConfirm\.isConfirmed/);
  assert.match(panelSource, /confirmEarlyCheckIn:\s*true/);
  assert.match(panelSource, /confirmLateCheckIn:\s*true/);
});

test("FrontDeskArrivalDetailPanel and CheckInWorkspace final summary covers all 8 required dimensions", () => {
  // 1. Guest: Khách đại diện
  assert.match(panelSource, /Khách đại diện/);
  // 2. Reservation: Mã đặt phòng
  assert.match(panelSource, /Mã đặt phòng/);
  // 3. Room: Phòng
  assert.match(panelSource, /Phòng/);
  // 4. Type: Hạng phòng
  assert.match(panelSource, /Hạng phòng/);
  // 5. Capacity: Sức chứa
  assert.match(panelSource, /Sức chứa/);
  // 6. Schedule: Lịch trình
  assert.match(panelSource, /Lịch trình/);
  // 7. Party: Đoàn lưu trú
  assert.match(panelSource, /Đoàn lưu trú/);
  // 8. Notes: Ghi chú
  assert.match(panelSource, /Ghi chú/);

  // CheckInWorkspace pre-confirmation also contains all 8 fields
  const workspaceSource = readFileSync(
    new URL("../local-biometric/components/check-in-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspaceSource, /• Khách đại diện:/);
  assert.match(workspaceSource, /• Mã đặt phòng:/);
  assert.match(workspaceSource, /• Phòng:/);
  assert.match(workspaceSource, /• Hạng phòng:/);
  assert.match(workspaceSource, /• Sức chứa:/);
  assert.match(workspaceSource, /• Lịch trình:/);
  assert.match(workspaceSource, /• Đoàn lưu trú:/);
  assert.match(workspaceSource, /• Ghi chú:/);
});

test("formatFriendlyCheckInError handles conflict refetch guidance, cancelled, already-checked-in, and idempotent replay", async () => {
  // @ts-expect-error Node strip-types requires file extension
  const { formatFriendlyCheckInError } = await import("./utils/check-in-error.ts");

  // Conflict / stale error gives actionable refetch guidance
  const conflictMsg = formatFriendlyCheckInError("ROOM_CHECK_IN_CONFLICT");
  assert.match(conflictMsg, /Xung đột dữ liệu nhận phòng/);
  assert.match(conflictMsg, /Vui lòng tải lại dữ liệu/);

  // Early check in error explains future arrival date
  const earlyMsg = formatFriendlyCheckInError("EARLY_CHECK_IN_NOT_ALLOWED");
  assert.match(earlyMsg, /Chưa tới ngày nhận phòng dự kiến/);
  assert.match(earlyMsg, /nhận phòng sớm/);

  // Cancelled reservation returns actionable Vietnamese guidance
  const cancelledMsg = formatFriendlyCheckInError("RESERVATION_CANCELLED");
  assert.match(cancelledMsg, /Đơn đặt phòng này đã bị hủy/);
  assert.match(cancelledMsg, /tạo đơn đặt phòng mới/);

  // Already checked in returns actionable Vietnamese guidance
  const checkedInMsg = formatFriendlyCheckInError("ALREADY_CHECKED_IN");
  assert.match(checkedInMsg, /hoàn tất nhận phòng trước đó/);
  assert.match(checkedInMsg, /tải lại trang/);

  // Idempotent replay returns actionable synchronization confirmation
  const idempotentMsg = formatFriendlyCheckInError("IDEMPOTENT_REPLAY");
  assert.match(idempotentMsg, /xử lý thành công trước đó/);
  assert.match(idempotentMsg, /đồng bộ an toàn/);
});
