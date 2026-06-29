import { auth } from "@/auth";
import Link from "next/link";
import { VsDashboardSidebar } from "../_components/vs-dashboard-sidebar";
import { VsIcon } from "../_components/vs-icon";
import { VsTopBar } from "../_components/vs-top-bar";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { StaffRequestListItem, StaffRequestSummaryResponse } from "@/features/hotel-ops/types/hotel-ops-contract";
import { getSessionHotelIds } from "@/features/hotel-ops/utils/hotel-route-auth";
import {
  formatOpsDateTime,
  priorityTone,
  requestPriorityLabelMap,
  requestStatusLabelMap,
  statusTone,
} from "@/features/hotel-ops/utils/hotel-ops-display";
import type { DashboardNavItem } from "@/lib/frontend-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

export const dynamic = "force-dynamic";

function buildStaffNavigation(hotelId: string | null): DashboardNavItem[] {
  const items: DashboardNavItem[] = [
    { key: "/staff", href: "/staff", label: "Staff dashboard", icon: "dashboard" },
  ];

  if (hotelId) {
    items.push(
      { key: `/hotels/${hotelId}/requests`, href: `/hotels/${hotelId}/requests`, label: "Request queue", icon: "assignment" },
      { key: `/hotels/${hotelId}/services`, href: `/hotels/${hotelId}/services`, label: "Service catalog", icon: "room_service" },
    );
  }

  return items;
}

function countActiveRequests(summary: StaffRequestSummaryResponse | null): number {
  if (!summary) return 0;
  return summary.statuses.CREATED + summary.statuses.ACKNOWLEDGED + summary.statuses.IN_PROGRESS;
}

