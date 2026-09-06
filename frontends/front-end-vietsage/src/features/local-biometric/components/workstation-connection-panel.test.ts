import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./workstation-connection-panel.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../../../app/(vietsage)/hotels/[hotelId]/dashboard/page.tsx", import.meta.url), "utf8");
const rooms = readFileSync(new URL("../../../app/(vietsage)/hotels/[hotelId]/rooms/page.tsx", import.meta.url), "utf8");
const biometric = readFileSync(new URL("./biometric-owner-tabs.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../../app/api/biometric-workstations/hotels/[hotelId]/pairing/route.ts", import.meta.url), "utf8");

test("legacy HN-212 controls stay hidden while phone connection owns biometric setup", () => {
  assert.doesNotMatch(dashboard, /WorkstationConnectionPanel/);
  assert.doesNotMatch(rooms, /WorkstationConnectionPanel/);
  assert.doesNotMatch(biometric, /WorkstationConnectionPanel|WorkstationTestScanPanel/);
  assert.match(biometric, /MobileCccdConnectionPanel/);
});

test("connected workstation can be disconnected safely before pairing again", () => {
  assert.match(source, /Hủy kết nối/);
  assert.match(source, /Dữ liệu thiết bị và dữ liệu đã quét không bị xóa/);
  assert.match(source, /disconnect/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /disconnectPersistentWorkstations/);
  assert.match(source, /catch \(error\)/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /void disconnect\(\)/);
});

test("workstation errors retain HTTP status for diagnosis", () => {
  const repository = readFileSync(new URL("../repositories/workstation-repository.ts", import.meta.url), "utf8");
  assert.match(repository, /HTTP \$\{response\.status\}/);
});

test("disconnect route does not disguise runtime failures as permission errors", () => {
  assert.match(route, /const denied\s*=\s*await authorizeHotelWorkstation/);
  assert.doesNotMatch(route, /catch\{return NextResponse\.json\(\{error:"Không có quyền hủy kết nối máy quét"/);
});