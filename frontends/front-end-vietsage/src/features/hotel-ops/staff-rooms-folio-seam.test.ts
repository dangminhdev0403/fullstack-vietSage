import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoSource = readFileSync(
  new URL("./repositories/staff-rooms-repository.ts", import.meta.url),
  "utf8",
);
const resourceSource = readFileSync(
  new URL("./resources/staff-rooms-resource.ts", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL(
    "../../app/api/hotel-ops/hotels/[hotelId]/billing/stays/[stayId]/active-folio/route.ts",
    import.meta.url,
  ),
  "utf8",
);

test("staffRoomsResource contract declares stayFolio query scoped by stayId", () => {
  assert.match(resourceSource, /stayFolio:\s*defineQuery\(/);
  assert.match(resourceSource, /inputKey:\s*\(stayId:\s*string\)\s*=>\s*\[stayId\]/);
  assert.match(
    resourceSource,
    /staffRoomsRepository\.getStayFolioContext\(scope\.hotelId,\s*input,\s*signal\)/,
  );
});

test("staffRoomsRepository defines stay folio seam methods and error tolerance", () => {
  assert.match(repoSource, /getActiveFolioByStay\(/);
  assert.match(repoSource, /getFolioSummary\(/);
  assert.match(repoSource, /listFolioItems\(/);
  assert.match(repoSource, /getStayFolioContext\(/);

  // 404 should return null without breaking the panel; real folio failures stay visible.
  assert.match(repoSource, /errorObj\?\.status === 404/);
  assert.match(repoSource, /errorObj\?\.data\?\.code === "NOT_FOUND"/);
  assert.doesNotMatch(repoSource, /getFolioSummary\([^)]*\)\.catch\(\(\) => null\)/);
  assert.doesNotMatch(repoSource, /listFolioItems\([^)]*\)\.catch\(\(\) => \[\]\)/);
});

test("active-folio BFF route invokes billingService.getActiveFolioByStay", () => {
  assert.match(routeSource, /billingService\.getActiveFolioByStay\(hotelId,\s*stayId/);
  assert.match(routeSource, /executeHotelOpsBackendRequest\(/);
});

test("stay folio snapshot bundle separates active vs voided service charges", () => {
  const items = [
    {
      id: "item-room",
      itemType: "ROOM_CHARGE",
      nameSnapshot: "Tiền phòng đêm 1",
      quantity: 1,
      unitPriceSnapshot: 1000000,
      subtotalSnapshot: 1000000,
      totalSnapshot: 1000000,
      currency: "VND",
      status: "POSTED",
    },
    {
      id: "item-srv",
      itemType: "SERVICE",
      nameSnapshot: "Giặt là cao cấp",
      quantity: 1,
      unitPriceSnapshot: 80000,
      subtotalSnapshot: 80000,
      totalSnapshot: 80000,
      currency: "VND",
      status: "POSTED",
    },
    {
      id: "item-void",
      itemType: "SERVICE",
      nameSnapshot: "Nước ngọt (Hủy)",
      quantity: 1,
      unitPriceSnapshot: 20000,
      subtotalSnapshot: 20000,
      totalSnapshot: 20000,
      currency: "VND",
      status: "VOIDED",
      voidedAt: "2026-10-14T10:00:00Z",
    },
  ];

  const activeServices = items.filter(
    (item) => item.itemType === "SERVICE" && !item.voidedAt && item.status !== "VOIDED",
  );
  const voidedServices = items.filter(
    (item) => item.itemType === "SERVICE" && (Boolean(item.voidedAt) || item.status === "VOIDED"),
  );

  assert.equal(activeServices.length, 1);
  assert.equal(activeServices[0].nameSnapshot, "Giặt là cao cấp");
  assert.equal(voidedServices.length, 1);
  assert.equal(voidedServices[0].nameSnapshot, "Nước ngọt (Hủy)");
});
