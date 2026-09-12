"use client";

import { useMemo, useState } from "react";
import { VsIcon } from "../../../_components/vs-icon";
import type { RolePermissionsBrowserPermission } from "../permission-types";

type RbacPermissionGroupsProps = {
  permissions: RolePermissionsBrowserPermission[];
};

export function RbacPermissionGroups({
  permissions,
}: RbacPermissionGroupsProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPermissions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return permissions;

    return permissions.filter((perm) => {
      const matchDesc = perm.description.toLowerCase().includes(q);
      const matchMethod = perm.method.toLowerCase().includes(q);
      const matchPath = perm.path.toLowerCase().includes(q);
      return matchDesc || matchMethod || matchPath;
    });
  }, [permissions, searchQuery]);

  return (
    <div className="space-y-4">
      {/* ── Subheader Bar ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">
            Danh sách quyền hạn
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            <span className="font-semibold text-emerald-700">{filteredPermissions.length}</span>
            {" / "}
            <span>{permissions.length} quyền hạn được gán</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search box (44px control target) */}
          <div className="relative min-w-[240px] flex-1 sm:w-72 sm:flex-none">
            <VsIcon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm quyền hạn..."
              className="h-11 min-h-11 w-full rounded-lg border border-[color:rgba(198,197,213,0.6)] bg-white py-2 pl-10 pr-10 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-0 top-0 flex h-11 min-h-11 w-11 min-w-11 items-center justify-center text-gray-400 hover:text-gray-600"
                aria-label="Xóa tìm kiếm quyền"
              >
                <VsIcon name="close" className="text-[16px]" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Permissions List (Simple responsive grid, read-only) ── */}
      {permissions.length === 0 ? (
        <div className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-8 text-center text-sm text-gray-500">
          Vai trò này chưa có quyền hạn nào được gán
        </div>
      ) : filteredPermissions.length === 0 ? (
        <div className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-8 text-center text-sm text-gray-500">
          Không tìm thấy quyền hạn phù hợp với điều kiện tìm kiếm
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {filteredPermissions.map((perm) => {
            return (
              <div
                key={perm.id}
                className="rounded-xl border border-[color:rgba(198,197,213,0.35)] bg-white p-4 shadow-2xs transition-all hover:border-gray-300"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <VsIcon name="check_circle" className="text-[18px]" />
                  </div>
                  <h3 className="text-base font-bold leading-snug text-gray-900">
                    {perm.description}
                  </h3>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
