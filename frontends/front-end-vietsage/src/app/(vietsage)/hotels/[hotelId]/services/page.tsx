import { auth } from "@/auth";
import { notFound } from "next/navigation";

import { VsDashboardSidebar } from "../../../_components/vs-dashboard-sidebar";
import { VsTopBar } from "../../../_components/vs-top-bar";
import { ServiceCatalogClient } from "./service-catalog-client";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { resolveDashboardNavigation, type DashboardNavItem } from "@/lib/frontend-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

type ServicesPageProps = {
  params: Promise<{ hotelId: string }> | { hotelId: string };
};

export const dynamic = "force-dynamic";

function withHotelOpsItems(items: DashboardNavItem[], hotelId: string): DashboardNavItem[] {
  const additions: DashboardNavItem[] = [
    { key: `/hotels/${hotelId}/services`, href: `/hotels/${hotelId}/services`, label: "Service catalog", icon: "room_service" },
    { key: `/hotels/${hotelId}/requests`, href: `/hotels/${hotelId}/requests`, label: "Request queue", icon: "assignment" },
  ];
  const byHref = new Map<string, DashboardNavItem>();
  for (const item of [...items, ...additions]) {
    byHref.set(item.href, item);
  }
  return [...byHref.values()];
}

export default async function HotelServicesPage({ params }: ServicesPageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/services` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);

  if (!canUseHotelId(session, hotelId)) {
    notFound();
  }

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const [categoriesPage, itemsPage, sidebarItems] = await Promise.all([
    authorizedApi("list service categories", (accessToken) => hotelOpsService.listServiceCategories(hotelId, { query: { page: 1, limit: 100 }, accessToken })),
    authorizedApi("list service items", (accessToken) => hotelOpsService.listServiceItems(hotelId, { query: { page: 1, limit: 100 }, accessToken })),
    resolveDashboardNavigation({
      userRole: "staff",
      assignedRoles: [],
      permissions: [],
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshToken: tokens.refreshToken,
      authError: session.authError,
    }),
  ]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <VsTopBar
        title="Hotel operations"
        brandLockup={false}
        titleClassName="text-[28px] font-semibold leading-none tracking-tight"
        showLeftControl={false}
        rightMode="profile"
        rightLabel="Team member"
        subtitle="Service catalog"
      />
      <VsDashboardSidebar activePath={callbackUrl} items={withHotelOpsItems(sidebarItems, hotelId)} />
      <main className="min-h-screen px-4 pb-24 pt-24 md:ml-80 md:px-10">
        <div className="mx-auto max-w-[1600px] space-y-6">
          <header className="flex flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Hotel {hotelId}</p>
            <h1 className="vs-display text-[32px] font-semibold text-[var(--primary)] md:text-[40px]">Service Catalog</h1>
            <p className="max-w-3xl text-base text-[var(--on-surface-variant)]">Configure what guests can request, keep disabled records visible for staff, and control the catalog shown in GuestOS.</p>
          </header>

          <ServiceCatalogClient
            hotelId={hotelId}
            initialCategories={categoriesPage.items}
            initialItems={itemsPage.items}
          />
        </div>
      </main>
    </div>
  );
}
