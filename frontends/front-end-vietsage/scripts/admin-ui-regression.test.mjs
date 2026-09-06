import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createRequire } from "node:module";
import ts from "typescript";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const shellPath = "src/features/workspace/components/workspace-shell.tsx";
const sidebarPath = "src/app/(vietsage)/_components/vs-dashboard-sidebar.tsx";
const tablePath = "src/components/ui/data-table/data-table.tsx";
const require = createRequire(import.meta.url);
const loadComponent = (path, mocks = {}) => {
  const loaded = { exports: {} };
  const code = ts.transpileModule(source(path), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const localRequire = (name) => mocks[name] ?? (name.startsWith(".") ? loadComponent(path.slice(0, path.lastIndexOf("/") + 1) + name.replace("./", "") + ".tsx") : require(name));
  new Function("require", "module", "exports", code)(localRequire, loaded, loaded.exports);
  return loaded.exports;
};
const elements = (node) => Array.isArray(node) ? node.flatMap(elements) : node?.props ? [node, ...elements(node.props.children)] : [];

test("all permission-filtered navigation stays reachable on mobile", () => {
  const shell = source(shellPath);
  assert.doesNotMatch(shell, /navItems\.slice/);
  assert.match(shell, /<dialog[\s\S]*aria-labelledby=/);
  assert.match(shell, /showModal\(\)/);
  assert.match(shell, /onNavigate=\{closeNavigation\}/);
  assert.match(shell, /href="#workspace-content"/);
  assert.match(source(sidebarPath), /aria-current=\{isActive \? "page" : undefined\}/);
});

test("shell geometry shares tokens, readable labels, responsive and print exits", () => {
  const css = source("src/features/workspace/components/workspace.css");
  assert.match(css, /--workspace-sidebar-width: 18rem/);
  assert.match(css, /--workspace-header-height: 4.5rem/);
  assert.match(css, /\.vs-workspace-nav-link\s*\{[^}]*min-height: 3rem[^}]*font-size: 1rem[^}]*line-height: 1.5/s);
  assert.match(css, /margin-inline-start: var\(--workspace-sidebar-width\)/);
  assert.match(css, /@media \(min-width: 64rem\)/);
  assert.match(css, /@media print/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(source(sidebarPath), /truncate|line-clamp/);
});

