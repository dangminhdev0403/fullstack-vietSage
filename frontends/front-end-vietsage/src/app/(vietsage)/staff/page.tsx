import { auth } from "@/auth";
import Link from "next/link";
import { VsDashboardSidebar } from "../_components/vs-dashboard-sidebar";
import { VsIcon } from "../_components/vs-icon";
import { VsTopBar } from "../_components/vs-top-bar";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import type { StaffRequestListItem, StaffRequestSummaryResponse } from "@/features/hotel-ops/types/hotel-ops-contract";
import {
  formatOpsDateTime,
  priorityTone,
  requestPriorityLabelMap,
  requestStatusLabelMap,
  statusTone,
} from "@/features/hotel-ops/utils/hotel-ops-display";
import {
  hasAnyHotelCapability,
  resolveExplicitAccessibleHotel,
} from "@/features/workspace/utils/workspace-context";
import type { DashboardNavItem } from "@/lib/frontend-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

export const dynamic = "force-dynamic";

type StaffPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function getFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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

export default async function StaffPage({ searchParams }: StaffPageProps) {
  const session = await auth();
  const callbackUrl = "/staff" as const;
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const workspaceContext = await loadServerWorkspaceContext(callbackUrl);
  const requestedHotelId = getFirst(resolvedSearchParams.hotelId);
  const selectedHotel = resolveExplicitAccessibleHotel(
    workspaceContext,
    requestedHotelId,
  );
  const hotelId = selectedHotel?.id ?? null;
  const availableHotels = hasAnyHotelCapability(workspaceContext)
    ? workspaceContext.accessibleHotels
    : [];
  const hasInvalidHotelSelection = Boolean(requestedHotelId && !selectedHotel);
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
                {selectedHotel
                  ? `${selectedHotel.code} · ${selectedHotel.name}`
                  : "Cần chọn phạm vi khách sạn"}
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
                <Link href="/staff" className="inline-flex items-center gap-2 rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-3 text-sm font-semibold text-[var(--primary)]">
                  <VsIcon name="swap_horiz" className="text-[18px]" />
                  Đổi khách sạn
                </Link>
              </div>
            ) : null}
          </header>

          {!hotelId ? (
            <section className="rounded-xl border border-[color:rgba(198,197,213,0.24)] bg-white p-6 md:p-8">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-fixed)] text-[var(--primary)]">
                  <VsIcon name="hotel" className="text-2xl" />
                </span>
                <div>
                  <h2 className="vs-display text-2xl font-semibold text-[var(--primary)]">
                    Chọn khách sạn để tiếp tục
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-variant)]">
                    Phạm vi vận hành không được tự động chọn. Mỗi liên kết bên dưới chỉ xuất hiện
                    khi phiên hiện tại có capability khách sạn và assignment đang hoạt động.
                  </p>
                </div>
              </div>

              {hasInvalidHotelSelection ? (
                <div className="mt-5 rounded-xl border border-[var(--error)]/25 bg-[var(--error-container)] px-4 py-3 text-sm text-[var(--on-error-container)]">
                  Khách sạn được yêu cầu không thuộc phạm vi hoạt động của phiên này. Hãy chọn lại
                  từ danh sách được cấp quyền.
                </div>
              ) : null}

              {availableHotels.length > 0 ? (
                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {availableHotels.map((hotel) => (
                    <Link
                      key={hotel.id}
                      href={`/staff?hotelId=${encodeURIComponent(hotel.id)}`}
                      className="group rounded-xl border border-[color:rgba(198,197,213,0.32)] bg-[var(--surface-container-low)] p-4 transition-colors hover:border-[var(--primary)]/35 hover:bg-[var(--primary-fixed)]"
                    >
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                        {hotel.code}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-[var(--primary)]">
                        {hotel.name}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">
                        Mở workspace
                        <VsIcon name="arrow_forward" className="text-base transition-transform group-hover:translate-x-1" />
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-xl bg-[var(--surface-container-low)] px-4 py-5 text-sm text-[var(--on-surface-variant)]">
                  Chưa có khách sạn hoạt động phù hợp với capability và assignment của vai trò
                  <strong className="ml-1 text-[var(--primary)]">
                    {workspaceContext.activeRole.name}
                  </strong>.
                </div>
              )}
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
