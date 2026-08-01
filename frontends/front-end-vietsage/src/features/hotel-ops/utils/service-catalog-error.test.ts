import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import * as serviceCatalogError from "./service-catalog-error.ts";

const { getServiceCatalogErrorMessage, getServiceCatalogSyncNotice } =
  serviceCatalogError;

test("shows nested backend detail instead of BAD_REQUEST", () => {
  assert.equal(
    getServiceCatalogErrorMessage({
      data: {
        message: "BAD_REQUEST",
        data: {
          detail: "Tab Dịch vụ có mã nhóm chưa tồn tại trong tab Nhóm dịch vụ.",
        },
      },
    }),
    "Tab Dịch vụ có mã nhóm chưa tồn tại trong tab Nhóm dịch vụ.",
  );
});

test("reports partial synchronization warnings to the owner", () => {
  assert.deepEqual(
    getServiceCatalogSyncNotice({
      inserted: 2,
      updated: 1,
      disabled: 4,
      unchanged: 5,
      skippedRows: 3,
      warnings: ["Bỏ qua dòng 6, 7, 8 vì mã nhóm không tồn tại."],
    }),
    {
      icon: "warning",
      title: "Đồng bộ một phần",
      text: "Đã thêm 2, cập nhật 1, vô hiệu hóa 4, giữ nguyên 5, bỏ qua 3 dòng lỗi. Bỏ qua dòng 6, 7, 8 vì mã nhóm không tồn tại.",
    },
  );
});
