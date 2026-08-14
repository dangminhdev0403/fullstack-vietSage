import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ownerRoomsSource = readFileSync(new URL("../../app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/owner-rooms-client.tsx", import.meta.url), "utf8");
const dataTableSource = readFileSync(new URL("../../components/ui/data-table/data-table.tsx", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("./components/room-detail-drawer.tsx", import.meta.url), "utf8");

test("owner-rooms-client integrates RoomDetailDrawer and selectedDetailRoom state", () => {
  assert.match(ownerRoomsSource, /RoomDetailDrawer/);
  assert.match(ownerRoomsSource, /selectedDetailRoom/);
  assert.match(ownerRoomsSource, /onRowClick=\{\(room\) => setSelectedDetailRoom\(room\)\}/);
});

test("owner-rooms-client stops propagation on action button and select clicks", () => {
  assert.match(ownerRoomsSource, /onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  assert.match(ownerRoomsSource, /onChange=\{\(e\) => \{\s*e\.stopPropagation\(\);/);
});

test("action buttons possess clear semantic icons, tooltips, and focus styles", () => {
  assert.match(ownerRoomsSource, /title="Chỉnh sửa phòng"/);
  assert.match(ownerRoomsSource, /title="Quản lý QR"/);
  assert.match(ownerRoomsSource, /title="Lịch sử \/ Đổi mã QR"/);
  assert.match(ownerRoomsSource, /title="Tạm tắt QR"/);
  assert.match(ownerRoomsSource, /title="Kích hoạt QR"/);
  assert.match(ownerRoomsSource, /focus-visible:ring-\[#e8b363\]/);
});

test("DataTable supports clickable rows with keyboard accessibility and cursor pointer", () => {
  assert.match(dataTableSource, /tabIndex=\{onRowClick \? 0 : undefined\}/);
  assert.match(dataTableSource, /onKeyDown=/);
  assert.match(dataTableSource, /e\.key === "Enter" \|\| e\.key === " "/);
  assert.match(dataTableSource, /cursor-pointer/);
});

test("RoomDetailDrawer presents comprehensive room details, active stay info, and actions", () => {
  assert.match(drawerSource, /Phòng #/);
  assert.match(drawerSource, /THAO TÁC NHANH/);
  assert.match(drawerSource, /THÔNG TIN CƠ BẢN PHÒNG/);
  assert.match(drawerSource, /MÃ QR THÔNG MINH/);
  assert.match(drawerSource, /BrandedRoomQr/);
});
