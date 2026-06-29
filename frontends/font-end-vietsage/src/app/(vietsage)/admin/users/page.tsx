import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { VsDashboardSidebar } from "../../_components/vs-dashboard-sidebar";
import { VsTopBar } from "../../_components/vs-top-bar";
import { TenantOwnersClient } from "./tenant-owners-client";

export default async function AdminUsersPage() {
  const session = await auth();
  const callbackUrl = "/admin/users" as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  const [sidebarItems, ownersPage] = await Promise.all([
    resolveDashboardNavigation({
      userRole: "admin",
      assignedRoles: [],
      permissions: [],
      accessToken: session?.accessToken ?? null,
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? null,
      refreshToken: session?.refreshToken ?? null,
      authError: session?.authError ?? null,
    }),
    authorizedApi("list tenant owners", (accessToken) =>
      adminService.listTenantOwners({
        query: { page: 1, limit: 100 },
        accessToken,
      }),
    ),
  ]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <VsTopBar
        title="VietSage"
        brandLockup={false}
        titleClassName="text-[32px] font-semibold leading-none tracking-tight"
        showLeftControl={false}
        rightMode="profile"
        rightLabel="Quản trị viên"
        subtitle="Quản lý chủ sở hữu"
      />

      <VsDashboardSidebar activePath="/admin/users" items={sidebarItems} />

      <main className="min-h-screen px-4 pb-24 pt-24 md:ml-80 md:px-10">
        <div className="mx-auto max-w-[1600px] space-y-8">
          <header>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
              SUPER_ADMIN
            </p>
            <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">
              Quản lý chủ sở hữu
            </h1>
            <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
              Tạo và quản lý đối tác khách sạn. Mỗi đối tác đại diện cho một tổ chức quản lý khách sạn.
            </p>
          </header>

          <TenantOwnersClient initialOwners={ownersPage.items} total={ownersPage.total} />
        </div>
      </main>
    </div>
  );
}
