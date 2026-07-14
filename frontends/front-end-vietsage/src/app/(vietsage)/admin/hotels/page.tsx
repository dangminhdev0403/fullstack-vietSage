import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { readServerSessionTokens } from "@/lib/server-session-tokens";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { VsDashboardSidebar } from "../../_components/vs-dashboard-sidebar";
import { VsTopBar } from "../../_components/vs-top-bar";
import { HotelsAdminClient } from "./hotels-admin-client";

const TENANT_OWNER_SELECTOR_PAGE_SIZE = 100;

async function listTenantOwnersForSelector(accessToken?: string) {
  const firstPage = await adminService.listTenantOwners({
    query: { page: 1, limit: TENANT_OWNER_SELECTOR_PAGE_SIZE },
    accessToken,
  });

  const totalPages = Math.ceil(firstPage.total / TENANT_OWNER_SELECTOR_PAGE_SIZE);
  const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2);

  if (remainingPages.length === 0) {
    return firstPage.items;
  }

  const pages = await Promise.all(
    remainingPages.map((page) =>
      adminService.listTenantOwners({
        query: { page, limit: TENANT_OWNER_SELECTOR_PAGE_SIZE },
        accessToken,
      }),
    ),
  );

  return [firstPage, ...pages].flatMap((page) => page.items);
}

export default async function AdminHotelsPage() {
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const callbackUrl = "/admin/hotels" as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  const [sidebarItems, hotelsPage, tenantOwners] = await Promise.all([
    resolveDashboardNavigation({
      userRole: "admin",
      assignedRoles: [],
      permissions: [],
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? tokens.accessTokenExpiresAt,
      refreshToken: tokens.refreshToken,
      authError: session?.authError ?? null,
    }),
    authorizedApi("list hotels", (accessToken) =>
      adminService.listHotels({
        query: { page: 1, limit: 100 },
        accessToken,
      }),
    ),
    authorizedApi("list tenant owners for tenant selector", (accessToken) =>
      listTenantOwnersForSelector(accessToken),
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
        subtitle="Quản lý khách sạn"
      />

      <VsDashboardSidebar activePath="/admin/hotels" items={sidebarItems} />

      <main className="min-h-screen px-4 pb-24 pt-24 md:ml-80 md:px-10">
        <div className="mx-auto max-w-[1600px] space-y-8">
          <header>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">
              SUPER_ADMIN
            </p>
            <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">
              Khách sạn
            </h1>
            <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
              Tạo khách sạn dưới tổ chức quản lý hiện có. Nguồn dữ liệu có thể chuyển sang API tổ chức riêng mà không đổi giao diện.
            </p>
          </header>

          <HotelsAdminClient
            initialHotels={hotelsPage.items}
            initialTenantOwners={tenantOwners}
            total={hotelsPage.total}
          />
        </div>
      </main>
    </div>
  );
}
