import Link from "next/link";
import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { AdminStaffClient } from "./admin-staff-client";
import { hasWorkspaceCapability } from "@/features/workspace/utils/workspace-context";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import type { TenantOption, TenantOwnerPage } from "@/features/admin/types/admin-contract";
import { TenantOwnersClient } from "./tenant-owners-client";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const requestedTab = first(params.tab) === "staff" ? "staff" : "owners";
  const requestedTenantId = first(params.tenantId).trim();
  const session = await auth();
  const callbackUrl = "/admin/users" as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const workspaceContext = await loadServerWorkspaceContext(callbackUrl);
  const canViewPlatformUsers = hasWorkspaceCapability(workspaceContext, "platform.users.view") || hasWorkspaceCapability(workspaceContext, "platform.users.manage");
  const canViewStaff = canViewPlatformUsers && (hasWorkspaceCapability(workspaceContext, "hotel.staff.view") || hasWorkspaceCapability(workspaceContext, "hotel.staff.manage"));
  const canManageStaff = hasWorkspaceCapability(workspaceContext, "hotel.staff.manage");
  const tab = requestedTab === "staff" && canViewStaff ? "staff" : "owners";

  const pageParam = first(params.page);
  const page = pageParam ? Math.max(1, Number.parseInt(pageParam, 10) || 1) : 1;
  const q = first(params.q).trim();

  let ownersPage: TenantOwnerPage = { items: [], total: 0, page: 1, limit: 20 };
  let tenantOptions: TenantOption[] = [];

  if (tab === "owners") {
    ownersPage = await authorizedApi("list tenant owners", (accessToken) =>
      adminService.listTenantOwners({ query: { page, limit: 20, q: q || undefined }, accessToken }),
    );
  } else if (canViewStaff) {
    tenantOptions = await authorizedApi("list tenant options", (accessToken) =>
      adminService.listTenantOptions(accessToken),
    );
  }

  const tenantId = tenantOptions.some((tenant) => tenant.id === requestedTenantId)
    ? requestedTenantId
    : tenantOptions[0]?.id ?? "";

  return (
    <>
      <div className="mx-auto max-w-[1600px] space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">SUPER_ADMIN</p>
          <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">Người dùng & Phạm vi truy cập</h1>
          <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
            Tách quản lý chủ đơn vị khỏi nhân viên khách sạn; vai trò và phân công khách sạn được cập nhật độc lập.
          </p>
        </header>

        <nav className="inline-flex rounded-xl border border-[var(--outline-variant)] bg-white p-1">
          <Link href="/admin/users?tab=owners" prefetch={true} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "owners" ? "bg-[var(--primary)] text-white" : "text-[var(--primary)]"}`}>Chủ đơn vị</Link>
          {canViewStaff ? <Link href="/admin/users?tab=staff" prefetch={true} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "staff" ? "bg-[var(--primary)] text-white" : "text-[var(--primary)]"}`}>Nhân viên khách sạn</Link> : null}
        </nav>

        {tab === "owners" ? (
          <TenantOwnersClient initialOwners={ownersPage.items} total={ownersPage.total} />
        ) : canViewStaff ? (
          <AdminStaffClient
            tenantOptions={tenantOptions}
            initialTenantId={tenantId}
            canManageStaff={canManageStaff}
          />
        ) : (
          <div className="rounded-xl border border-[var(--outline-variant)] bg-white p-8 text-center text-sm text-[var(--on-surface-variant)]">
            Vai trò hiện tại không có quyền xem nhân viên khách sạn.
          </div>
        )}
      </div>
    </>
  );
}
