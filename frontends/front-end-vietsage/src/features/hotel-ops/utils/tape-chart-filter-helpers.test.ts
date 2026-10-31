import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires explicit extensions.
import { normalizeSearchQuery, matchesReservationOrGroupCode, matchesBlockQuery, matchesRoomFilter } from "./tape-chart-filter-helpers.ts";

test("normalizeSearchQuery strips leading '#' and normalizes whitespace and case", () => {
  assert.deepEqual(normalizeSearchQuery("#VSH_GROUP_0015"), {
    raw: "#VSH_GROUP_0015",
    lower: "#vsh_group_0015",
    clean: "vsh_group_0015",
  });

  assert.deepEqual(normalizeSearchQuery("  #VSH_GROUP_0015  "), {
    raw: "#VSH_GROUP_0015",
    lower: "#vsh_group_0015",
    clean: "vsh_group_0015",
  });

  assert.deepEqual(normalizeSearchQuery("VSH_GROUP_0015"), {
    raw: "VSH_GROUP_0015",
    lower: "vsh_group_0015",
    clean: "vsh_group_0015",
  });

  assert.deepEqual(normalizeSearchQuery("##0015"), {
    raw: "##0015",
    lower: "##0015",
    clean: "0015",
  });

  assert.deepEqual(normalizeSearchQuery(""), {
    raw: "",
    lower: "",
    clean: "",
  });

  assert.deepEqual(normalizeSearchQuery(null), {
    raw: "",
    lower: "",
    clean: "",
  });
});

test("matchesReservationOrGroupCode matches full, partial, and stripped codes", () => {
  // Full match with/without #
  assert.equal(matchesReservationOrGroupCode("VSH_GROUP_0015", "vsh_group_0015"), true);
  assert.equal(matchesReservationOrGroupCode("#VSH_GROUP_0015", "vsh_group_0015"), true);

  // Partial matches
  assert.equal(matchesReservationOrGroupCode("VSH_GROUP_0015", "0015"), true);
  assert.equal(matchesReservationOrGroupCode("VSH_GROUP_0015", "group_0015"), true);
  assert.equal(matchesReservationOrGroupCode("VSH_RESERVATION_0112", "0112"), true);
  assert.equal(matchesReservationOrGroupCode("VSH_RESERVATION_0112", "reservation_0112"), true);

  // Negative / unmatched
  assert.equal(matchesReservationOrGroupCode("VSH_GROUP_0015", "9999"), false);
  assert.equal(matchesReservationOrGroupCode("VSH_GROUP_0015", "vsh_group_0015_typo"), false);
  assert.equal(matchesBlockQuery({ groupCode: "VSH_GROUP_0015" }, "#VSH_GROUP_0015_typo"), false);
  assert.equal(matchesReservationOrGroupCode(null, "vsh_group_0015"), false);
});

test("matchesBlockQuery matches reservationCode and groupCode even when display label is cleaned", () => {
  const blockWithGroup = {
    reservationCode: "VSH_RSV_001",
    groupCode: "VSH_GROUP_0015",
    guestName: "Nguyen Van A", // UI display label might be cleaned, but block has raw data
    phone: "0901234567",
  };

  // Searching with leading '#'
  assert.equal(matchesBlockQuery(blockWithGroup, "#VSH_GROUP_0015"), true);
  // Searching with whitespace and lowercase
  assert.equal(matchesBlockQuery(blockWithGroup, "  #vsh_group_0015  "), true);
  // Searching without '#'
  assert.equal(matchesBlockQuery(blockWithGroup, "VSH_GROUP_0015"), true);
  // Searching partial code
  assert.equal(matchesBlockQuery(blockWithGroup, "GROUP_0015"), true);
  assert.equal(matchesBlockQuery(blockWithGroup, "0015"), true);

  // Searching reservationCode with '#'
  assert.equal(matchesBlockQuery(blockWithGroup, "#VSH_RSV_001"), true);
  assert.equal(matchesBlockQuery(blockWithGroup, "RSV_001"), true);

  // Unmatched query
  assert.equal(matchesBlockQuery(blockWithGroup, "#VSH_GROUP_9999"), false);
  assert.equal(matchesBlockQuery(blockWithGroup, "NONEXISTENT"), false);
});

test("matchesRoomFilter shows all matching rooms of a group (#VSH_GROUP_0015 shows rooms 1003 and 1004)", () => {
  const room1003 = { roomNumber: "1003", roomTypeName: "Deluxe" };
  const room1004 = { roomNumber: "1004", roomTypeName: "Deluxe" };
  const room1005 = { roomNumber: "1005", roomTypeName: "Standard" };

  const blockRoom1003 = [
    {
      reservationCode: "VSH_RSV_1003",
      groupCode: "VSH_GROUP_0015",
      guestName: "Khach Doan 1",
    },
  ];

  const blockRoom1004 = [
    {
      reservationCode: "VSH_RSV_1004",
      groupCode: "VSH_GROUP_0015",
      guestName: "Khach Doan 2",
    },
  ];

  const blockRoom1005 = [
    {
      reservationCode: "VSH_RSV_1005",
      groupCode: "OTHER_GROUP",
      guestName: "Khach Le",
    },
  ];

  // 1. Searching with leading '#': both rooms 1003 and 1004 match!
  assert.equal(matchesRoomFilter(room1003, blockRoom1003, "#VSH_GROUP_0015"), true);
  assert.equal(matchesRoomFilter(room1004, blockRoom1004, "#VSH_GROUP_0015"), true);
  assert.equal(matchesRoomFilter(room1005, blockRoom1005, "#VSH_GROUP_0015"), false);

  // 2. Searching without '#': both rooms 1003 and 1004 match!
  assert.equal(matchesRoomFilter(room1003, blockRoom1003, "VSH_GROUP_0015"), true);
  assert.equal(matchesRoomFilter(room1004, blockRoom1004, "VSH_GROUP_0015"), true);
  assert.equal(matchesRoomFilter(room1005, blockRoom1005, "VSH_GROUP_0015"), false);

  // 3. Partial group query: "0015"
  assert.equal(matchesRoomFilter(room1003, blockRoom1003, "0015"), true);
  assert.equal(matchesRoomFilter(room1004, blockRoom1004, "0015"), true);
  assert.equal(matchesRoomFilter(room1005, blockRoom1005, "0015"), false);

  // 4. Unmatched query: returns false for all rooms
  assert.equal(matchesRoomFilter(room1003, blockRoom1003, "#NONEXISTENT"), false);
  assert.equal(matchesRoomFilter(room1004, blockRoom1004, "#NONEXISTENT"), false);
  assert.equal(matchesRoomFilter(room1005, blockRoom1005, "#NONEXISTENT"), false);

  // 5. Cleared / empty query: restores filters, all rooms return true
  assert.equal(matchesRoomFilter(room1003, blockRoom1003, ""), true);
  assert.equal(matchesRoomFilter(room1004, blockRoom1004, ""), true);
  assert.equal(matchesRoomFilter(room1005, blockRoom1005, ""), true);
  assert.equal(matchesRoomFilter(room1003, blockRoom1003, "   "), true);
  assert.equal(matchesRoomFilter(room1003, [], "#VSH_RESERVATION_0112", {
    activeStay: { reservationCode: "VSH_RESERVATION_0112", guestDisplayName: "Khach dang o" },
  }), true);
  assert.equal(matchesRoomFilter(room1003, [], "khach dang o", {
    activeStay: { guestDisplayName: "Khach dang o" },
  }), true);
});
