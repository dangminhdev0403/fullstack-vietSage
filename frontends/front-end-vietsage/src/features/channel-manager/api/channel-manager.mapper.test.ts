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
        channexMappingBlockers: [],
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
  assert.deepEqual(result.roomTypes[0].channexMappingBlockers, []);
});

test("fails closed when an inventory row omits mapping readiness", () => {
  assert.throws(
    () =>
      mapper.mapInventoryGrid({
        hotelId: "hotel_1",
        startDate: "2026-09-29",
        endDate: "2026-09-29",
        roomTypes: [
          {
            roomType: "STANDARD",
            totalInventoryRooms: 1,
            days: [],
          },
        ],
      } as unknown as mapper.BackendInventoryGrid),
    /channexMappingBlockers/,
  );
});

test("maps channexMappingBlockers unchanged without fabrication or loss", () => {
  const blockers = [
    "PROPERTY_MAPPING_MISSING" as const,
    "ROOM_TYPE_MAPPING_MISSING" as const,
    "RATE_PLAN_MAPPING_MISSING" as const,
    "MAPPING_CONFLICT" as const,
  ];

  const result = mapper.mapInventoryGrid({
    hotelId: "hotel_1",
    startDate: "2026-09-29",
    endDate: "2026-09-29",
    roomTypes: [
      {
        roomType: "DELUXE",
        totalInventoryRooms: 10,
        channexMappingBlockers: blockers,
        days: [
          {
            date: "2026-09-29",
            totalRooms: 10,
            availableRooms: 8,
            rate: 1500000,
            minStayArrival: 1,
            stopSell: false,
            closedToArrival: false,
            closedToDeparture: false,
          },
        ],
      },
    ],
  });

  assert.equal(result.roomTypes[0].roomTypeId, "DELUXE");
  assert.deepEqual(result.roomTypes[0].channexMappingBlockers, blockers);
  // Ensure array is cloned to avoid mutation leakage
  assert.notEqual(result.roomTypes[0].channexMappingBlockers, blockers);
});

test("maps OTA group segments with accurate assignment status", () => {
  const result = mapper.mapSimulatedBooking({
    bookingId: "booking-1",
    otaName: "Booking.com",
    otaReservationCode: "OTA-1",
    guestName: "Khách đoàn",
    guestPhone: null,
    roomId: null,
    roomType: "Deluxe",
    roomNumber: null,
    stayId: null,
    stayStatus: null,
    checkInDate: "2026-10-20",
    checkOutDate: "2026-10-22",
    amount: 2000000,
    currency: "VND",
    createdAt: "2026-10-16T00:00:00.000Z",
    groupCode: "CHANNEX:booking-1",
    segments: [
      {
        reservationId: "res-1",
        reservationCode: "OTA-1-1",
        roomType: "Deluxe",
        roomId: "room-1",
      },
      {
        reservationId: "res-2",
        reservationCode: "OTA-1-2",
        roomType: "Deluxe",
        roomId: null,
      },
    ],
  });

  assert.equal(result.groupCode, "CHANNEX:booking-1");
  assert.equal(result.assignedCount, 1);
  assert.equal(result.totalSegments, 2);
  assert.equal(result.assignmentStatus, "PARTIALLY_ASSIGNED");
  assert.deepEqual(
    result.segments?.map((item) => item.reservationId),
    ["res-1", "res-2"],
  );
});

test("maps single OTA booking into default segment with status", () => {
  const result = mapper.mapSimulatedBooking({
    bookingId: "booking-single",
    reservationId: "res-single",
    reservationCode: "OTA-SINGLE",
    otaName: "Agoda",
    otaReservationCode: "AG-1",
    guestName: "Khách lẻ",
    guestPhone: null,
    roomId: "room-101",
    roomType: "Superior",
    roomNumber: "101",
    status: "CONFIRMED",
    stayId: null,
    stayStatus: null,
    checkInDate: "2026-10-20",
    checkOutDate: "2026-10-22",
    amount: 1000000,
    currency: "VND",
    createdAt: "2026-10-16T00:00:00.000Z",
  });

  assert.equal(result.totalSegments, 1);
  assert.equal(result.assignedCount, 1);
  assert.equal(result.assignmentStatus, "FULLY_ASSIGNED");
  assert.equal(result.segments?.[0]?.roomNumber, "101");
  assert.equal(result.segments?.[0]?.currency, "VND");
});

test("maps unassigned group segments to UNASSIGNED status", () => {
  const result = mapper.mapSimulatedBooking({
    bookingId: "booking-unassigned",
    otaName: "Booking.com",
    otaReservationCode: "OTA-UNASSIGNED",
    guestName: "Khách đoàn 2",
    guestPhone: null,
    roomId: null,
    roomType: "Standard",
    roomNumber: null,
    stayId: null,
    stayStatus: null,
    checkInDate: "2026-10-20",
    checkOutDate: "2026-10-22",
    amount: 3000000,
    currency: "VND",
    createdAt: "2026-10-16T00:00:00.000Z",
    segments: [
      {
        reservationId: "res-a",
        reservationCode: "OTA-A",
        roomType: "Standard",
        roomId: null,
      },
      {
        reservationId: "res-b",
        reservationCode: "OTA-B",
        roomType: "Standard",
        roomId: null,
      },
    ],
  });

  assert.equal(result.assignedCount, 0);
  assert.equal(result.totalSegments, 2);
  assert.equal(result.assignmentStatus, "UNASSIGNED");
  assert.equal(result.segments?.[0]?.currency, "VND");
});
