import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { getServiceCatalogErrorMessage } from "./service-catalog-error.ts";

test("shows nested backend detail instead of BAD_REQUEST", () => {
  assert.equal(
    getServiceCatalogErrorMessage({
      data: {
        message: "BAD_REQUEST",
        data: { detail: "Tab Dịch vụ có mã nhóm chưa tồn tại trong tab Nhóm dịch vụ." },
      },
    }),
    "Tab Dịch vụ có mã nhóm chưa tồn tại trong tab Nhóm dịch vụ.",
  );
});