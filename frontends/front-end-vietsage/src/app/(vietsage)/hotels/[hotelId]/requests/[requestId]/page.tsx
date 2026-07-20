import { auth } from "@/auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { VsDashboardSidebar } from "../../../../_components/vs-dashboard-sidebar";
import { VsTopBar } from "../../../../_components/vs-top-bar";
import { RequestDetailClient } from "./request-detail-client";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

type RequestDetailPageProps = {
  params: Promise<{ hotelId: string; requestId: string }> | { hotelId: string; requestId: string };
};

export const dynamic = "force-dynamic";

export default async function HotelRequestDetailPage({ params }: RequestDetailPageProps) {
  const { hotelId, requestId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/requests/${requestId}` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const workspaceContext = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  if (!canUseHotelId(workspaceContext, hotelId)) {
    notFound();
  }

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const sidebarItems = buildWorkspaceNavigationForContext({ ...workspaceContext, hotelId });
  const request = await authorizedApi("get hotel request", (accessToken) =>
    hotelOpsService.getRequest(hotelId, requestId, accessToken),
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <VsTopBar
        title="Hotel operations"
        brandLockup={false}
        titleClassName="text-[28px] font-semibold leading-none tracking-tight"
        showLeftControl={false}
        rightMode="profile"
        rightLabel="Team member"
        subtitle="Request detail"
      />
      <VsDashboardSidebar activePath={`/hotels/${hotelId}/requests`} items={sidebarItems} />
      <main className="min-h-screen px-4 pb-24 pt-24 md:ml-80 md:px-10">
        <div className="mx-auto max-w-[1600px] space-y-6">
          <header className="flex flex-col gap-2">
            <Link href={`/hotels/${hotelId}/requests`} className="text-sm font-semibold text-[var(--primary)]">Back to queue</Link>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Hotel {hotelId}</p>
            <h1 className="vs-display text-[32px] font-semibold text-[var(--primary)] md:text-[40px]">Request Detail</h1>
          </header>
          <RequestDetailClient
            hotelId={hotelId}
            initialRequest={request}
          />
        </div>
      </main>
    </div>
  );
}
