import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension.
import { useWorkspaceUIStore } from "./workspace-ui-store.ts";

test("useWorkspaceUIStore manages isSidebarCollapsed, toggleSidebar, and setSidebarCollapsed", () => {
  useWorkspaceUIStore.setState({ isSidebarCollapsed: false });
  assert.equal(useWorkspaceUIStore.getState().isSidebarCollapsed, false);

  useWorkspaceUIStore.getState().toggleSidebar();
  assert.equal(useWorkspaceUIStore.getState().isSidebarCollapsed, true);

  useWorkspaceUIStore.getState().toggleSidebar();
  assert.equal(useWorkspaceUIStore.getState().isSidebarCollapsed, false);

  useWorkspaceUIStore.getState().setSidebarCollapsed(true);
  assert.equal(useWorkspaceUIStore.getState().isSidebarCollapsed, true);

  useWorkspaceUIStore.getState().setSidebarCollapsed(false);
  assert.equal(useWorkspaceUIStore.getState().isSidebarCollapsed, false);
});
