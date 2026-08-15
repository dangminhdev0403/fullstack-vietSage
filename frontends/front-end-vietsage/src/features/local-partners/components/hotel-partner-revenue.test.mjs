import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./hotel-partner-settlements-tab.tsx", import.meta.url),
  "utf8",
);

test("owner settlement tab displays canonical external-service revenue with truthful states", () => {
  // Canonical endpoint integration
  assert.match(source, /\/marketplace\/revenue/);
  assert.match(source, /Doanh thu phí dịch vụ ngoài/);
  assert.match(source, /revenue\.grossAmount/);

  // Truthful revenue loading and error states (never silently 0)
  assert.match(source, /revenueLoading/);
  assert.match(source, /revenueError/);
  assert.match(source, /Không thể tải/);
  assert.doesNotMatch(source, /setRevenue\(0\)/);
});

test("financial semantics: canonical room-folio collection and payable-to-partners", () => {
  // Clear financial card titles and semantics
  assert.match(source, /Khách sạn đã thu hộ/);
  assert.match(source, /Phải trả cho đối tác/);
  assert.match(source, /Chờ quyết toán/);
  assert.match(source, /Đã quyết toán/);

  // Canonical room-folio collection uses order.customerTotalAmount with fallback
  assert.match(source, /customerTotalAmount/);
  assert.match(source, /hotelServiceFeeAmount/);

  // Global totals computed from full settlements dataset
  assert.match(source, /totalCollected\s*=\s*settlements\.reduce/);
  assert.match(source, /totalNetPayable\s*=\s*settlements\.reduce/);
});

test("operational filtering maintains global metric totals separate from table view", () => {
  // Filtered view uses displayedSettlements
  assert.match(source, /displayedSettlements/);
  assert.match(source, /data=\{displayedSettlements\}/);

  // Tab filter counts reflect true global status counts
  assert.match(source, /Chờ quyết toán \(\{unsettledItems\.length\}\)/);
  assert.match(source, /Đã quyết toán \(\{settledItems\.length\}\)/);
  assert.match(source, /Tất cả \(\{settlements\.length\}\)/);
});

test("confirm dialogs adhere to SweetAlert2 standard", () => {
  assert.match(source, /reverseButtons:\s*false/);
});