export default async function StaffPage() {
  const session = await auth();
  const callbackUrl = "/staff" as const;
  const hotelId = session ? getSessionHotelIds(session)[0] ?? null : null;
  const sidebarItems = buildStaffNavigation(hotelId);

  let requests: StaffRequestListItem[] = [];
  let requestSummary: StaffRequestSummaryResponse | null = null;
  let totalRequests = 0;
  let totalCategories = 0;
  let totalItems = 0;

  if (session && hotelId) {
    const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
    const [requestsPage, summaryPayload, categoriesPage, itemsPage] = await Promise.all([
      authorizedApi("list staff requests", (accessToken) => hotelOpsService.listRequests(hotelId, { query: { page: 1, limit: 8 }, accessToken })),
      authorizedApi("summarize staff requests", (accessToken) => hotelOpsService.getRequestsSummary(hotelId, { accessToken })),
      authorizedApi("list staff service categories", (accessToken) => hotelOpsService.listServiceCategories(hotelId, { query: { page: 1, limit: 1 }, accessToken })),
      authorizedApi("list staff service items", (accessToken) => hotelOpsService.listServiceItems(hotelId, { query: { page: 1, limit: 1 }, accessToken })),
    ]);

    requests = requestsPage.items;
    requestSummary = summaryPayload;
    totalRequests = requestsPage.total;
    totalCategories = categoriesPage.total;
    totalItems = itemsPage.total;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <VsTopBar
        title="Staff operations"
        brandLockup={false}
        titleClassName="text-[28px] font-semibold leading-none tracking-tight"
        showLeftControl={false}
        rightMode="profile"
        rightLabel="Staff"
        subtitle="Rooms, services, and guest requests"
      />

      <VsDashboardSidebar activePath="/staff" items={sidebarItems} />

      <main className="min-h-screen px-4 pb-24 pt-24 md:ml-80 md:px-10">
        <div className="mx-auto max-w-[1600px] space-y-8">
          <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                {hotelId ? `Hotel ${hotelId}` : "Hotel context required"}
              </p>
              <h1 className="vs-display mt-1 text-[32px] font-semibold text-[var(--primary)] md:text-[40px]">
                Staff Workspace
              </h1>
              <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
                Manage guest requests and service catalog operations from the staff surface, separate from admin configuration.
              </p>
            </div>

            {hotelId ? (
              <div className="flex flex-wrap gap-2">
                <Link href={`/hotels/${hotelId}/requests`} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--on-primary)]">
                  <VsIcon name="assignment" className="text-[18px]" />
                  Open request queue
                </Link>
                <Link href={`/hotels/${hotelId}/services`} className="inline-flex items-center gap-2 rounded-xl bg-[var(--secondary-container)] px-4 py-3 text-sm font-semibold text-[var(--on-secondary-container)]">
                  <VsIcon name="room_service" className="text-[18px]" />
                  Manage services
                </Link>
              </div>
            ) : null}
          </header>

          {!hotelId ? (
            <section className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-8 text-center">
              <VsIcon name="hotel" className="mx-auto mb-3 text-4xl text-[var(--primary)]" />
              <h2 className="vs-display text-2xl font-semibold text-[var(--primary)]">Select a hotel to continue</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--on-surface-variant)]">
                Your staff session does not expose a hotel id yet. Once the backend session includes hotel or tenant context, this page will show service and request operations here.
              </p>
            </section>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-xl border border-[color:rgba(198,197,213,0.18)] bg-white p-5">
                  <p className="text-sm font-semibold text-[var(--on-surface-variant)]">Active requests</p>
                  <h2 className="vs-display mt-2 text-4xl font-bold text-[var(--primary)]">{countActiveRequests(requestSummary)}</h2>
                </article>
                <article className="rounded-xl border border-[color:rgba(198,197,213,0.18)] bg-white p-5">
                  <p className="text-sm font-semibold text-[var(--on-surface-variant)]">New requests</p>
                  <h2 className="vs-display mt-2 text-4xl font-bold text-[var(--primary)]">{requestSummary?.statuses.CREATED ?? 0}</h2>
                </article>
                <article className="rounded-xl border border-[color:rgba(198,197,213,0.18)] bg-white p-5">
                  <p className="text-sm font-semibold text-[var(--on-surface-variant)]">Service categories</p>
                  <h2 className="vs-display mt-2 text-4xl font-bold text-[var(--primary)]">{totalCategories}</h2>
                </article>
                <article className="rounded-xl border border-[color:rgba(198,197,213,0.18)] bg-white p-5">
                  <p className="text-sm font-semibold text-[var(--on-surface-variant)]">Service items</p>
                  <h2 className="vs-display mt-2 text-4xl font-bold text-[var(--primary)]">{totalItems}</h2>
                </article>
              </section>

              <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
                <article className="overflow-hidden rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white">
                  <div className="flex items-center justify-between border-b border-[color:rgba(198,197,213,0.18)] px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--primary)]">Recent guest requests</h2>
                      <p className="text-sm text-[var(--on-surface-variant)]">{totalRequests} total requests</p>
                    </div>
                    <Link href={`/hotels/${hotelId}/requests`} className="text-sm font-semibold text-[var(--primary)]">View all</Link>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead className="bg-[var(--surface-container-low)] text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
                        <tr><th className="px-4 py-3">Room</th><th className="px-4 py-3">Guest</th><th className="px-4 py-3">Request</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th></tr>
                      </thead>
                      <tbody>
                        {requests.map((request) => (
                          <tr key={request.id} className="border-t border-[color:rgba(198,197,213,0.18)] hover:bg-[var(--surface-container-low)]">
                            <td className="px-4 py-3 font-semibold text-[var(--primary)]"><Link href={`/hotels/${hotelId}/requests/${request.id}`}>Room {request.roomNumber}</Link></td>
                            <td className="px-4 py-3">{request.guestName ?? "Guest"}</td>
                            <td className="px-4 py-3">{request.displayName}</td>
                            <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${priorityTone(request.priority)}`}>{requestPriorityLabelMap[request.priority]}</span></td>
                            <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone(request.status)}`}>{requestStatusLabelMap[request.status]}</span></td>
                            <td className="px-4 py-3">{formatOpsDateTime(request.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {requests.length === 0 ? <p className="p-6 text-center text-sm text-[var(--on-surface-variant)]">No guest requests yet.</p> : null}
                  </div>
                </article>

                <aside className="space-y-4">
                  <Link href={`/hotels/${hotelId}/services`} className="block rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-5 transition-colors hover:bg-[var(--surface-container-low)]">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-[var(--primary-fixed)] text-[var(--primary)]">
                      <VsIcon name="room_service" className="text-[24px]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--primary)]">Service catalog</h3>
                    <p className="mt-2 text-sm text-[var(--on-surface-variant)]">Create categories, manage item status, pricing, and request types.</p>
                  </Link>
                  <Link href={`/hotels/${hotelId}/requests`} className="block rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-5 transition-colors hover:bg-[var(--surface-container-low)]">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-[var(--secondary-container)] text-[var(--on-secondary-container)]">
                      <VsIcon name="meeting_room" className="text-[24px]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--primary)]">Rooms and requests</h3>
                    <p className="mt-2 text-sm text-[var(--on-surface-variant)]">Work by room, guest, reservation code, service item, status, and assigned user.</p>
                  </Link>
                </aside>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
