import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const clientSourcePath = path.join(
  process.cwd(),
  "src/features/staff-management/components/staff-management-client.tsx",
);
const ownerRoutePath = path.join(
  process.cwd(),
  "src/app/api/owner/staff/route.ts",
);
const adminRoutePath = path.join(
  process.cwd(),
  "src/app/api/admin/staff/route.ts",
);

test("Staff Management Pagination Invariants", async (t) => {
  const clientCode = fs.readFileSync(clientSourcePath, "utf-8");
  const ownerRouteCode = fs.readFileSync(ownerRoutePath, "utf-8");
  const adminRouteCode = fs.readFileSync(adminRoutePath, "utf-8");

  await t.test("StaffManagementClient configures pagination for DataTable", () => {
    assert.ok(
      clientCode.includes("pagination={{"),
      "DataTable must receive pagination prop",
    );
    assert.ok(
      clientCode.includes("pageSizeOptions: [10, 20, 50, 100]"),
      "Pagination must support standard page size options",
    );
    assert.ok(
      clientCode.includes("totalPages"),
      "Must compute totalPages for pagination",
    );
    assert.ok(
      clientCode.includes("totalItems"),
      "Must compute totalItems for pagination",
    );
    assert.ok(
      clientCode.includes("pageSize"),
      "Must manage pageSize state",
    );
  });

  await t.test("StaffManagementClient renders mobile pagination", () => {
    assert.ok(
      clientCode.includes("Trang trước") && clientCode.includes("Trang sau"),
      "Must render mobile navigation buttons for pagination",
    );
    assert.ok(
      clientCode.includes("Trang {page} / {totalPages}"),
      "Must display current page and total pages in mobile view",
    );
  });

  await t.test("route handlers paginate the hotel-filtered backend result", () => {
    assert.equal(
      ownerRouteCode.includes("total: staffOnlyItems.length"),
      false,
      "Owner staff route must not overwrite users.total with page item count",
    );
    assert.equal(
      adminRouteCode.includes("total: staffOnlyItems.length"),
      false,
      "Admin staff route must not overwrite users.total with page item count",
    );
    assert.ok(ownerRouteCode.includes("hotelId: hotelId ?? undefined"));
    assert.ok(adminRouteCode.includes("hotelId: hotelId ?? undefined"));
    assert.equal(ownerRouteCode.includes("filteredItems"), false);
    assert.equal(adminRouteCode.includes("filteredItems"), false);
  });

  await t.test("StaffManagementClient exports all accounts through the resource layer", () => {
    assert.ok(
      clientCode.includes("Xuất Excel (${totalItems})"),
      "Export button must show total accounts count rather than current page items",
    );
    assert.ok(
      clientCode.includes("isExporting"),
      "Must have isExporting state for async batch export",
    );
    assert.ok(
      clientCode.includes("exportDirectory(debouncedQuery)"),
      "Must export all accounts through the resource hook",
    );
    assert.equal(
      clientCode.includes('from "../repositories/staff-directory-repository"'),
      false,
      "Presentation component must not bypass the resource layer",
    );
    assert.equal(
      clientCode.includes("Xuất Excel (${displayedUsers.length})"),
      false,
      "Button label must not be restricted to displayedUsers.length",
    );
  });
});
