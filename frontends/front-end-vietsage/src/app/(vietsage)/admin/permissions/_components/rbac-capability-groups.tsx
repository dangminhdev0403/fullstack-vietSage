"use client";

import { useMemo, useState } from "react";
import { VsIcon } from "../../../_components/vs-icon";
import type { RolePermissionsBrowserPermission } from "../permission-types";
import {
  type CategorizedPermission,
  type PermissionActionType,
  type PermissionModuleId,
  PERMISSION_MODULES,
  categorizePermissions,
} from "./permission-modules";

type RbacPermissionGroupsProps = {
  permissions: RolePermissionsBrowserPermission[];
};

type ViewMode = "GRID" | "TABLE";

export function RbacPermissionGroups({
  permissions,
}: RbacPermissionGroupsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState<PermissionModuleId | "ALL">("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("GRID");
  const [selectedActionType, setSelectedActionType] = useState<PermissionActionType | "ALL">("ALL");

  // Categorize all permissions
  const categorizedList = useMemo(() => {
    return categorizePermissions(permissions);
  }, [permissions]);

  // Available modules present in the current role
  const availableModules = useMemo(() => {
    const map = new Map<PermissionModuleId, number>();
    for (const item of categorizedList) {
      map.set(item.moduleId, (map.get(item.moduleId) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([modId, count]) => ({
      config: PERMISSION_MODULES[modId] ?? PERMISSION_MODULES.OTHER,
      count,
    }));
  }, [categorizedList]);

  // Action breakdown counts
  const actionCounts = useMemo(() => {
    let read = 0;
    let write = 0;
    let critical = 0;
    for (const item of categorizedList) {
      if (item.actionType === "CRITICAL") critical++;
      else if (item.actionType === "WRITE") write++;
      else read++;
    }
    return { read, write, critical };
  }, [categorizedList]);

  // Filtered permissions
  const filteredPermissions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return categorizedList.filter((perm) => {
      // Module filter
      if (selectedModuleId !== "ALL" && perm.moduleId !== selectedModuleId) {
        return false;
      }

      // Action type filter
      if (selectedActionType !== "ALL" && perm.actionType !== selectedActionType) {
        return false;
      }

      // Search query filter
      if (q) {
        const matchDesc = perm.description.toLowerCase().includes(q);
        const matchMethod = perm.method.toLowerCase().includes(q);
        const matchPath = perm.path.toLowerCase().includes(q);
        const matchMod = (PERMISSION_MODULES[perm.moduleId]?.name ?? "").toLowerCase().includes(q);
        return matchDesc || matchMethod || matchPath || matchMod;
      }

      return true;
    });
  }, [categorizedList, searchQuery, selectedModuleId, selectedActionType]);

  // Group filtered permissions by module for the Grid view
  const groupedPermissions = useMemo(() => {
    const groups: {
      config: typeof PERMISSION_MODULES[PermissionModuleId];
      items: CategorizedPermission[];
    }[] = [];

    const order: PermissionModuleId[] = [
      "FRONTDESK",
      "ROOMS",
      "BILLING",
      "KBTT",
      "REQUESTS",
      "MESSAGES",
      "CHANNELS",
      "HOTEL_ADMIN",
      "PLATFORM_ADMIN",
      "OTHER",
    ];

    for (const modId of order) {
      const items = filteredPermissions.filter((p) => p.moduleId === modId);
      if (items.length > 0) {
        groups.push({
          config: PERMISSION_MODULES[modId] ?? PERMISSION_MODULES.OTHER,
          items,
        });
      }
    }

    return groups;
  }, [filteredPermissions]);

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedModuleId("ALL");
    setSelectedActionType("ALL");
  };

  return (
    <div className="space-y-4">
      {/* ── Subheader Bar & Controls ── */}
      <div className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-gray-900">
                Danh sách quyền hạn được gán
              </h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                {filteredPermissions.length} / {permissions.length}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Phân loại chi tiết theo nghiệp vụ và mức độ phân quyền trong hệ thống.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50/80 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("GRID")}
                className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ${
                  viewMode === "GRID"
                    ? "bg-white text-emerald-950 shadow-xs ring-1 ring-black/5"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                aria-label="Xem dạng lưới theo nhóm"
                title="Xem theo nhóm nghiệp vụ"
              >
                <VsIcon name="grid_view" className="text-[16px]" />
                <span className="hidden sm:inline">Nhóm nghiệp vụ</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("TABLE")}
                className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all ${
                  viewMode === "TABLE"
                    ? "bg-white text-emerald-950 shadow-xs ring-1 ring-black/5"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                aria-label="Xem dạng bảng chi tiết"
                title="Xem dạng danh sách kỹ thuật"
              >
                <VsIcon name="view_list" className="text-[16px]" />
                <span className="hidden sm:inline">Danh sách chi tiết</span>
              </button>
            </div>

            {/* Search box (44px target) */}
            <div className="relative min-w-[220px] flex-1 sm:w-64 sm:flex-none">
              <VsIcon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm quyền hạn, API..."
                className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50/80 py-2 pl-9 pr-9 text-xs text-gray-900 placeholder-gray-400 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-gray-400 hover:text-gray-600"
                  aria-label="Xóa tìm kiếm"
                >
                  <VsIcon name="close" className="text-[14px]" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Summary Stats & Action Breakdown ── */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs">
          <span className="font-semibold text-gray-500">Phân cấp quyền:</span>
          <button
            type="button"
            onClick={() => setSelectedActionType(selectedActionType === "READ" ? "ALL" : "READ")}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
              selectedActionType === "READ"
                ? "border-blue-300 bg-blue-100 text-blue-900 ring-1 ring-blue-400"
                : "border-blue-100 bg-blue-50/70 text-blue-800 hover:bg-blue-100/70"
            }`}
          >
            <VsIcon name="visibility" className="text-[14px]" />
            <span>Chỉ đọc / Tra cứu:</span>
            <strong className="font-bold">{actionCounts.read}</strong>
          </button>

          <button
            type="button"
            onClick={() => setSelectedActionType(selectedActionType === "WRITE" ? "ALL" : "WRITE")}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
              selectedActionType === "WRITE"
                ? "border-emerald-300 bg-emerald-100 text-emerald-950 ring-1 ring-emerald-400"
                : "border-emerald-100 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/70"
            }`}
          >
            <VsIcon name="edit" className="text-[14px]" />
            <span>Thao tác / Quản lý:</span>
            <strong className="font-bold">{actionCounts.write}</strong>
          </button>

          {actionCounts.critical > 0 && (
            <button
              type="button"
              onClick={() => setSelectedActionType(selectedActionType === "CRITICAL" ? "ALL" : "CRITICAL")}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                selectedActionType === "CRITICAL"
                  ? "border-amber-300 bg-amber-100 text-amber-950 ring-1 ring-amber-400"
                  : "border-amber-100 bg-amber-50/70 text-amber-800 hover:bg-amber-100/70"
              }`}
            >
              <VsIcon name="verified" className="text-[14px]" />
              <span>Quyết toán / Trọng yếu:</span>
              <strong className="font-bold">{actionCounts.critical}</strong>
            </button>
          )}

          {(selectedActionType !== "ALL" || selectedModuleId !== "ALL" || searchQuery) && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-emerald-700 hover:underline"
            >
              <VsIcon name="restart_alt" className="text-[14px]" />
              <span>Xóa bộ lọc</span>
            </button>
          )}
        </div>

        {/* ── Quick Domain Module Filter Chips ── */}
        {availableModules.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3">
            <span className="mr-1 text-xs font-semibold text-gray-500">Nhóm nghiệp vụ:</span>
            <button
              type="button"
              onClick={() => setSelectedModuleId("ALL")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                selectedModuleId === "ALL"
                  ? "bg-[#25483f] text-white shadow-2xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900"
              }`}
            >
              Tất cả ({categorizedList.length})
            </button>

            {availableModules.map(({ config, count }) => {
              const isSelected = selectedModuleId === config.id;
              return (
                <button
                  key={config.id}
                  type="button"
                  onClick={() => setSelectedModuleId(isSelected ? "ALL" : config.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    isSelected
                      ? "bg-[#25483f] text-white shadow-2xs"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900"
                  }`}
                >
                  <VsIcon name={config.icon} className="text-[14px]" />
                  <span>{config.name}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isSelected ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Content Area: Permissions Presentation ── */}
      {permissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center shadow-xs">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 mb-3">
            <VsIcon name="key" className="text-[28px]" />
          </div>
          <p className="text-base font-bold text-gray-800">
            Vai trò này chưa có quyền hạn nào được gán
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Quyền hạn có thể được cập nhật thông qua vai trò tùy chỉnh kế thừa.
          </p>
        </div>
      ) : filteredPermissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center shadow-xs">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 mb-3">
            <VsIcon name="search" className="text-[28px]" />
          </div>
          <p className="text-base font-bold text-gray-800">
            Không tìm thấy quyền hạn phù hợp
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Thử thay đổi từ khóa tìm kiếm hoặc bấm xóa bộ lọc để hiển thị toàn bộ.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-xs transition hover:bg-gray-50"
          >
            <VsIcon name="restart_alt" className="text-[16px]" />
            <span>Xóa bộ lọc</span>
          </button>
        </div>
      ) : viewMode === "GRID" ? (
        /* ── View Mode: Grouped Cards by Domain Module ── */
        <div className="space-y-6">
          {groupedPermissions.map(({ config, items }) => (
            <div
              key={config.id}
              className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              {/* Group Header */}
              <div className="flex flex-col gap-2 border-b border-gray-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.tagColor.bg} ${config.tagColor.text} shadow-2xs`}
                  >
                    <VsIcon name={config.icon} className="text-[20px]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-gray-900">
                        {config.name}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${config.tagColor.badgeBg}`}
                      >
                        {items.length} quyền
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{config.description}</p>
                  </div>
                </div>
              </div>

              {/* Group Permissions Cards */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((perm) => {
                  const isCritical = perm.actionType === "CRITICAL";
                  const isWrite = perm.actionType === "WRITE";

                  return (
                    <div
                      key={perm.id}
                      className="group flex flex-col justify-between rounded-xl border border-gray-150 bg-gray-50/40 p-3.5 transition-all hover:border-emerald-300 hover:bg-white hover:shadow-sm"
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                            isCritical
                              ? "bg-amber-100 text-amber-800"
                              : isWrite
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          <VsIcon
                            name={isCritical ? "verified" : isWrite ? "check" : "visibility"}
                            className="text-[14px]"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold leading-snug text-gray-900 group-hover:text-emerald-950">
                            {perm.description}
                          </h4>
                        </div>
                      </div>

                      {/* Card Footer: Action badge & API endpoint info */}
                      <div className="mt-3 flex items-center justify-between border-t border-gray-100/80 pt-2 text-[11px]">
                        <span
                          className={`rounded px-1.5 py-0.5 font-semibold ${
                            isCritical
                              ? "bg-amber-50 text-amber-800"
                              : isWrite
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-blue-50 text-blue-800"
                          }`}
                        >
                          {perm.actionLabel}
                        </span>

                        {perm.path && (
                          <span
                            className="max-w-[150px] truncate font-mono text-[10px] text-gray-400 group-hover:text-gray-600"
                            title={`${perm.method} ${perm.path}`}
                          >
                            {perm.method} {perm.path}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── View Mode: Dense Technical Table View ── */
        <div className="overflow-hidden rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-bold uppercase tracking-wider text-gray-600">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    Tên quyền hạn
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Nghiệp vụ
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Cấp độ thao tác
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Phương thức & Endpoint API
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPermissions.map((perm) => {
                  const mod = PERMISSION_MODULES[perm.moduleId] ?? PERMISSION_MODULES.OTHER;
                  const isCritical = perm.actionType === "CRITICAL";
                  const isWrite = perm.actionType === "WRITE";

                  return (
                    <tr key={perm.id} className="transition-colors hover:bg-gray-50/80">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{perm.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${mod.tagColor.badgeBg}`}
                        >
                          <VsIcon name={mod.icon} className="text-[12px]" />
                          <span>{mod.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                            isCritical
                              ? "bg-amber-100 text-amber-900"
                              : isWrite
                              ? "bg-emerald-100 text-emerald-900"
                              : "bg-blue-100 text-blue-900"
                          }`}
                        >
                          {perm.actionLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-gray-600">
                          <span
                            className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                              perm.method === "GET"
                                ? "bg-blue-100 text-blue-800"
                                : perm.method === "POST"
                                ? "bg-emerald-100 text-emerald-800"
                                : perm.method === "DELETE"
                                ? "bg-red-100 text-red-800"
                                : "bg-purple-100 text-purple-800"
                            }`}
                          >
                            {perm.method}
                          </span>
                          <span className="truncate max-w-xs">{perm.path || "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                          <VsIcon name="check_circle" className="text-[13px]" />
                          <span>Được gán</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
