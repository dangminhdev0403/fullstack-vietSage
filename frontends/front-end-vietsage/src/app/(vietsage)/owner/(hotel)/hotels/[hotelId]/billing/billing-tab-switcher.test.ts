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

test("BillingTabSwitcher composition seam refactoring contract", async (t) => {
  const pageCode = fs.readFileSync(pagePath, "utf-8");
  const switcherCode = fs.readFileSync(switcherPath, "utf-8");

  await t.test("OwnerBillingPage does not instantiate or pass ReactNode component props", () => {
    assert.equal(
      pageCode.includes("folioComponent="),
      false,
      "OwnerBillingPage must not pass folioComponent prop"
    );
    assert.equal(
      pageCode.includes("saasComponent="),
      false,
      "OwnerBillingPage must not pass saasComponent prop"
    );
    assert.equal(
      pageCode.includes("<BillingFolioTableClient"),
      false,
      "OwnerBillingPage must not instantiate BillingFolioTableClient directly"
    );
    assert.equal(
      pageCode.includes("<OwnerSaasBillingClient"),
      false,
      "OwnerBillingPage must not instantiate OwnerSaasBillingClient directly"
    );
  });

  await t.test("BillingTabSwitcher accepts plain serializable props and directly renders child clients", () => {
    assert.equal(
      switcherCode.includes("ReactNode"),
      false,
      "BillingTabSwitcher must not use ReactNode props"
    );
    assert.equal(
      switcherCode.includes("folioComponent"),
      false,
      "BillingTabSwitcher must not have folioComponent prop"
    );
    assert.equal(
      switcherCode.includes("saasComponent"),
      false,
      "BillingTabSwitcher must not have saasComponent prop"
    );
    assert.ok(
      switcherCode.includes("BillingFolioTableClient"),
      "BillingTabSwitcher must import and render BillingFolioTableClient"
    );
    assert.ok(
      switcherCode.includes("OwnerSaasBillingClient"),
      "BillingTabSwitcher must import and render OwnerSaasBillingClient"
    );
  });
});
