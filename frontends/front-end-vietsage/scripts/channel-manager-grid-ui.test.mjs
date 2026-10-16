import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const sourceUrl = new URL(
  "../src/features/channel-manager/components/inventory-grid.tsx",
  import.meta.url,
);
const bulkUrl = new URL(
  "../src/features/channel-manager/components/bulk-update-modal.tsx",
  import.meta.url,
);
const roomModalUrl = new URL(
  "../src/features/channel-manager/components/room-type-rooms-modal.tsx",
  import.meta.url,
);
const typesUrl = new URL(
  "../src/features/channel-manager/types/channel-manager.types.ts",
  import.meta.url,
);
const compilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
};
const gridSource = readFileSync(sourceUrl, "utf8");
const compiled = ts.transpileModule(gridSource, {
  compilerOptions,
  reportDiagnostics: true,
});
assert.deepEqual(compiled.diagnostics, []);
const bulkCompiled = ts.transpileModule(readFileSync(bulkUrl, "utf8"), {
  compilerOptions,
  reportDiagnostics: true,
});
assert.deepEqual(bulkCompiled.diagnostics, []);
const roomModalCompiled = ts.transpileModule(
  readFileSync(roomModalUrl, "utf8"),
  { compilerOptions, reportDiagnostics: true },
);
assert.deepEqual(roomModalCompiled.diagnostics, []);
const typesCompiled = ts.transpileModule(readFileSync(typesUrl, "utf8"), {
  compilerOptions,
  reportDiagnostics: true,
});
assert.deepEqual(typesCompiled.diagnostics, []);
const typesModule = { exports: {} };
runInNewContext(typesCompiled.outputText, {
  exports: typesModule.exports,
  module: typesModule,
});

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
  const RoomTypeRoomsModal = () => null;
  const testModule = { exports: {} };
  const hooks = {
    useInventoryGrid: (options) => {
      query = options;
      const dateFrom = new Date(options.dateFrom + "T12:00:00");
      const dateTo = new Date(options.dateTo + "T12:00:00");
      const days = [];
      for (
        const date = new Date(dateFrom);
        date <= dateTo;
        date.setDate(date.getDate() + 1)
      ) {
        const dateString = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");
        days.push({
          date: dateString,
          available: 3,
          rate: basePrice,
          stopSell: closed,
          minStay: 2,
        });
      }
      return {
        gridData: {
          roomTypes: empty
            ? []
            : [
                {
                  roomTypeId: "suite",
                  roomTypeName: "Suite",
                  roomTypeCode: "Suite",
                  totalRooms: 5,
                  basePrice,
                  days,
                },
              ],
        },
        isLoading: loading,
        isError: failed,
        isFetching: fetching,
        refetch: () =>
          new Promise((resolve) => {
            pendingRefetch = resolve;
          }),
      };
    },
    useUpdateRestrictions: (options) => {
      assert.equal(options.roleScope, roleScope);
      return {
        isUpdating: false,
        updateRestrictions: (payload) => {
          updates.push(payload);
          return new Promise((resolve, reject) => {
            pendingUpdate = resolve;
            rejectUpdate = reject;
          });
        },
      };
    },
    useUpdateAvailability: () => ({
      isUpdating: false,
      updateAvailability: async () => {},
    }),
  };
  const imports = {
    react: {
      ...React,
      useMemo: (factory) => factory(),
      useEffect: () => {},
      useRef: () => ({ current: null }),
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in states))
          states[index] = typeof initial === "function" ? initial() : initial;
        return [
          states[index],
          (next) => {
            states[index] =
              typeof next === "function" ? next(states[index]) : next;
          },
        ];
      },
    },
    "../types/channel-manager.types": typesModule.exports,
    "../hooks/use-channel-manager": hooks,
    "@/features/request-realtime/use-owner-request-realtime": {
      useOwnerRequestRealtime: () => {},
    },
    "./bulk-update-modal": { BulkUpdateModal },
    "./room-type-rooms-modal": { RoomTypeRoomsModal },
    "@/app/(vietsage)/_components/vs-icon": { VsIcon: () => null },
    sonner: {
      toast: { success: () => {}, error: (message) => errors.push(message) },
    },
  };
  runInNewContext(compiled.outputText, {
    exports: testModule.exports,
    module: testModule,
    Error,
    require: (name) => (name in imports ? imports[name] : require(name)),
  });
  const render = () => {
    stateIndex = 0;
    return testModule.exports.InventoryGrid({
      hotelId: "hotel-test",
      roleScope,
      canManage: true,
    });
  };
  const nodes = (tree) =>
    Array.isArray(tree)
      ? tree.flatMap(nodes)
      : React.isValidElement(tree)
        ? [tree, ...nodes(tree.props.children)]
        : [];
  const text = (tree) =>
    Array.isArray(tree)
      ? tree.map(text).join("")
      : React.isValidElement(tree)
        ? text(tree.props.children)
        : tree == null
          ? ""
          : String(tree);
  const button = (tree, label) =>
    nodes(tree).find((node) => node.type === "button" && text(node) === label);
  const salesButton = (tree) =>
    nodes(tree).find(
      (node) =>
        node.type === "button" &&
        /^(Mở bán|Đóng bán) Suite/.test(node.props["aria-label"] ?? ""),
    );

  let tree = render();
  assert.equal(query.roleScope, roleScope);
  assert.equal(
    nodes(tree).filter(
      (node) => node.type === "th" && node.props.scope === "col",
    ).length,
    8,
  );
  assert.match(renderToStaticMarkup(tree), /1\.000\.000 ₫/);
  assert.match(text(tree), /Đang mở bán/);
  assert.equal(text(salesButton(tree)), "Đóng bán");
  button(tree, "14 ngày").props.onClick();
  tree = render();
  assert.equal(
    nodes(tree).filter(
      (node) => node.type === "th" && node.props.scope === "col",
    ).length,
    15,
  );
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
  empty = false;
  let blockers = ["ROOM_TYPE_MAPPING_MISSING"];
  hooks.useInventoryGrid = (options) => {
    query = options;
    const dateFrom = new Date(options.dateFrom + "T12:00:00");
    const dateTo = new Date(options.dateTo + "T12:00:00");
    const days = [];
    for (
      const date = new Date(dateFrom);
      date <= dateTo;
      date.setDate(date.getDate() + 1)
    ) {
      const dateString = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
      days.push({
        date: dateString,
        available: 3,
        rate: 1_000_000,
        stopSell: false,
        minStay: 2,
      });
    }
    return {
      gridData: {
        roomTypes: [
          {
            roomTypeId: "suite",
            roomTypeName: "Suite",
            roomTypeCode: "Suite",
            totalRooms: 5,
            basePrice: 1_000_000,
            days,
            channexMappingBlockers: blockers,
          },
        ],
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: () =>
        new Promise((resolve) => {
          pendingRefetch = resolve;
        }),
    };
  };

  tree = render();
  // Blocker explanation and accessible text
  assert.match(text(tree), /Chưa liên kết OTA/);
  assert.match(text(tree), /Chưa liên kết hạng phòng/);
  assert.doesNotMatch(text(tree), /ROOM_TYPE_MAPPING_MISSING/);

  // Row navigation is preserved (collapse button exists)
  const collapseBtn = nodes(tree).find(
    (node) => node.type === "button" && /Suite/.test(text(node)),
  );
  assert.ok(collapseBtn);
  assert.notEqual(collapseBtn.props.disabled, true);

  // Read-only values are preserved
  assert.match(text(tree), /5 phòng/);
  assert.match(text(renderToStaticMarkup(tree)), /1\.000\.000 ₫/);
  assert.match(text(tree), /Đang mở bán/);

  // Blocked controls: quick update, stop sell, and bulk update are disabled
  const blockedQuickBtns = nodes(tree).filter(
    (node) =>
      node.type === "button" &&
      (text(node) === "Đóng nhanh" || text(node) === "Mở nhanh"),
  );
  assert.ok(blockedQuickBtns.length >= 2);
  blockedQuickBtns.forEach((btn) => {
    assert.equal(btn.props.disabled, true);
    assert.equal(btn.props["aria-disabled"], true);
    assert.equal(btn.props.tabIndex, -1);
  });

  const blockedSalesBtn = salesButton(tree);
  assert.ok(blockedSalesBtn);
  assert.equal(blockedSalesBtn.props.disabled, true);
  assert.equal(blockedSalesBtn.props["aria-disabled"], true);
  assert.equal(blockedSalesBtn.props.tabIndex, -1);

  // Attempted mutation on blocked control does not call updateRestrictions
  const updatesBefore = updates.length;
  blockedSalesBtn.props.onClick?.();
  blockedQuickBtns[0].props.onClick?.({ stopPropagation: () => {} });
  assert.equal(updates.length, updatesBefore);

  // Bulk update button is disabled when all room types are blocked
  assert.equal(button(tree, "Cập nhật hàng loạt").props.disabled, true);

  console.log(
    roleScope +
      ": 7/14 ngày, giá đầy đủ, đóng/mở, giữ payload, chặn bấm lặp, lỗi, trạng thái rỗng và chặn phòng chưa liên kết OTA — PASS",
  );
}

