"use client";

import { VsIcon } from "../../../_components/vs-icon";
import type { RolePermissionsBrowserRole } from "../permission-types";

export type DetailTab = "PERMISSIONS" | "INFO" | "USERS";

type RbacRoleDetailHeaderProps = {
  role: RolePermissionsBrowserRole | null;
  totalPermissions: number;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
};

function getHeaderRoleIcon(code: string): string {
  const norm = code.toLowerCase();
  if (norm.includes("owner") || norm.includes("super")) return "workspace_premium";
  if (norm.includes("frontdesk") || norm.includes("reception")) return "person";
  if (norm.includes("service") || norm.includes("staff")) return "groups";
  return "shield";
}

export function RbacRoleDetailHeader({
  role,
  totalPermissions,
  activeTab,
  onTabChange,
}: RbacRoleDetailHeaderProps) {
  if (!role) {
    return (
      <div className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-6 text-sm text-gray-500 shadow-sm">
        Vui lòng chọn một vai trò để xem quyền hạn
      </div>
    );
  }

  const iconName = getHeaderRoleIcon(role.code);
  const displayName = role.name !== role.code ? role.name : role.code;

  return (
    <div className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-5 shadow-sm sm:p-6">
      {/* ── Top Row: Role identity & canonical system badge ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Role identity */}
        <div className="flex items-start gap-4 sm:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 shadow-2xs">
            <VsIcon name={iconName} className="text-[30px]" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-emerald-100/80 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-900">
                Vai trò hệ thống mặc định
              </span>
              <span className="font-mono text-xs font-semibold text-gray-500">
                {role.code}
              </span>
            </div>

            <h1 className="mt-1 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
              {displayName}
            </h1>

            <p className="mt-0.5 text-xs text-gray-500">
              {role.description || "Vai trò nghiệp vụ tiêu chuẩn được chuẩn hóa sẵn trong hệ thống VietSage."}
            </p>
          </div>
        </div>

        {/* Right: Badge */}
        <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3 sm:max-w-xs">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
            <VsIcon name="verified" className="text-[20px]" />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-950">
              Quyền hạn chuẩn hóa
            </p>
            <p className="text-[11px] text-emerald-700 leading-tight">
              Áp dụng tự động theo quy chuẩn vận hành hệ thống
            </p>
          </div>
        </div>
      </div>

      {/* ── Sub Navigation Tabs (44px control target) ── */}
      <div
        className="mt-6 flex border-b border-gray-200"
        role="tablist"
        aria-label="Chi tiết vai trò"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "PERMISSIONS"}
          onClick={() => onTabChange("PERMISSIONS")}
          className={`flex min-h-11 h-11 items-center gap-2 border-b-2 px-4 text-xs font-semibold transition-all ${
            activeTab === "PERMISSIONS"
              ? "border-emerald-700 text-emerald-900 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <VsIcon name="key" className="text-[16px]" />
          <span>Quyền hạn</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              activeTab === "PERMISSIONS"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {totalPermissions}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "INFO"}
          onClick={() => onTabChange("INFO")}
          className={`flex min-h-11 h-11 items-center gap-2 border-b-2 px-4 text-xs font-semibold transition-all ${
            activeTab === "INFO"
              ? "border-emerald-700 text-emerald-900 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <VsIcon name="info" className="text-[16px]" />
          <span>Thông tin vai trò</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "USERS"}
          onClick={() => onTabChange("USERS")}
          className={`flex min-h-11 h-11 items-center gap-2 border-b-2 px-4 text-xs font-semibold transition-all ${
            activeTab === "USERS"
              ? "border-emerald-700 text-emerald-900 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <VsIcon name="groups" className="text-[16px]" />
          <span>Người dùng áp dụng</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              activeTab === "USERS"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {role.userCount}
          </span>
        </button>
      </div>
    </div>
  );
}
