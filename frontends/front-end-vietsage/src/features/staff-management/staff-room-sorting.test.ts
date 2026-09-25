import test from "node:test";
import assert from "node:assert/strict";

function compareStaffByRoom(
  a: { id: string; fullName: string },
  b: { id: string; fullName: string },
  userRoomAssignmentMap: Map<string, { roomNumber: string } | undefined>,
) {
  const roomA = userRoomAssignmentMap.get(a.id)?.roomNumber;
  const roomB = userRoomAssignmentMap.get(b.id)?.roomNumber;

  if (roomA && roomB) {
    const numA = Number.parseInt(roomA, 10);
    const numB = Number.parseInt(roomB, 10);
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
      return numA - numB;
    }
    const strComp = roomA.localeCompare(roomB, undefined, { numeric: true });
    if (strComp !== 0) return strComp;
  } else if (roomA && !roomB) {
    return -1;
  } else if (!roomA && roomB) {
    return 1;
  }

  return a.fullName.localeCompare(b.fullName, "vi");
}

test("Staff room sorting from smallest to largest", async (t) => {
  await t.test("sorts rooms numerically: 101 < 102 < 105 < 201 < 505", () => {
    const staff = [
      { id: "s5", fullName: "Nhân viên 505" },
      { id: "s2", fullName: "Nhân viên 102" },
      { id: "s1", fullName: "Nhân viên 101" },
      { id: "s4", fullName: "Nhân viên 201" },
      { id: "s3", fullName: "Nhân viên 105" },
    ];
    const roomMap = new Map([
      ["s5", { roomNumber: "505" }],
      ["s2", { roomNumber: "102" }],
      ["s1", { roomNumber: "101" }],
      ["s4", { roomNumber: "201" }],
      ["s3", { roomNumber: "105" }],
    ]);

    const sorted = [...staff].sort((a, b) => compareStaffByRoom(a, b, roomMap));
    const sortedRooms = sorted.map((s) => roomMap.get(s.id)?.roomNumber);
    assert.deepEqual(sortedRooms, ["101", "102", "105", "201", "505"]);
  });

  await t.test("staff with room comes before staff without room", () => {
    const staff = [
      { id: "general", fullName: "Lễ tân chung" },
      { id: "s2", fullName: "Nhân viên 201" },
      { id: "s1", fullName: "Nhân viên 101" },
    ];
    const roomMap = new Map([
      ["general", undefined],
      ["s2", { roomNumber: "201" }],
      ["s1", { roomNumber: "101" }],
    ]);

    const sorted = [...staff].sort((a, b) => compareStaffByRoom(a, b, roomMap));
    assert.equal(sorted[0].id, "s1");
    assert.equal(sorted[1].id, "s2");
    assert.equal(sorted[2].id, "general");
  });

  await t.test("staff without room are sorted alphabetically by fullName", () => {
    const staff = [
      { id: "g2", fullName: "Vũ Văn B" },
      { id: "g1", fullName: "An Văn A" },
    ];
    const roomMap = new Map<string, { roomNumber: string } | undefined>();

    const sorted = [...staff].sort((a, b) => compareStaffByRoom(a, b, roomMap));
    assert.equal(sorted[0].id, "g1");
    assert.equal(sorted[1].id, "g2");
  });
});