// Dedicated unit test for BulkUpdateModal fail-closed controls
{
  const bulkModule = { exports: {} };
  let bulkUpdatedPayload = null;
  const swalErrors = [];
  const modalStates = [];
  let modalStateIndex = 0;

  const bulkHooks = {
    useBulkUpdateRestrictions: () => ({
      isBulkUpdating: false,
      bulkUpdate: async (payload) => {
        bulkUpdatedPayload = payload;
        return { message: "Cập nhật thành công", affectedCells: 5 };
      },
    }),
  };

  const bulkImports = {
    react: {
      ...React,
      useState: (initial) => {
        const index = modalStateIndex++;
        if (!(index in modalStates))
          modalStates[index] =
            typeof initial === "function" ? initial() : initial;
        return [
          modalStates[index],
          (next) => {
            modalStates[index] =
              typeof next === "function" ? next(modalStates[index]) : next;
          },
        ];
      },
    },
    "@/libs/swal": {
      showConfirmDialog: async () => ({ isConfirmed: true }),
      showErrorAlert: async (title, message) => {
        swalErrors.push({ title, message });
      },
      showSuccessAlert: async () => {},
    },
    "../hooks/use-channel-manager": bulkHooks,
    "../types/channel-manager.types": typesModule.exports,
    "@/app/(vietsage)/_components/vs-icon": { VsIcon: () => null },
  };

  runInNewContext(bulkCompiled.outputText, {
    exports: bulkModule.exports,
    module: bulkModule,
    Error,
    require: (name) =>
      name in bulkImports ? bulkImports[name] : require(name),
  });

  const testRoomTypes = [
    {
      roomTypeId: "rt-eligible",
      roomTypeName: "Deluxe Hợp Lệ",
      roomTypeCode: "DLX",
      basePrice: 1200000,
      totalRooms: 10,
      days: [],
      channexMappingBlockers: [],
    },
    {
      roomTypeId: "rt-blocked",
      roomTypeName: "Suite Bị Khóa",
      roomTypeCode: "SUT",
      basePrice: 2000000,
      totalRooms: 4,
      days: [],
      channexMappingBlockers: ["ROOM_TYPE_MAPPING_MISSING"],
    },
  ];

  const renderModal = () => {
    modalStateIndex = 0;
    return bulkModule.exports.BulkUpdateModal({
      isOpen: true,
      onClose: () => {},
      hotelId: "hotel-1",
      roomTypes: testRoomTypes,
      defaultDateFrom: "2026-10-20",
      defaultDateTo: "2026-10-22",
      roleScope: "owner",
    });
  };

  const nodes = (tree) =>
    Array.isArray(tree)
      ? tree.flatMap(nodes)
      : React.isValidElement(tree)
        ? [tree, ...nodes(tree.props.children)]
        : [];
  const text = (tree) =>
    Array.isArray(tree)
      ? tree.map(text).join("")
      : React.isValidElement(tree)
        ? text(tree.props.children)
        : tree == null
          ? ""
          : String(tree);
  const button = (tree, label) =>
    nodes(tree).find((node) => node.type === "button" && text(node) === label);

  let modalTree = renderModal();
  assert.match(text(modalTree), /Chưa liên kết OTA/);
  assert.match(text(modalTree), /Chưa liên kết hạng phòng/);
  assert.doesNotMatch(text(modalTree), /ROOM_TYPE_MAPPING_MISSING/);

  // Blocked item is rendered disabled
  const blockedItem = nodes(modalTree).find(
    (node) => node.props?.["aria-disabled"] === true,
  );
  assert.ok(blockedItem);
  assert.match(text(blockedItem), /Suite Bị Khóa/);

  // Test empty selection cannot mean all
  const form = nodes(modalTree).find((node) => node.type === "form");
  await form.props.onSubmit({ preventDefault: () => {} });
  assert.equal(swalErrors.at(-1)?.title, "Chưa chọn hạng phòng");
  assert.equal(bulkUpdatedPayload, null);

  // Test Select All only includes eligible room types
  const selectAllBtn = button(modalTree, "Chọn tất cả hạng phòng hợp lệ");
  assert.ok(selectAllBtn);
  selectAllBtn.props.onClick();

  modalTree = renderModal();
  // Now submit with selected rate
  const rateInput = nodes(modalTree).find(
    (node) =>
      node.type === "input" &&
      node.props.placeholder?.includes("không muốn đổi giá"),
  );
  rateInput.props.onChange({ target: { value: "1500000" } });

  modalTree = renderModal();
  const formReady = nodes(modalTree).find((node) => node.type === "form");
  await formReady.props.onSubmit({ preventDefault: () => {} });

  assert.ok(bulkUpdatedPayload);
  assert.deepEqual([...bulkUpdatedPayload.roomTypeIds], ["rt-eligible"]);
  console.log(
    "BulkUpdateModal: chặn phòng chưa liên kết, chọn tất cả chỉ gồm phòng hợp lệ, không cho phép rỗng — PASS",
  );
}
