import { auth } from "@/auth";
import { notFound } from "next/navigation";

import { VsDashboardSidebar } from "../../../_components/vs-dashboard-sidebar";
import { VsTopBar } from "../../../_components/vs-top-bar";
import { RequestQueueClient } from "./request-queue-client";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { ListHotelRequestsQuery } from "@/features/hotel-ops/types/hotel-ops-contract";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

type RequestsPageProps = {
  params: Promise<{ hotelId: string }> | { hotelId: string };
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

function getFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDayFilter(value: string | undefined, boundary: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!displayMatch) return trimmed;

  return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`;
}

export default async function HotelRequestsPage({ params, searchParams }: RequestsPageProps) {
  const { hotelId } = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const callbackUrl = `/hotels/${hotelId}/requests` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const workspaceContext = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  if (!canUseHotelId(workspaceContext, hotelId)) {
    notFound();
  }

  const query: ListHotelRequestsQuery = {
    page: 1,
    limit: 20,
    roomNumber: getFirst(resolvedSearchParams.roomNumber),
    serviceItemId: getFirst(resolvedSearchParams.serviceItemId),
    priority: getFirst(resolvedSearchParams.priority) as ListHotelRequestsQuery["priority"],
    status: getFirst(resolvedSearchParams.status) as ListHotelRequestsQuery["status"],
    assignedToUserId: getFirst(resolvedSearchParams.assignedToUserId),
    from: normalizeDayFilter(getFirst(resolvedSearchParams.from), "start"),
    to: normalizeDayFilter(getFirst(resolvedSearchParams.to), "end"),
  };

  const summaryQuery = {
    roomNumber: query.roomNumber,
    serviceItemId: query.serviceItemId,
    priority: query.priority,
    assignedToUserId: query.assignedToUserId,
  };

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const sidebarItems = buildWorkspaceNavigationForContext({
    ...workspaceContext,
    hotelId,
  });
  const [requestsPage, requestSummary, serviceItemsPage] = await Promise.all([
    authorizedApi("list hotel requests", (accessToken) => hotelOpsService.listRequests(hotelId, { query, accessToken })),
    authorizedApi("summarize hotel requests", (accessToken) => hotelOpsService.getRequestsSummary(hotelId, { query: summaryQuery, accessToken })),
    authorizedApi("list service items", (accessToken) => hotelOpsService.listServiceItems(hotelId, { query: { page: 1, limit: 100 }, accessToken })),
  ]);

  const initialFilters = Object.fromEntries(
    ["status", "roomNumber", "priority", "assignedToUserId", "from", "to"].map((key) => [key, getFirst(resolvedSearchParams[key]) ?? ""]),
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
        subtitle="Request queue"
      />
      <VsDashboardSidebar activePath={callbackUrl} items={sidebarItems} />
      <main className="min-h-screen px-4 pb-24 pt-24 md:ml-80 md:px-10">
        <div className="mx-auto max-w-[1600px] space-y-6">
          <header className="flex flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Hotel {hotelId}</p>
            <h1 className="vs-display text-[32px] font-semibold text-[var(--primary)] md:text-[40px]">Guest Request Queue</h1>
            <p className="max-w-3xl text-base text-[var(--on-surface-variant)]">A single operational queue for service catalog requests, assignments, and status follow-up.</p>
          </header>
          <RequestQueueClient hotelId={hotelId} requests={requestsPage.items} total={requestsPage.total} summary={requestSummary} serviceItems={serviceItemsPage.items} initialFilters={initialFilters} />
        </div>
      </main>
    </div>
  );
}
