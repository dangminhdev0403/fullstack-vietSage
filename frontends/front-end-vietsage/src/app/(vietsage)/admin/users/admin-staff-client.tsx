"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StaffManagementClient } from "@/features/staff-management/components/staff-management-client";
import type { TenantOption } from "@/features/admin/types/admin-contract";
import { VsIcon } from "../../_components/vs-icon";

type Props = {
  tenantOptions: TenantOption[];
  initialTenantId: string;
  canManageStaff: boolean;
};

function formatTenantDisplayName(name: string, code: string): string {
  const cleanName = name.trim();
  if (!cleanName || cleanName.toUpperCase() === "TENANT_OWNER" || cleanName.toUpperCase().startsWith("TENANT_OWNER_")) {
    const numericSuffix = code.replace(/^VSH_TENANT_0*/i, "").replace(/^0+/, "");
    return `Tổ chức Quản lý ${numericSuffix || code}`;
  }
  return cleanName;
}

export function AdminStaffClient({ tenantOptions, initialTenantId, canManageStaff }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenantId, setTenantId] = useState(initialTenantId);

  const handleTenantChange = (newTenantId: string) => {
    setTenantId(newTenantId);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", "staff");
    if (newTenantId) {
      params.set("tenantId", newTenantId);
    } else {
      params.delete("tenantId");
    }
    router.replace(`/admin/users?${params.toString()}`);
  };

  if (tenantOptions.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--outline-variant)] bg-white p-8 text-center text-sm text-[var(--on-surface-variant)]">
        Chưa có tổ chức (tenant) nào trong hệ thống để quản lý nhân viên.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tenantOptions.length > 1 ? (
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[var(--outline-variant)] bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--secondary-container)] text-[var(--on-secondary-container)]">
              <VsIcon name="domain" className="text-xl" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--secondary)]">Phạm vi tổ chức</p>
              <p className="text-sm font-semibold text-[var(--primary)]">Chọn tổ chức để xem và quản lý nhân sự:</p>
            </div>
          </div>
          <div className="w-full sm:w-80">
            <select
              value={tenantId}
              onChange={(e) => handleTenantChange(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-white px-3 text-sm font-medium text-[var(--primary)] transition-colors focus:border-[var(--primary)] focus:outline-none"
            >
              {tenantOptions.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.code ? `${tenant.code} · ` : ""}{formatTenantDisplayName(tenant.name, tenant.code)}
                </option>
              ))}
            </select>
          </div>
        </section>
      ) : tenantOptions.length === 1 ? (
        <section className="flex items-center gap-3 rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-3 shadow-xs">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-container)] text-[var(--primary)]">
            <VsIcon name="domain" className="text-lg" />
          </span>
          <div>
            <p className="text-xs font-medium text-[var(--on-surface-variant)]">Tổ chức quản lý</p>
            <p className="text-sm font-semibold text-[var(--primary)]">
              {tenantOptions[0].code ? `${tenantOptions[0].code} · ` : ""}{formatTenantDisplayName(tenantOptions[0].name, tenantOptions[0].code)}
            </p>
          </div>
        </section>
      ) : null}

      {tenantId ? (
        <StaffManagementClient
          key={tenantId}
          scope={{ surface: "admin", tenantId }}
          canManage={canManageStaff}
        />
      ) : null}
    </div>
  );
}
