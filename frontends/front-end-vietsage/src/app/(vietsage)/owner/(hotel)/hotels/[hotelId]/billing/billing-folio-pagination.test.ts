import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const pagePath = path.join(
  process.cwd(),
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/page.tsx"
);
const switcherPath = path.join(
  process.cwd(),
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-tab-switcher.tsx"
);
const clientPath = path.join(
  process.cwd(),
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-folio-table-client.tsx"
);

test("Folio pagination contract", async (t) => {
  const pageCode = fs.readFileSync(pagePath, "utf-8");
  const switcherCode = fs.readFileSync(switcherPath, "utf-8");
  const clientCode = fs.readFileSync(clientPath, "utf-8");

  await t.test("OwnerBillingPage accepts searchParams and calls listFolios with limit 20 and parsed folioPage", () => {
    assert.ok(
      pageCode.includes("searchParams"),
      "OwnerBillingPage must accept searchParams prop"
    );
    assert.equal(
      pageCode.includes("limit: 50"),
      false,
      "OwnerBillingPage must not hardcode limit 50"
    );
    assert.ok(
      pageCode.includes("limit: 20"),
      "OwnerBillingPage must query with limit 20"
    );
    assert.ok(
      pageCode.includes("folioPage"),
      "OwnerBillingPage must parse folioPage parameter"
    );
  });

  await t.test("BillingTabSwitcher and BillingFolioTableClient receive BillingPage object instead of raw items array", () => {
    assert.ok(
      switcherCode.includes("BillingPage<FolioListItem>"),
      "BillingTabSwitcher prop must use BillingPage<FolioListItem>"
    );
    assert.ok(
      clientCode.includes("BillingPage<FolioListItem>"),
      "BillingFolioTableClient prop must use BillingPage<FolioListItem>"
    );
  });

  await t.test("BillingFolioTableClient renders Next.js Link pagination controls and clarifies local page filtering", () => {
    assert.ok(
      clientCode.includes("Link"),
      "BillingFolioTableClient must import/render Next Link for pagination"
    );
    assert.ok(
      clientCode.includes("trang") || clientCode.includes("Trang"),
      "BillingFolioTableClient must display page numbers"
    );
    assert.equal(
      clientCode.includes("Tìm kiếm toàn bộ"),
      false,
      "UI search label must clarify local page search instead of global"
    );
  });
});
