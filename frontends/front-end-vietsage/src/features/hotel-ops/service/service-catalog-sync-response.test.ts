import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { parseServiceCatalogSyncResponse } from "./service-catalog-sync-response.ts";

test("returns sync summary from backend envelope", () => {
  const summary = {
    inserted: 0,
    updated: 0,
    disabled: 57,
    unchanged: 5,
    skipped: 5,
    skippedRows: 52,
    warnings: ["52 dòng cần chỉnh"],
  };

  assert.deepEqual(
    parseServiceCatalogSyncResponse({
      status: 201,
      error: null,
      message: "Đồng bộ Google Sheets thành công",
      data: summary,
    }),
    summary,
  );
});

test("rejects a malformed summary instead of rendering undefined", () => {
  assert.throws(
    () =>
      parseServiceCatalogSyncResponse({ status: 201, message: "OK", data: {} }),
    /Invalid service catalog sync response/,
  );
});
