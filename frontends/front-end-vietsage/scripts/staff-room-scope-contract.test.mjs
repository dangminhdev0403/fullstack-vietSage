import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const bffRoomRoutePath = new URL(
  "../src/app/api/owner/hotels/[hotelId]/staff-assignments/[userId]/room/route.ts",
  import.meta.url,
);

const contractSource = read("src/features/staff-management/types/staff-management-contract.ts");
const serviceSource = read("src/features/staff-management/service/staff-management-service.ts");
const repoSource = read("src/features/staff-management/repositories/staff-directory-repository.ts");
const resourceSource = read("src/features/staff-management/resources/staff-directory-resource.ts");
const queryHookSource = read("src/features/staff-management/queries/use-staff-directory-query.ts");
const staffClientSource = read("src/features/staff-management/components/staff-management-client.tsx");
const staffBffSource = read("src/app/api/owner/staff/route.ts");
const staffRoomsClientSource = read("src/app/(vietsage)/hotels/[hotelId]/rooms/staff-rooms-client.tsx");
const staffRoomsPageSource = read("src/app/(vietsage)/hotels/[hotelId]/rooms/page.tsx");

test("staff management contract includes room scope types and properties", () => {
  assert.match(contractSource, /export type StaffRoomAssignment/);
  assert.match(contractSource, /export type StaffHotelRoomOption/);
  assert.match(contractSource, /export type AssignStaffRoomInput/);
  assert.match(contractSource, /export type UnassignStaffRoomInput/);
  assert.match(contractSource, /roomAssignment\?:\s*StaffRoomAssignment\s*\|\s*null/);
  assert.match(contractSource, /rooms\?:\s*StaffHotelRoomOption\[\]/);
});

test("staff management service, repository, resource, and hook provide room assignment operations", () => {
  // Service
  assert.match(serviceSource, /listHotelRooms\(/);
  assert.match(serviceSource, /assignRoom\(/);
  assert.match(serviceSource, /unassignRoom\(/);

  // Repository
  assert.match(repoSource, /assignRoom\(/);
  assert.match(repoSource, /unassignRoom\(/);

  // Resource (mutation hooks that invalidate directory)
  assert.match(resourceSource, /assignRoom:\s*defineMutation\(/);
  assert.match(resourceSource, /unassignRoom:\s*defineMutation\(/);

  // Hook
  assert.match(queryHookSource, /assignRoom = useMutation\(staffDirectory\.mutations\.assignRoom/);
  assert.match(queryHookSource, /unassignRoom = useMutation\(\s*staffDirectory\.mutations\.unassignRoom/);
});

test("BFF routes exist and handle staff room assignments", () => {
  assert.equal(existsSync(bffRoomRoutePath), true);
  const bffRoomSource = readFileSync(bffRoomRoutePath, "utf8");

  // PUT and DELETE handlers for owner staff room assignments
  assert.match(bffRoomSource, /export async function PUT\(/);
  assert.match(bffRoomSource, /export async function DELETE\(/);
  assert.match(bffRoomSource, /staffManagementService\.assignRoom/);
  assert.match(bffRoomSource, /staffManagementService\.unassignRoom/);

  // Staff listing BFF aggregates rooms for owner staff directory
  assert.match(staffBffSource, /staffManagementService\.listHotelRooms/);
  assert.match(staffBffSource, /rooms:/);
  assert.match(staffBffSource, /roomId/);
});

test("staff management client renders room assignment, validation, and SweetAlert confirm dialogs", () => {
  // Room column in desktop DataTable
  assert.match(staffClientSource, /key:\s*"room"/);
  assert.match(staffClientSource, /header:\s*"Phòng phụ trách"/);

  // Warning for unassigned frontdesk staff
  assert.match(staffClientSource, /Chưa gán phòng — tài khoản chưa thể thao tác vận hành/);

  // SweetAlert2 confirm dialog with reverseButtons: false
  assert.match(staffClientSource, /SwalVietSage\.fire\(\{/);
  assert.match(staffClientSource, /reverseButtons:\s*false/);
  assert.match(staffClientSource, /Bỏ gán phòng\?/);

  // Creation form contains room dropdown when role is frontdesk
  assert.match(staffClientSource, /isFrontDeskRole\(form\.roleId\)/);
  assert.match(staffClientSource, /Phòng phụ trách \(Bắt buộc\)/);
  assert.match(staffClientSource, /Đã có người phụ trách/);
});

test("frontdesk operational rooms client displays fail-closed notice when unassigned", () => {
  // staff-rooms-client extracts isError / error and handles unassigned room scope
  assert.match(staffRoomsClientSource, /isUnassigned/);
  assert.match(staffRoomsClientSource, /Chưa gán phòng — tài khoản chưa thể thao tác vận hành/);

  // server page catch block also handles unassigned staff error
  assert.match(staffRoomsPageSource, /isUnassigned/);
  assert.match(staffRoomsPageSource, /Chưa gán phòng — tài khoản chưa thể thao tác vận hành/);
});
