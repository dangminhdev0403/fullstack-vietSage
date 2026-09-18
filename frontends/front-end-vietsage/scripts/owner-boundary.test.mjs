import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const stayGridPath = new URL(
  "../src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/stay/owner-stay-room-grid-client.tsx",
  import.meta.url,
);
const stayRouteSource = read(
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/stay/page.tsx",
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

test("owner stay route redirects to read-only room data and has no operational client", () => {
  assert.equal(existsSync(stayGridPath), false);
  assert.match(stayRouteSource, /redirect\(`/);
  assert.match(stayRouteSource, /\/owner\/hotels\//);
  assert.match(stayRouteSource, /\/rooms/);
});

test("owner rooms client keeps metadata and QR configuration without stay operations", () => {
  assert.doesNotMatch(roomsSource, /OwnerStayRoomGridClient/);
  assert.doesNotMatch(roomsSource, /printActiveStayList/);
  assert.doesNotMatch(roomsSource, /!isEditing \? \{ status: roomForm\.status \} : \{\}/);
  assert.match(roomsSource, /updateRoomFromQrAction/);
  assert.match(roomsSource, /activateAllQrCodes/);
  assert.match(roomsSource, /rotateAllQrCodes/);
  assert.match(roomsSource, /exportAllQrCodes/);
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

test("owner requests page is read-only and retains timeline drilldown", () => {
  // Execution actions are stripped from request items
  assert.match(requestsSource, /actions:\s*\[\]/);

  // ownerApiBasePath must not be wired for status execution mutations
  assert.doesNotMatch(requestsSource, /ownerApiBasePath=/);

  assert.match(requestsSource, /readOnly/);

  // Read and timeline review remain intact
  assert.match(requestsSource, /RequestQueueClient/);
  assert.match(requestsSource, /hotelOpsService\.listRequests/);
  assert.match(requestsSource, /hotelOpsService\.getRequestsSummary/);
});
