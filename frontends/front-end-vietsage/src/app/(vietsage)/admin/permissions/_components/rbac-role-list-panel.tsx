"use client";

import { useMemo, useState } from "react";
import { VsIcon } from "../../../_components/vs-icon";
import type { RolePermissionsBrowserRole } from "../permission-types";

type RbacRoleListPanelProps = {
  roles: RolePermissionsBrowserRole[];
  selectedRoleId: string | null;
  onSelectRole: (roleId: string) => void;
  className?: string;
  isCustomTab?: boolean;
  onCreateRole?: () => void;
};

function getRoleIcon(code: string, type?: string): string {
  if (type === "CUSTOM") return "tune";
  const norm = code.toLowerCase();
  if (norm.includes("owner") || norm.includes("super")) return "workspace_premium";
  if (norm.includes("frontdesk") || norm.includes("reception")) return "person";
  if (norm.includes("service") || norm.includes("staff")) return "groups";
  return "shield";
}

export function RbacRoleListPanel({
  roles,
  selectedRoleId,
  onSelectRole,
  className = "",
  isCustomTab = false,
  onCreateRole,
}: RbacRoleListPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "HAS_USERS" | "NO_USERS">("ALL");

  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = r.name.toLowerCase().includes(q);
        const matchCode = r.code.toLowerCase().includes(q);
        const matchDesc = r.description?.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchDesc) return false;
      }
      if (statusFilter === "HAS_USERS" && r.userCount <= 0) return false;
      if (statusFilter === "NO_USERS" && r.userCount > 0) return false;
      return true;
    });
  }, [roles, searchQuery, statusFilter]);

  return (
    <div className={`flex flex-col rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-4 shadow-sm ${className}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-[color:rgba(198,197,213,0.35)] pb-3">
        <div className="flex items-center gap-2">
          <VsIcon name={isCustomTab ? "tune" : "shield"} className="text-[18px] text-emerald-700" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">
            {isCustomTab ? "Vai trò tùy chỉnh" : "Vai trò mặc định"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
            {roles.length}
          </span>
          {isCustomTab && onCreateRole && (
            <button
              type="button"
              onClick={onCreateRole}
              className="flex min-h-11 items-center gap-1 rounded-xl bg-[#25483f] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1a352d]"
              aria-label="Tạo vai trò mới"
            >
              <VsIcon name="add" className="text-[16px]" />
              <span>Tạo vai trò</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Search & Filter Controls (44px target) ── */}
      <div className="mt-3.5 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <VsIcon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-gray-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm vai trò..."
            className="h-11 min-h-11 w-full rounded-lg border border-[color:rgba(198,197,213,0.6)] bg-white py-2 pl-9 pr-10 text-sm text-[var(--on-surface)] placeholder-gray-400 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-0 top-0 flex h-11 min-h-11 w-11 min-w-11 items-center justify-center text-gray-400 hover:text-gray-600"
              aria-label="Xóa tìm kiếm"
            >
              <VsIcon name="close" className="text-[14px]" />
            </button>
          ) : null}
        </div>

        <div className="relative shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-11 min-h-11 appearance-none rounded-lg border border-[color:rgba(198,197,213,0.6)] bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-700 outline-none focus:border-emerald-500"
            aria-label="Lọc người dùng"
          >
            <option value="ALL">Tất cả</option>
            <option value="HAS_USERS">Có người dùng</option>
            <option value="NO_USERS">Chưa gán</option>
          </select>
          <VsIcon
            name="expand_more"
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-gray-400"
          />
        </div>
      </div>

      {/* ── Role List Area ── */}
      <div className="mt-3.5 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {filteredRoles.length === 0 ? (
          isCustomTab ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 mb-3">
                <VsIcon name="tune" className="text-[28px]" />
              </div>
              <p className="text-base font-bold text-gray-800">
                {searchQuery.trim()
                  ? "Không tìm thấy vai trò phù hợp"
                  : "Chưa có vai trò tùy chỉnh"}
              </p>
              <p className="mt-1.5 text-sm text-gray-500">
                {searchQuery.trim()
                  ? "Thử thay đổi từ khóa hoặc bộ lọc tìm kiếm."
                  : "Tạo vai trò tùy chỉnh dựa trên vai trò cơ sở để phân quyền chính xác hơn."}
              </p>
              {onCreateRole && !searchQuery.trim() && (
                <button
                  type="button"
                  onClick={onCreateRole}
                  className="mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-[#25483f] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1a352d]"
                >
                  <VsIcon name="add" className="text-[18px]" />
                  <span>Tạo vai trò</span>
                </button>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-gray-400 italic">
              {searchQuery.trim() ? "Không tìm thấy vai trò phù hợp" : "Không có vai trò mặc định"}
            </p>
          )
        ) : (
          <ul className="space-y-1.5">
            {filteredRoles.map((role) => {
              const isSelected = role.id === selectedRoleId;
              const iconName = getRoleIcon(role.code, role.type);

              return (
                <li key={role.id}>
                  <button
                    type="button"
                    onClick={() => onSelectRole(role.id)}
                    className={`group flex min-h-11 w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-50/50 shadow-sm"
                        : "border-transparent bg-gray-50/60 hover:border-gray-200 hover:bg-gray-100/70"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isSelected
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-white text-gray-600 shadow-2xs"
                      }`}
                    >
                      <VsIcon name={iconName} className="text-[18px]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold uppercase tracking-wide text-gray-900">
                        {role.code}
                      </p>
                      <p className="truncate text-sm text-gray-500">
                        {role.name !== role.code ? role.name : (role.description ?? (role.type === "CUSTOM" ? "Vai trò tùy chỉnh" : "Hệ thống"))}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-semibold text-gray-700">
                          {role.enabledCount != null ? `${role.enabledCount} quyền` : ""}
                        </span>
                        {role.type === "CUSTOM" ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
                            <VsIcon name="tune" className="text-[12px]" /> Tùy chỉnh
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1 py-0.5 text-xs font-semibold text-gray-500">
                            <VsIcon name="lock" className="text-[12px]" /> Hệ thống
                          </span>
                        )}
                      </div>
                      <VsIcon
                        name="chevron_right"
                        className={`text-[16px] transition-transform ${
                          isSelected ? "text-emerald-700" : "text-gray-300 group-hover:translate-x-0.5"
                        }`}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
