import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension.
import { useMarketplaceAdminImportStore } from "./marketplace-admin-import-store.ts";

test("useMarketplaceAdminImportStore manages categorySheetUrl, partnerSheetUrls, and getPartnerSheetUrl", () => {
  useMarketplaceAdminImportStore.setState({
    categorySheetUrl: "",
    partnerSheetUrls: {},
  });

  // Category Sheet Url
  useMarketplaceAdminImportStore.getState().setCategorySheetUrl("https://docs.google.com/spreadsheets/d/categories-123");
  assert.equal(
    useMarketplaceAdminImportStore.getState().categorySheetUrl,
    "https://docs.google.com/spreadsheets/d/categories-123",
  );

  // Partner Sheet Urls
  useMarketplaceAdminImportStore.getState().setPartnerSheetUrl("tenant-1", "https://docs.google.com/spreadsheets/d/partner-1");
  useMarketplaceAdminImportStore.getState().setPartnerSheetUrl("CODE_ABC", "https://docs.google.com/spreadsheets/d/partner-abc");

  const state = useMarketplaceAdminImportStore.getState();
  assert.equal(state.partnerSheetUrls["tenant-1"], "https://docs.google.com/spreadsheets/d/partner-1");
  assert.equal(state.partnerSheetUrls["CODE_ABC"], "https://docs.google.com/spreadsheets/d/partner-abc");

  // getPartnerSheetUrl by tenantId and tenantCode
  assert.equal(
    state.getPartnerSheetUrl("tenant-1", "CODE_OTHER"),
    "https://docs.google.com/spreadsheets/d/partner-1",
  );
  assert.equal(
    state.getPartnerSheetUrl(null, "CODE_ABC"),
    "https://docs.google.com/spreadsheets/d/partner-abc",
  );
  assert.equal(
    state.getPartnerSheetUrl("non-existent-id", "non-existent-code"),
    "",
  );
});
