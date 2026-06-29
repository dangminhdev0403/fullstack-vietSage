import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { withOwnerHotelNavigation } from "../../../_components/owner-navigation";
import { OwnerShell } from "../../../_components/owner-shell";
import { OwnerServiceCatalogClient } from "./owner-service-catalog-client";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };

export const dynamic = "force-dynamic";

export default async function OwnerHotelServicesPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const session = await auth();
  const callbackUrl = `/owner/hotels/${hotelId}/services` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  const [sidebarItems, categoriesPage, itemsPage] = await Promise.all([
    resolveDashboardNavigation({
      roles: session?.user.roles ?? [],
      accessToken: session?.accessToken ?? null,
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? null,
      refreshToken: session?.refreshToken ?? null,
      authError: session?.authError ?? null,
    }),
    authorizedApi("list owner service categories", (accessToken) => hotelOpsService.listServiceCategories(hotelId, { query: { page: 1, limit: 100 }, accessToken })),
    authorizedApi("list owner service items", (accessToken) => hotelOpsService.listServiceItems(hotelId, { query: { page: 1, limit: 100 }, accessToken })),
  ]);

  return (
    <OwnerShell activePath={callbackUrl} navItems={withOwnerHotelNavigation(sidebarItems, hotelId)} subtitle="Danh mục dịch vụ">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">DỊCH VỤ</p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">Danh mục dịch vụ</h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">Cấu hình nhóm dịch vụ và dịch vụ khách có thể yêu cầu trong khách sạn.</p>
      </header>

      <OwnerServiceCatalogClient hotelId={hotelId} initialCategories={categoriesPage.items} initialItems={itemsPage.items} />
    </OwnerShell>
  );
}
