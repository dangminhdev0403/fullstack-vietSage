import Link from "next/link";
import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { StaffManagementClient } from "@/features/staff-management/components/staff-management-client";
import { hasWorkspaceCapability } from "@/features/workspace/utils/workspace-context";
import { buildWorkspaceNavigation } from "@/features/workspace/config/workspace-registry";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import type { TenantOption, TenantOwnerPage } from "@/features/admin/types/admin-contract";
import { TenantOwnersClient } from "./tenant-owners-client";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = await Promise.resolve(searchParams ?? {});
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
    : "";

  return (
    <>
      <div className="mx-auto max-w-[1600px] space-y-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">SUPER_ADMIN</p>
          <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">Người dùng & phạm vi truy cập</h1>
          <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
            Tách quản lý chủ đơn vị khỏi nhân viên khách sạn; vai trò và phân công khách sạn được cập nhật độc lập.
          </p>
        </header>

        <nav className="inline-flex rounded-xl border border-[var(--outline-variant)] bg-white p-1">
          <Link href="/admin/users?tab=owners" className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "owners" ? "bg-[var(--primary)] text-white" : "text-[var(--primary)]"}`}>Chủ đơn vị</Link>
          {canViewStaff ? <Link href="/admin/users?tab=staff" className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "staff" ? "bg-[var(--primary)] text-white" : "text-[var(--primary)]"}`}>Nhân viên khách sạn</Link> : null}
        </nav>

        {tab === "owners" ? (
          <TenantOwnersClient initialOwners={ownersPage.items} total={ownersPage.total} />
        ) : canViewStaff ? (
          <div className="space-y-6">
            <form className="flex flex-col gap-3 rounded-xl border border-[var(--outline-variant)] bg-white p-5 md:flex-row md:items-end" method="GET">
              <input type="hidden" name="tab" value="staff" />
              <label className="flex-1 text-sm font-semibold text-[var(--primary)]">Tenant
                <select name="tenantId" defaultValue={tenantId} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-white px-3 font-normal">
                  <option value="">Chọn tenant để chỉ tải đúng nhân viên</option>
                  {tenantOptions.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.code} · {tenant.name}</option>)}
                </select>
              </label>
              <button className="min-h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-semibold text-white">Mở phạm vi</button>
            </form>
            {tenantId ? (
              <StaffManagementClient scope={{ surface: "admin", tenantId }} canManage={canManageStaff} />
            ) : (
              <div className="rounded-xl bg-[var(--surface-container-low)] p-8 text-center text-sm text-[var(--on-surface-variant)]">Chọn tenant trước; danh sách nhân viên sẽ không được tải khi chưa có phạm vi.</div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--outline-variant)] bg-white p-8 text-center text-sm text-[var(--on-surface-variant)]">
            Vai trò hiện tại không có quyền xem nhân viên khách sạn.
          </div>
        )}
      </div>
    </>
  );
}
