import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./workstation-connection-panel.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../../../app/(vietsage)/hotels/[hotelId]/dashboard/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../../app/api/biometric-workstations/hotels/[hotelId]/pairing/route.ts", import.meta.url), "utf8");

test("connection controls live outside the check-in modal and appear on reception dashboard", () => {
  assert.match(source, /Kết nối máy quét CCCD/);
  assert.match(source, /createPairing/);
  assert.match(source, /Mã ghép nối một lần/);
  assert.match(dashboard, /WorkstationConnectionPanel/);
});

test("connected workstation can be disconnected safely before pairing again", () => {
  assert.match(source, /Hủy kết nối/);
  assert.match(source, /Dữ liệu thiết bị và dữ liệu đã quét không bị xóa/);
  assert.match(source, /disconnect/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /disconnectHotel/);
  assert.match(source, /catch \(error\)/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /void disconnect\(\)/);
});

test("workstation errors retain HTTP status for diagnosis", () => {
  const repository = readFileSync(new URL("../repositories/workstation-repository.ts", import.meta.url), "utf8");
  assert.match(repository, /HTTP \$\{response\.status\}/);
});

test("disconnect route does not disguise runtime failures as permission errors", () => {
  assert.match(route, /const denied=await authorizeHotelWorkstation/);
  assert.doesNotMatch(route, /catch\{return NextResponse\.json\(\{error:"Không có quyền hủy kết nối máy quét"/);
});