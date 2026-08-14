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

test("Slice 3C frontend pagination & BFF search params forwarding contract", async (t) => {
  const bffCode = fs.readFileSync(bffRoutePath, "utf-8");
  const clientCode = fs.readFileSync(clientPath, "utf-8");

  await t.test("BFF route preserves URL search params using new URL(request.url).search", () => {
    assert.ok(
      bffCode.includes("new URL(") && bffCode.includes(".search"),
      "BFF route must preserve request URL query parameters using new URL(request.url).search"
    );
  });

  await t.test("OwnerSaasBillingClient is fully Vietnamese localized with no English business labels", () => {
    // Prohibited mixed English business labels in visible JSX rendering
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

    // Required Vietnamese labels and helpers
    assert.ok(clientCode.includes("Hợp đồng đang hoạt động"));
    assert.ok(clientCode.includes("Số lượt lưu trú"));
    assert.ok(clientCode.includes("Ngày phòng tính phí"));
    assert.ok(clientCode.includes("Phí SaaS ước tính tháng này"));
    assert.ok(clientCode.includes("Các kỳ hóa đơn đã chốt"));
    assert.ok(clientCode.includes("Phí tương ứng"));
    assert.ok(
      clientCode.includes(
        "Ngày phòng tính phí là số ngày từng phòng thực tế phát sinh phí trong tháng đã chọn"
      )
    );
    assert.ok(clientCode.includes("Quá hạn thanh toán"));
    assert.ok(clientCode.includes("Sắp đến hạn trong 7 ngày"));
  });

  await t.test("OwnerSaasBillingClient billable-day table controls, headers and limit searchParam contract", () => {
    assert.ok(
      clientCode.includes('import { DataTable, type DataTableColumn } from "@/components/ui/data-table";') ||
      clientCode.includes('import { DataTable, DataTableColumn } from "@/components/ui/data-table";') ||
      (clientCode.includes("DataTable") && clientCode.includes('@/components/ui/data-table')),
      "Must import DataTable and DataTableColumn from @/components/ui/data-table"
    );
    assert.ok(
      clientCode.includes("<DataTable"),
      "Must render <DataTable component in client"
    );
    const billableDaySection = clientCode.split("Chi tiết lượt phòng/ngày tính phí trong tháng")[1]?.split("Lịch sử Hóa đơn VietSage SaaS đã chốt")[0] || "";
    assert.equal(
      billableDaySection.includes("<table"),
      false,
      "Billable day section must not render raw <table markup"
    );
    assert.ok(
      clientCode.includes("Ngày / Số tiền"),
      "Must have visible 'Ngày / Số tiền' header or summary header"
    );
    assert.equal(
      clientCode.includes('aria-label="Lọc cột ngày phòng tính phí"'),
      false,
      "Column filter select must be removed"
    );
    assert.ok(
      clientCode.includes("billableDayLimit"),
      "Must read and update 'billableDayLimit' searchParam"
    );
    assert.ok(
      clientCode.includes('{ scroll: false }'),
      "router.push must include { scroll: false } to prevent scroll jumping on page change"
    );
    assert.ok(
      clientCode.includes('day: "2-digit"') &&
        clientCode.includes('month: "2-digit"') &&
        clientCode.includes('year: "numeric"'),
      "Date cells must render dd/mm/yyyy"
    );
    assert.ok(
      clientCode.includes('params.set("billableDayPage", "1")'),
      "Changing page size must reset billableDayPage to 1"
    );
    assert.ok(
      clientCode.includes("Number(bd.amount).toLocaleString"),
      "Amount column must render persisted bd.amount"
    );
    assert.ok(
      clientCode.includes("pageSize: billableDayLimit"),
      "DataTable page size must follow the selected URL limit immediately"
    );
    assert.ok(
      clientCode.includes("sortedBillableDays.slice(0, billableDayLimit)") || clientCode.includes("billableDaysList.slice(0, billableDayLimit)"),
      "Visible rows must never exceed the selected page size while the request refreshes"
    );
    for (const key of ["serviceDate", "room", "unitPrice", "amount"]) {
      assert.ok(
        clientCode.includes(`key: "${key}"`) && clientCode.includes("sortable: true"),
        `Column ${key} must expose the shared DataTable sort indicator`
      );
    }
    assert.ok(
      clientCode.includes("sort={{") && clientCode.includes("onSortChange"),
      "DataTable must receive controlled sort state"
    );
  });
});

