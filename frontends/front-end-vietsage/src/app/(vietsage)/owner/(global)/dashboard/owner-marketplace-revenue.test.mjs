import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("owner overview keeps only decision-grade operations and finance", () => {
  assert.match(source, /servicePortalClient\.hotelMarketplaceRevenue/);
  assert.match(source, /Công suất phòng/);
  assert.match(source, /Lượt đến \/ rời hôm nay/);
  assert.match(source, /Yêu cầu cần xử lý/);
  assert.match(source, /Tài chính vận hành/);
  assert.match(source, /Doanh thu Marketplace lũy kế/);
  assert.match(source, /\/owner\/hotels\/\$\{hotel\.id\}\/partners/);
  assert.doesNotMatch(source, /Tình trạng phòng/);
  assert.doesNotMatch(source, /Top dịch vụ được yêu cầu nhiều/);
  assert.doesNotMatch(source, /Yêu cầu khẩn cấp",/);
});
