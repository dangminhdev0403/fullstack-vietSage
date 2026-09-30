import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const sourceUrl = new URL("../src/features/channel-manager/components/inventory-grid.tsx", import.meta.url);
const bulkUrl = new URL("../src/features/channel-manager/components/bulk-update-modal.tsx", import.meta.url);
const compilerOptions = { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
const gridSource = readFileSync(sourceUrl, "utf8");
const compiled = ts.transpileModule(gridSource, { compilerOptions, reportDiagnostics: true });
assert.deepEqual(compiled.diagnostics, []);
assert.deepEqual(ts.transpileModule(readFileSync(bulkUrl, "utf8"), { compilerOptions, reportDiagnostics: true }).diagnostics, []);

for (const roleScope of ["admin", "owner"]) {
  const states = [];
  let stateIndex = 0;
  let query;
  let pendingUpdate;
  let rejectUpdate;
  let pendingRefetch;
  let fetching = false;
  let basePrice = 1_000_000;
  let loading = false;
  let failed = false;
  let empty = false;
  let closed = false;
  const updates = [];
  const errors = [];
  const BulkUpdateModal = () => null;
  const module = { exports: {} };
  const hooks = {
    useInventoryGrid: (options) => {
      query = options;
      const dateFrom = new Date(options.dateFrom + "T12:00:00");
      const dateTo = new Date(options.dateTo + "T12:00:00");
      const days = [];
      for (const date = new Date(dateFrom); date <= dateTo; date.setDate(date.getDate() + 1)) {
        const dateString = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
        days.push({ date: dateString, available: 3, rate: basePrice, stopSell: closed, minStay: 2 });
      }
      return {
        gridData: { roomTypes: empty ? [] : [{ roomTypeId: "suite", roomTypeName: "Suite", roomTypeCode: "Suite", totalRooms: 5, basePrice, days }] },
        isLoading: loading, isError: failed, isFetching: fetching,
        refetch: () => new Promise((resolve) => { pendingRefetch = resolve; }),
      };
    },
    useUpdateRestrictions: (options) => {
      assert.equal(options.roleScope, roleScope);
      return { isUpdating: false, updateRestrictions: (payload) => {
        updates.push(payload);
        return new Promise((resolve, reject) => { pendingUpdate = resolve; rejectUpdate = reject; });
      } };
    },
    useUpdateAvailability: () => ({ isUpdating: false, updateAvailability: async () => {} }),
  };
  const imports = {
    react: { ...React, useMemo: (factory) => factory(), useEffect: () => {}, useRef: () => ({ current: null }), useState: (initial) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    } },
    "../hooks/use-channel-manager": hooks,
    "@/features/request-realtime/use-owner-request-realtime": { useOwnerRequestRealtime: () => {} },
    "./bulk-update-modal": { BulkUpdateModal },
    "@/app/(vietsage)/_components/vs-icon": { VsIcon: () => null },
    sonner: { toast: { success: () => {}, error: (message) => errors.push(message) } },
  };
  runInNewContext(compiled.outputText, { exports: module.exports, module, Error, require: (name) => name in imports ? imports[name] : require(name) });
  const render = () => { stateIndex = 0; return module.exports.InventoryGrid({ hotelId: "hotel-test", roleScope }); };
  const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
  const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : React.isValidElement(tree) ? text(tree.props.children) : tree == null ? "" : String(tree);
  const button = (tree, label) => nodes(tree).find((node) => node.type === "button" && text(node) === label);
  const salesButton = (tree) => nodes(tree).find((node) => node.type === "button" && /^(Mở bán|Đóng bán) Suite/.test(node.props["aria-label"] ?? ""));

  let tree = render();
  assert.equal(query.roleScope, roleScope);
  assert.equal(nodes(tree).filter((node) => node.type === "th" && node.props.scope === "col").length, 8);
  assert.match(renderToStaticMarkup(tree), /1\.000\.000 ₫/);
  assert.match(text(tree), /Đang mở bán/);
  assert.equal(text(salesButton(tree)), "Đóng bán");
  button(tree, "14 ngày").props.onClick();
  tree = render();
  assert.equal(nodes(tree).filter((node) => node.type === "th" && node.props.scope === "col").length, 15);
  assert.equal(button(tree, "14 ngày").props["aria-pressed"], true);
  button(tree, "Cập nhật hàng loạt").props.onClick();
  tree = render();
  const modal = nodes(tree).find((node) => node.type === BulkUpdateModal);
  assert.equal(modal.props.defaultDateFrom, query.dateFrom);
  assert.equal(modal.props.defaultDateTo, query.dateTo);
  modal.props.onClose();
  button(render(), "7 ngày").props.onClick();

  salesButton(render()).props.onClick();
  assert.equal(updates.at(-1)[0].stopSell, true);
  assert.equal(updates.at(-1)[0].rate, 1_000_000);
  assert.equal(updates.at(-1)[0].minStay, 2);
  assert.equal(salesButton(render()).props.disabled, true);
  salesButton(render()).props.onClick();
  assert.equal(updates.length, 1);
  pendingUpdate();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(salesButton(render()).props.disabled, true);
  pendingRefetch();
  await new Promise((resolve) => setImmediate(resolve));
  closed = true;
  tree = render();
  assert.match(text(tree), /Đang đóng bán/);
  assert.equal(text(salesButton(tree)), "Mở bán");
  salesButton(tree).props.onClick();
  assert.equal(updates.at(-1)[0].stopSell, false);
  rejectUpdate(new Error("Không thể lưu"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(salesButton(render()).props.disabled, false);
  assert.equal(text(salesButton(render())), "Mở bán");
  assert.equal(errors.at(-1), "Không thể lưu");

  basePrice = null;
  salesButton(render()).props.onClick();
  assert.equal(updates.length, 2);
  assert.match(errors.at(-1), /không thể mở bán/);
  fetching = true;
  assert.equal(salesButton(render()).props.disabled, true);
  fetching = false;
  loading = true;
  assert.match(text(render()), /Đang tải phòng và giá 7 ngày/);
  loading = false;
  failed = true;
  assert.ok(button(render(), "Thử lại"));
  failed = false;
  empty = true;
  assert.match(text(render()), /Chưa có hạng phòng/);
  console.log(roleScope + ": 7/14 ngày, giá đầy đủ, đóng/mở, giữ payload, chặn bấm lặp, lỗi và trạng thái rỗng — PASS");
}
