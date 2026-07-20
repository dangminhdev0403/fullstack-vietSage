import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

import { AdminShell } from "../_components/admin-shell";
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
  const callbackUrl = "/admin/hotels" as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const workspaceContext = await loadServerWorkspaceContext(callbackUrl);
  const sidebarItems = buildWorkspaceNavigationForContext(workspaceContext);

  const [hotelsPage, tenantOwners] = await Promise.all([
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
    <AdminShell activePath="/admin/hotels" navItems={sidebarItems} subtitle="Quản lý khách sạn">
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
    </AdminShell>
  );
}
