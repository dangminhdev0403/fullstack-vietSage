import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const stayGridSource = read(
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/stay/owner-stay-room-grid-client.tsx",
);
const roomsSource = read(
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/owner-rooms-client.tsx",
);
const biometricSource = read(
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/biometric/page.tsx",
);
const billingSource = read(
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-folio-table-client.tsx",
);
const requestsSource = read(
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/requests/page.tsx",
);

test("owner stay room grid exposes check-in and room status actions", () => {
  assert.match(stayGridSource, /CheckInWorkspace/);
  assert.match(stayGridSource, /openCheckIn/);
  assert.match(stayGridSource, /submitCheckIn/);
  assert.match(stayGridSource, /markRoomCleaned/);
  assert.match(stayGridSource, /updateRoomStatus/);
  assert.match(stayGridSource, /Đã dọn xong → Chuyển TRỐNG/);
  assert.match(stayGridSource, /Xong bảo trì → Chuyển TRỐNG/);
  assert.match(stayGridSource, /Check-in phòng/);
  assert.match(stayGridSource, /StayOccupantsViewer/);
  assert.match(stayGridSource, /roomStatusLabel/);
  assert.match(stayGridSource, /handleTileClick/);
});

test("owner rooms client removes operational status mutations while preserving metadata and QR governance", () => {
  // Operational status mutations must be absent
  assert.doesNotMatch(roomsSource, /toggleRoomBlocked/);
  assert.doesNotMatch(roomsSource, /updateSingleRoomStatus/);
  assert.doesNotMatch(roomsSource, /onToggleBlocked/);

  // Metadata patch must not include status on edit
  assert.match(roomsSource, /!isEditing \? \{ status: roomForm\.status \} : \{\}/);

  // Status column in data table must be read-only (no select element for changing status)
  assert.doesNotMatch(roomsSource, /<select[^>]*value=\{currentStatus\}/);

  // QR governance and print stay list must remain intact
  assert.match(roomsSource, /updateRoomFromQrAction/);
  assert.match(roomsSource, /activateAllQrCodes/);
  assert.match(roomsSource, /rotateAllQrCodes/);
  assert.match(roomsSource, /exportAllQrCodes/);
  assert.match(roomsSource, /printActiveStayList/);
});

test("legacy biometric route redirects inside owner workspace", () => {
  // Biometric workstation tabs must not render for owner
  assert.doesNotMatch(biometricSource, /BiometricOwnerTabs/);

  // Must redirect inside owner hotel workspace
  assert.match(biometricSource, /redirect\(`/);
  assert.match(biometricSource, /\/owner\/hotels\//);
});

test("billing folio client removes invoice issuance while retaining read-only drilldown and export order", () => {
  // Invoice issuance mutation and buttons must be absent
  assert.doesNotMatch(billingSource, /issueInvoice/);
  assert.doesNotMatch(billingSource, /Phát hành hóa đơn/);

  // Read-only folio breakdown and export order must remain
  assert.match(billingSource, /exportOrder/);
  assert.match(billingSource, /Xuất order/);
  assert.match(billingSource, /formatMoney\(folio\.total/);
  assert.match(billingSource, /Theo dõi doanh thu lưu trú/);
  assert.match(billingSource, /FolioModal/);
});

test("owner requests page suppresses execution actions and retains coordination and timeline", () => {
  // Execution actions are stripped from request items
  assert.match(requestsSource, /actions:\s*\[\]/);

  // ownerApiBasePath must not be wired for status execution mutations
  assert.doesNotMatch(requestsSource, /ownerApiBasePath=/);

  // Coordination and timeline review remain intact
  assert.match(requestsSource, /RequestQueueClient/);
  assert.match(requestsSource, /hotelOpsService\.listRequests/);
  assert.match(requestsSource, /hotelOpsService\.getRequestsSummary/);
});
