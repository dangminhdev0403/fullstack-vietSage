import { auth } from "@/auth";
import { notFound } from "next/navigation";
import { ServiceCatalogClient } from "./service-catalog-client";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

type ServicesPageProps = {
  params: Promise<{ hotelId: string }> | { hotelId: string };
};

export const dynamic = "force-dynamic";

export default async function HotelServicesPage({ params }: ServicesPageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/services` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const workspaceContext = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  if (!canUseHotelId(workspaceContext, hotelId) || (!workspaceContext.permissions.includes("hotel.services.view") && !workspaceContext.permissions.includes("hotel.services.manage"))) {
    notFound();
  }

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const [categoriesPage, itemsPage] = await Promise.all([
    authorizedApi("list service categories", (accessToken) => hotelOpsService.listServiceCategories(hotelId, { query: { page: 1, limit: 100 }, accessToken })),
    authorizedApi("list service items", (accessToken) => hotelOpsService.listServiceItems(hotelId, { query: { page: 1, limit: 100 }, accessToken })),
  ]);

  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Khách sạn {hotelId}</p>
        <h1 className="vs-display text-[32px] font-semibold text-[var(--primary)] md:text-[40px]">Quản lý dịch vụ</h1>
        <p className="max-w-3xl text-base text-[var(--on-surface-variant)]">Bật hoặc tắt trạng thái hoạt động của các dịch vụ và nhóm dịch vụ trong khách sạn.</p>
      </header>

          <ServiceCatalogClient
            hotelId={hotelId}
            initialCategories={categoriesPage.items}
            initialItems={itemsPage.items}
          />
    </>
  );
}
