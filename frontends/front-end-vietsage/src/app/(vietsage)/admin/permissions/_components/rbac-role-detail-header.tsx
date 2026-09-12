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

export function RbacRoleDetailHeader({
  role,
  totalPermissions,
  activeTab,
  onTabChange,
}: RbacRoleDetailHeaderProps) {
  if (!role) {
    return (
      <div className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-6 text-sm text-gray-500 shadow-sm">
        Vui lòng chọn một vai trò để xem quyền
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-5 shadow-sm sm:p-6">
      {/* ── Top Row: Role identity & canonical system badge ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Role identity */}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 shadow-2xs">
            <VsIcon
              name="workspace_premium"
              className="text-[32px]"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Vai trò hệ thống mặc định
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
              {role.code}
            </h1>
            <p className="mt-0.5 text-xs text-gray-500">
              {role.name !== role.code ? role.name : (role.description ?? "Hệ thống")}
              {" • "}
              <span className="font-semibold text-gray-700">{totalPermissions} quyền</span>
            </p>
          </div>
        </div>

        {/* Right: Badge */}
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3.5 py-2">
          <VsIcon name="verified" className="text-[18px] text-emerald-700" />
          <div>
            <p className="text-xs font-bold text-emerald-900">
              Quyền hạn chuẩn hóa
            </p>
            <p className="text-[11px] text-emerald-700">
              Áp dụng tự động theo nghiệp vụ hệ thống
            </p>
          </div>
        </div>
      </div>

      {/* ── Sub Navigation Tabs (44px control target) ── */}
      <div className="mt-6 flex border-b border-gray-200" role="tablist" aria-label="Chi tiết vai trò">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "PERMISSIONS"}
          onClick={() => onTabChange("PERMISSIONS")}
          className={`flex min-h-11 h-11 items-center gap-2 border-b-2 px-4 text-xs font-semibold transition-colors ${
            activeTab === "PERMISSIONS"
              ? "border-emerald-700 text-emerald-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <VsIcon name="key" className="text-[16px]" />
          <span>Quyền hạn ({totalPermissions})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "INFO"}
          onClick={() => onTabChange("INFO")}
          className={`flex min-h-11 h-11 items-center gap-2 border-b-2 px-4 text-xs font-semibold transition-colors ${
            activeTab === "INFO"
              ? "border-emerald-700 text-emerald-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <VsIcon name="info" className="text-[16px]" />
          <span>Thông tin</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "USERS"}
          onClick={() => onTabChange("USERS")}
          className={`flex min-h-11 h-11 items-center gap-2 border-b-2 px-4 text-xs font-semibold transition-colors ${
            activeTab === "USERS"
              ? "border-emerald-700 text-emerald-900"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          <VsIcon name="groups" className="text-[16px]" />
          <span>Người dùng ({role.userCount})</span>
        </button>
      </div>
    </div>
  );
}
