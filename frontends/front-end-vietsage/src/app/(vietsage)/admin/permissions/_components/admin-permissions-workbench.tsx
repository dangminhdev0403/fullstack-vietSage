"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { VsIcon } from "../../../_components/vs-icon";
import {
  type RolePermissionsBrowserRole,
  RolePermissionsBrowser,
} from "./role-permissions-browser";
import type { RolePermissionsBrowserPermission } from "../permission-types";
import { D3PermissionCatalogBrowser } from "./d3-permission-catalog-browser";
import {
  type D3CatalogPermission,
  IMMUTABLE_D3_PERMISSION_CATALOG,
} from "../d3-catalog-types";

export type AdminPermissionsTab = "roles" | "catalog";

type AdminPermissionsWorkbenchProps = {
  initialTab?: AdminPermissionsTab;
  roles: RolePermissionsBrowserRole[];
  initialRoleId: string | null;
  initialPermissionsByRoleId?: Record<string, RolePermissionsBrowserPermission[]>;
  customCatalog?: readonly D3CatalogPermission[] | D3CatalogPermission[];
};

export function AdminPermissionsWorkbench({
  initialTab = "roles",
  roles,
  initialRoleId,
  initialPermissionsByRoleId,
  customCatalog,
}: AdminPermissionsWorkbenchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<AdminPermissionsTab>(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab === "catalog" || urlTab === "roles") {
      return urlTab;
    }
    return initialTab;
  });

  const handleTabChange = useCallback(
    (tab: AdminPermissionsTab) => {
      setActiveTab(tab);

      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (tab === "catalog") {
          params.set("tab", "catalog");
        } else {
          params.delete("tab");
        }
        const queryString = params.toString();
        const targetUrl = queryString ? `${pathname}?${queryString}` : pathname;
        router.replace(targetUrl, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const totalCatalogPermissions =
    customCatalog && customCatalog.length > 0
      ? customCatalog.length
      : IMMUTABLE_D3_PERMISSION_CATALOG.length;

  return (
    <div className="space-y-5">
      {/* ── Primary Mode Navigation Tabs ── */}
      <div
        className="flex items-center gap-1 border-b border-gray-200"
        role="tablist"
        aria-label="Chế độ quản lý quyền hạn"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "roles"}
          onClick={() => handleTabChange("roles")}
          className={`flex min-h-11 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all ${
            activeTab === "roles"
              ? "border-emerald-700 text-emerald-950 font-bold"
              : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
          }`}
        >
          <VsIcon name="admin_panel_settings" className="text-[18px]" />
          <span>Phân quyền theo vai trò</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${
              activeTab === "roles"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {roles.length} vai trò
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "catalog"}
          onClick={() => handleTabChange("catalog")}
          className={`flex min-h-11 items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all ${
            activeTab === "catalog"
              ? "border-emerald-700 text-emerald-950 font-bold"
              : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
          }`}
        >
          <VsIcon name="menu_book" className="text-[18px]" />
          <span>Danh mục quyền hệ thống</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${
              activeTab === "catalog"
                ? "bg-blue-100 text-blue-900"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            D3 Catalog ({totalCatalogPermissions})
          </span>
        </button>
      </div>

      {/* ── Tab Content Views ── */}
      {activeTab === "roles" && (
        <div role="tabpanel" aria-label="Phân quyền theo vai trò">
          <RolePermissionsBrowser
            roles={roles}
            initialRoleId={initialRoleId}
            initialPermissionsByRoleId={initialPermissionsByRoleId}
          />
        </div>
      )}

      {activeTab === "catalog" && (
        <div role="tabpanel" aria-label="Danh mục quyền hệ thống D3">
          <D3PermissionCatalogBrowser customCatalog={customCatalog} />
        </div>
      )}
    </div>
  );
}
