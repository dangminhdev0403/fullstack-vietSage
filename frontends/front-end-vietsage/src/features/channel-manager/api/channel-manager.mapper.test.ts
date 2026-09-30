import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import * as mapper from "./channel-manager.mapper.ts";

test("maps DB channel connection fields without mock defaults", () => {
  const result = mapper.mapChannelConnection(
    {
      id: "conn_1",
      hotelId: "hotel_1",
      channelCode: "CHANNEX",
      title: "Channex - Hotel",
      status: "ACTIVE",
      inboundIcalUrl: null,
      outboundToken: "real-token",
      lastSyncAt: null,
      lastSyncStatus: null,
      syncErrorMessage: null,
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
    },
    "https://vietsage.localhost:1355",
  );

  assert.equal(result.channelType, "CHANNEX");
  assert.equal(result.name, "Channex - Hotel");
  assert.equal(result.inboundUrl, "");
  assert.equal(
    result.outboundUrl,
    "https://vietsage.localhost:1355/api/channel-manager/ical/real-token.ics",
  );
  assert.equal(result.syncStatus, "IDLE");
});

test("maps DB ARI values exactly", () => {
  const result = mapper.mapInventoryGrid({
    hotelId: "hotel_1",
    startDate: "2026-09-29",
    endDate: "2026-09-29",
    roomTypes: [
      {
        roomType: "STANDARD",
        totalInventoryRooms: 500,
        days: [
          {
            date: "2026-09-29",
            totalRooms: 500,
            availableRooms: 500,
            rate: null,
            minStayArrival: 1,
            stopSell: false,
            closedToArrival: false,
            closedToDeparture: false,
          },
        ],
      },
    ],
  });

  assert.equal(result.roomTypes[0].totalRooms, 500);
  assert.equal(result.roomTypes[0].days[0].available, 500);
  assert.equal(result.roomTypes[0].days[0].rate, null);
});