test("data tables expose keyboard scrolling, sorting, selection and feedback", () => {
  const table = source(tablePath);
  assert.match(table, /role="region"[\s\S]*tabIndex=\{0\}/);
  assert.match(table, /aria-sort=/);
  assert.match(table, /aria-label="Chọn tất cả/);
  assert.match(table, /aria-label="Số dòng mỗi trang"/);
  assert.match(table, /aria-busy=\{loading\}/);
  assert.match(source("src/components/ui/data-table/data-table-states.tsx"), /role="alert"/);
});

test("navigation retains every authorized link and full Vietnamese, English, Russian labels", () => {
  const { VsWorkspaceNavigation } = loadComponent(sidebarPath, {
    "@/components/brand/vietsage-brand": { VietSageBrand: () => null },
    "@/features/workspace/utils/workspace-nav-active": loadComponent("src/features/workspace/utils/workspace-nav-active.ts"),
    "./vs-icon": { VsIcon: () => null },
  });
  const labels = ["Tổng quan khách sạn", "Hotel management", "Управление гостиницей", "Phòng và lưu trú", "Dịch vụ", "Đối tác", "Nhân viên"];
  const items = labels.map((label, index) => ({ key: String(index), label, href: "/workspace/" + index, icon: "hotel" }));
  for (const isCollapsed of [false, true]) {
    const tree = VsWorkspaceNavigation({ activePath: "/workspace/2", items, isCollapsed });
    const links = elements(tree).filter((element) => element.props.href);
    assert.deepEqual(links.map((link) => link.props.href), items.map((item) => item.href));
    assert.equal(links.filter((link) => link.props["aria-current"] === "page").length, 1);
    if (isCollapsed) assert.deepEqual(links.map((link) => link.props["aria-label"]), labels);
    else assert.deepEqual(links.map((link) => elements(link).find((child) => child.props.className === "vs-workspace-nav-label").props.children), labels);
  }
});

test("declared shell widths leave usable content across the viewport and zoom matrix", () => {
  const css = source("src/features/workspace/components/workspace.css");
  const sidebar = Number(css.match(/--workspace-sidebar-width: ([0-9.]+)rem/)[1]) * 16;
  const breakpoint = Number(css.match(/@media \(min-width: (64)rem\)/)[1]) * 16;
  for (const viewport of [320, 360, 390, 430, 768, 820, 844, 1024, 1280, 1440, 1920]) {
    for (const zoom of [1, 1.25, 1.5, 2]) {
      const width = viewport / zoom;
      const gutters = width >= 768 ? 64 : 32;
      assert.ok(width - gutters - (width >= breakpoint ? sidebar : 0) >= Math.min(288, width - gutters));
    }
  }
});

test("table row keys do not hijack nested control keyboard events", () => {
  const { DataTable } = loadComponent(tablePath);
  let opened = 0;
  const tree = DataTable({ columns: [{ key: "name", header: "Tên", cell: (row) => row.name }], data: [{ id: "one", name: "Khách sạn" }], getRowKey: (row) => row.id, onRowClick: () => opened++ });
  const row = elements(tree).find((element) => element.type === "tr" && element.props.tabIndex === 0);
  const currentTarget = {};
  row.props.onKeyDown({ key: " ", target: {}, currentTarget, preventDefault() { throw new Error("Nested control was intercepted"); } });
  assert.equal(opened, 0);
  row.props.onKeyDown({ key: "Enter", target: currentTarget, currentTarget, preventDefault() {} });
  assert.equal(opened, 1);
});

test("empty and error recovery stays outside the wide table scroller", () => {
  const { DataTable } = loadComponent(tablePath);
  for (const error of [null, "Không thể tải dữ liệu"]) {
    const tree = DataTable({ columns: [], data: [], getRowKey: (row) => row.id, error });
    assert.equal(elements(tree).filter((element) => element.type === "table").length, 0);
  }
});

test("account dialog uses native focus containment and preserves pending cancellation guard", () => {
  const dialog = source("src/features/account/security/change-password-dialog.tsx");
  assert.match(dialog, /<dialog/);
  assert.match(dialog, /showModal()/);
  assert.match(dialog, /onCancel=/);
  assert.ok(dialog.includes("if (isPending) return"));
  assert.match(dialog, /aria-label="Đổi mật khẩu"/);
});

test("protected and data-loading pages keep their server boundaries", () => {
  const pages = [
  "src/app/(vietsage)/admin/billing/page.tsx",
  "src/app/(vietsage)/admin/page.tsx",
  "src/app/(vietsage)/hotels/[hotelId]/biometric/page.tsx",
  "src/app/(vietsage)/hotels/[hotelId]/messages/page.tsx",
  "src/app/(vietsage)/hotels/[hotelId]/requests/[requestId]/page.tsx",
  "src/app/(vietsage)/hotels/[hotelId]/requests/page.tsx",
  "src/app/(vietsage)/hotels/[hotelId]/rooms/page.tsx",
  "src/app/(vietsage)/owner/(global)/hotels/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/biometric/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/requests/[requestId]/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/requests/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/qr-export/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/rooms/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/services/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/stay/page.tsx",
  "src/app/(vietsage)/staff/dashboard/page.tsx",
  "src/app/(vietsage)/staff/front-desk/page.tsx",
  "src/app/(vietsage)/staff/manager/page.tsx",
  "src/app/(vietsage)/staff/operations/page.tsx",
  "src/app/(vietsage)/staff/page.tsx",
  "src/app/(vietsage)/admin/hotels/page.tsx",
  "src/app/(vietsage)/admin/permissions/page.tsx",
  "src/app/(vietsage)/admin/roles/page.tsx",
  "src/app/(vietsage)/hotels/[hotelId]/dashboard/page.tsx",
  "src/app/(vietsage)/hotels/[hotelId]/services/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/page.tsx",
  "src/app/(vietsage)/owner/page.tsx",
  "src/app/(vietsage)/admin/users/page.tsx",
  "src/app/(vietsage)/hotels/[hotelId]/billing/invoices/[invoiceId]/page.tsx",
  "src/app/(vietsage)/hotels/[hotelId]/billing/page.tsx",
  "src/app/(vietsage)/owner/(global)/dashboard/page.tsx",
  "src/app/(vietsage)/owner/(global)/staff/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/invoices/[invoiceId]/page.tsx",
  "src/app/(vietsage)/service/page.tsx",
  "src/app/(vietsage)/admin/marketplace/page.tsx",
  "src/app/(vietsage)/hotels/[hotelId]/partners/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/page.tsx",
  "src/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/partners/page.tsx",
  "src/app/(vietsage)/admin/dashboard/page.tsx"
];
  for (const page of pages) assert.doesNotMatch(source(page), /^["']use client["']/m, page);
});

test("sidebar hydration preserves legacy preference and survives blocked storage", async () => {
  let value = "true";
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; },
  }});
  try {
    const { useWorkspaceSidebar } = await import("../src/features/workspace/store/workspace-sidebar-store.ts");
    assert.equal(useWorkspaceSidebar.getState().isCollapsed, false);
    await useWorkspaceSidebar.persist.rehydrate();
    assert.equal(useWorkspaceSidebar.getState().isCollapsed, true);
    useWorkspaceSidebar.getState().toggle();
    assert.equal(value, "false");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    assert.doesNotThrow(() => useWorkspaceSidebar.getState().toggle());
    await useWorkspaceSidebar.persist.rehydrate();
    assert.equal(useWorkspaceSidebar.getState().isCollapsed, true);
  } finally { delete globalThis.localStorage; }
});
