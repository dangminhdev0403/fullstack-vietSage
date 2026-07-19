import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { readServerSessionTokens } from "@/lib/server-session-tokens";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { AdminShell } from "../_components/admin-shell";
import { TenantOwnersClient } from "./tenant-owners-client";

export default async function AdminUsersPage() {
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const callbackUrl = "/admin/users" as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  const [sidebarItems, ownersPage] = await Promise.all([
    resolveDashboardNavigation({
      userRole: "admin",
      assignedRoles: [],
      permissions: [],
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? tokens.accessTokenExpiresAt,
      refreshToken: tokens.refreshToken,
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
    <AdminShell activePath="/admin/users" navItems={sidebarItems} subtitle="Quản lý chủ sở hữu">
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
    </AdminShell>
  );
}
