import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const bffRoutePath = path.join(
  process.cwd(),
  "src/app/api/owner/platform-billing/analytics/[hotelId]/route.ts"
);

const clientPath = path.join(
  process.cwd(),
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/owner-saas-billing-client.tsx"
);

test("Owner SaaS billing route: BFF forwarding, Vietnamese labels, single source of truth", async (t) => {
  const bffCode = fs.readFileSync(bffRoutePath, "utf-8");
  const clientCode = fs.readFileSync(clientPath, "utf-8");

  await t.test("BFF route preserves URL search params using new URL(request.url).search", () => {
    assert.ok(
      bffCode.includes("new URL(") && bffCode.includes(".search"),
      "BFF route must preserve request URL query parameters using new URL(request.url).search"
    );
  });

  await t.test("client is Vietnamese localized with no English business labels", () => {
    const bannedTerms = [
      ">ACTIVE<",
      ">ONBOARDED<",
      "Usage Count",
      "Billable Day",
      "Room-Days",
      "Period Start",
      "Bank Transfer",
      "Credit Card",
    ];

    for (const term of bannedTerms) {
      assert.equal(
        clientCode.includes(term),
        false,
        `Client JSX must not contain banned English label: '${term}'`
      );
    }

    assert.ok(clientCode.includes("Hợp đồng đang hoạt động"));
    assert.ok(clientCode.includes("Đơn giá hợp đồng"));
    assert.ok(clientCode.includes("Quá hạn thanh toán"));
    assert.ok(clientCode.includes("Sắp đến hạn trong 7 ngày"));
    assert.ok(
      clientCode.includes(
        "Ngày phòng tính phí là số ngày từng phòng thực tế phát sinh phí trong tháng đã chọn"
      )
    );
  });

  await t.test("renders exactly the 4 required KPI labels, each only once", () => {
    // The helper sentence legitimately repeats one KPI phrase; strip it before counting.
    const kpiScope = clientCode.replace(
      "Ngày phòng tính phí là số ngày từng phòng thực tế phát sinh phí trong tháng đã chọn.",
      ""
    );
    for (const label of [
      "Lượt lưu trú thực tế",
      "Ngày phòng tính phí",
      "Phí VietSage SaaS tháng này",
      "Kỳ hóa đơn đã chốt",
    ]) {
      const occurrences = kpiScope.split(label).length - 1;
      assert.equal(occurrences, 1, `KPI label '${label}' must appear exactly once (no duplicate KPI blocks)`);
    }

    for (const removed of ["Tổng lượt lưu trú", "Tổng ngày tính phí", "Phí SaaS ước tính tháng này"]) {
      assert.equal(
        clientCode.includes(removed),
        false,
        `Duplicate KPI block label '${removed}' must be removed`
      );
    }
  });

  await t.test("keeps one compact monthly room table with the required columns", () => {
    assert.ok(clientCode.includes("Thống kê phòng theo tháng"));
    for (const th of ["Phòng", "Lượt lưu trú", "Ngày tính phí", "Phí VietSage SaaS", "Trạng thái"]) {
      assert.ok(clientCode.includes(`>${th}<`), `Must render table header '${th}'`);
    }
    assert.ok(clientCode.includes("Lưu trú từ tháng trước"));
    assert.ok(clientCode.includes("Có phát sinh phí"));
    assert.ok(clientCode.includes("Chưa phát sinh"));
  });

  await t.test("removes the redundant daily-detail table and keeps finalized period history", () => {
    assert.equal(
      clientCode.includes("Chi tiết lượt phòng/ngày tính phí trong tháng"),
      false,
      "Redundant billable-day detail table must not be rendered"
    );
    assert.equal(
      clientCode.includes("billableDayPage"),
      false,
      "Billable-day pagination params must be gone from the client"
    );
    assert.ok(clientCode.includes("Lịch sử Hóa đơn VietSage SaaS đã chốt"));
    assert.ok(clientCode.includes("periodPage"));
    assert.ok(clientCode.includes("{ scroll: false }"));
  });

  await t.test("keeps search + month filter and sends monthDate to the backend", () => {
    assert.ok(clientCode.includes('placeholder="Tìm phòng..."'), "Must keep room search input");
    assert.ok(clientCode.includes('type="month"'), "Month filter must be a real month input");
    assert.ok(clientCode.includes('monthDate:'), "Selected month must be forwarded as monthDate");
  });

  await t.test("does not recalculate KPI totals on the client", () => {
    assert.equal(
      /roomSummaryTotals|\.reduce\(/.test(clientCode),
      false,
      "Client must render backend totals directly instead of recomputing them"
    );
    assert.ok(clientCode.includes("data.billableDaysCount"));
    assert.ok(clientCode.includes("data.estimatedFee"));
    assert.ok(clientCode.includes("data.usageCount"));
  });

  await t.test("issues a single analytics fetch per state and handles loading/error/empty", () => {
    const fetchCalls = clientCode.split("/api/owner/platform-billing/analytics/").length - 1;
    assert.equal(fetchCalls, 1, "Analytics endpoint must be referenced from exactly one fetch site");
    assert.ok(clientCode.includes("AbortController"), "Must abort in-flight request on unmount");
    assert.ok(clientCode.includes("Đang đối soát dữ liệu"), "Must keep a loading state");
    assert.ok(clientCode.includes("Không tải được dữ liệu"), "Must render an error state");
    assert.ok(clientCode.includes("Thử lại"), "Error state must offer a retry");
    assert.ok(
      clientCode.includes("Chưa có phòng nào phát sinh"),
      "Must render an empty state for months with no billable activity"
    );
  });

  await t.test("right-aligns numeric and currency columns", () => {
    const numericAligned = clientCode.split("text-right").length - 1;
    assert.ok(numericAligned >= 8, "Numeric/currency cells and headers must be right aligned");
    assert.ok(clientCode.includes("tabular-nums"), "Numeric cells must use tabular figures");
  });
});
