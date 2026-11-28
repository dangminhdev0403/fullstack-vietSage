import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { formatMoney } from "@/features/billing/utils/money";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { HotelArrival } from "@/features/hotel-ops/types/hotel-ops-contract";
import { formatDayMonth, formatDashboardCount } from "./dashboard-presentation";
import { getArrivalDateRange } from "@/features/hotel-ops/utils/arrival-date-range";

type PageProps = { params: Promise<{ hotelId: string }> };
export const dynamic = "force-dynamic";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function percent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function attentionRoute(
  hotelId: string,
  item: { type: string; id: string; action: { route: string } },
  basePrefix: string = "/hotels",
): string {
  if (item.type.includes("request")) return `${basePrefix}/${hotelId}/requests?requestId=${encodeURIComponent(item.id)}`;
  if (item.type.includes("checkout")) return `${basePrefix}/${hotelId}/billing`;
  if (item.type.includes("room")) return `${basePrefix}/${hotelId}/rooms`;
  if (item.action.route.startsWith(`${basePrefix}/${hotelId}/`)) return item.action.route;
  return `${basePrefix}/${hotelId}/dashboard`;
}

export default async function StaffHotelDashboardPage({
  params,
  baseRoutePrefix = "/hotels",
}: PageProps & { baseRoutePrefix?: string }) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `${baseRoutePrefix}/${hotelId}/dashboard` as `/${string}`;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  if (!canUseHotelId(context, hotelId) || !context.permissions.includes("hotel.dashboard.view")) notFound();

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const dashboard = await authorizedApi("load staff hotel dashboard", (accessToken) =>
    hotelOpsService.getDashboard(hotelId, { accessToken }),
  );

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrowDate);

  let tomorrowArrivals: HotelArrival[] = [];
  try {
    const tomorrowRange = getArrivalDateRange("tomorrow", new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()));
    const arrivalsPage = await authorizedApi("load tomorrow arrivals", (accessToken) =>
      hotelOpsService.listArrivals(hotelId, {
        query: { ...tomorrowRange, limit: 10 },
        accessToken,
      }),
    );
    tomorrowArrivals = arrivalsPage?.items ?? [];
  } catch (_e) {
    tomorrowArrivals = [];
  }

  const guests = dashboard.guests ?? {
    inHouse: dashboard.stays.activeStays ?? dashboard.rooms.byStatus.occupied,
    advanceReservations: 0,
    arrivalsToday: dashboard.stays.todayCheckIns,
    arrivalsTomorrow: tomorrowArrivals.length,
  };

  const roomMetrics = [
    {
      label: "Sẵn sàng",
      value: dashboard.rooms.byStatus.available,
      dot: "bg-emerald-500",
      tone: "text-emerald-800",
      border: "border-emerald-200/80 bg-emerald-50/40",
      percent: dashboard.rooms.total ? percent((dashboard.rooms.byStatus.available / dashboard.rooms.total) * 100) : undefined,
      href: `${baseRoutePrefix}/${hotelId}/rooms?status=available`,
    },
    {
      label: "Đang ở",
      value: dashboard.rooms.byStatus.occupied,
      dot: "bg-sky-500",
      tone: "text-sky-800",
      border: "border-sky-200/80 bg-sky-50/40",
      percent: percent(dashboard.rooms.occupancyRate),
      href: `${baseRoutePrefix}/${hotelId}/rooms?status=occupied`,
    },
    {
      label: "Đang dọn",
      value: dashboard.rooms.byStatus.processing,
      dot: "bg-amber-500",
      tone: "text-amber-800",
      border: "border-amber-200/80 bg-amber-50/40",
      percent: undefined,
      href: `${baseRoutePrefix}/${hotelId}/rooms?status=processing`,
    },
    {
      label: "Bảo trì",
      value: dashboard.rooms.byStatus.maintenance,
      dot: "bg-rose-500",
      tone: "text-rose-800",
      border: "border-rose-200/80 bg-rose-50/40",
      percent: undefined,
      href: `${baseRoutePrefix}/${hotelId}/rooms?status=maintenance`,
    },
  ] as const;

  const operationMetrics = [
    {
      label: "Nhận phòng",
      value: dashboard.stays.todayCheckIns,
      icon: "login",
      tone: "text-emerald-800",
      iconTone: "text-emerald-700",
      href: `${baseRoutePrefix}/${hotelId}/front-desk?tab=arrivals&range=today`,
    },
    {
      label: "Trả phòng",
      value: dashboard.stays.todayCheckOuts,
      icon: "logout",
      tone: "text-amber-800",
      iconTone: "text-amber-700",
      href: `${baseRoutePrefix}/${hotelId}/rooms`,
    },
    {
      label: "Đang lưu trú",
      value: guests.inHouse,
      icon: "group",
      tone: "text-blue-800",
      iconTone: "text-blue-700",
      href: `${baseRoutePrefix}/${hotelId}/front-desk?tab=in-house`,
    },
    {
      label: "Đặt trước",
      value: guests.advanceReservations,
      icon: "calendar_month",
      tone: "text-purple-800",
      iconTone: "text-purple-700",
      href: `${baseRoutePrefix}/${hotelId}/front-desk?tab=arrivals&range=week`,
    },
    {
      label: "Đến ngày mai",
      value: guests.arrivalsTomorrow,
      icon: "next_plan",
      tone: "text-amber-900",
      iconTone: "text-amber-700",
      href: `${baseRoutePrefix}/${hotelId}/rooms?businessDate=${tomorrowYmd}`,
    },
    {
      label: "Yêu cầu mới",
      value: dashboard.requests.byStatus.sent,
      icon: "notifications_active",
      tone: "text-[var(--primary)]",
      iconTone: "text-[var(--primary)]",
      href: `${baseRoutePrefix}/${hotelId}/requests`,
    },
  ] as const;

  return (
    <main className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="vs-display text-2xl sm:text-3xl font-bold text-[var(--primary)] text-balance">
          Tổng quan điều hành &amp; Tài chính
        </h1>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--outline-variant)]/40 bg-white px-3 text-xs font-bold text-[var(--primary)] whitespace-nowrap shadow-2xs">
            <VsIcon name="calendar_today" className="text-sm text-[var(--secondary)]" />
            <span>Hôm nay: {formatDayMonth(dashboard.generatedAt)}</span>
          </span>
          <Link
            href={`${baseRoutePrefix}/${hotelId}/billing`}
            prefetch={true}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-xs font-bold text-white shadow-2xs transition hover:opacity-90 active:scale-95 whitespace-nowrap"
          >
            <VsIcon name="payments" className="text-sm" />
            <span>Sổ thu ngân &amp; Hóa đơn</span>
          </Link>
        </div>
      </header>

      {/* Tình trạng phòng & Biến động Check-in / Check-out (Compact Mini-Boxes) */}
      <section
        aria-label="Tình trạng phòng và biến động trong ngày"
        className="rounded-xl border border-[var(--outline-variant)]/30 bg-white p-3.5 shadow-2xs space-y-2.5"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {roomMetrics.map((metric) => (
            <Link
              key={metric.label}
              href={metric.href}
              prefetch={true}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition hover:brightness-95 ${metric.border}`}
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap">
                <span className={`size-2 shrink-0 rounded-full ${metric.dot}`} aria-hidden="true" />
                <span>{metric.label}</span>
              </span>
              <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                <strong className={`text-lg font-extrabold tabular-nums leading-none ${metric.tone}`}>
                  {formatDashboardCount(metric.value)}
                </strong>
                {metric.percent !== undefined ? (
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    {metric.percent}%
                  </span>
                ) : null}
              </span>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {operationMetrics.map((metric) => (
            <Link
              key={metric.label}
              href={metric.href}
              prefetch={true}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 whitespace-nowrap min-w-0">
                <VsIcon name={metric.icon} className={`text-sm shrink-0 ${metric.iconTone}`} />
                <span className="truncate">{metric.label}</span>
              </span>
              <strong className={`text-base font-extrabold tabular-nums leading-none shrink-0 ${metric.tone}`}>
                {formatDashboardCount(metric.value)}
              </strong>
            </Link>
          ))}
        </div>
      </section>

      {/* Trung tâm Tài chính & Doanh thu Khách sạn */}
      <section className="rounded-xl border border-[var(--outline-variant)]/30 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-[var(--outline-variant)]/20 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-[#e6efe9] text-[var(--primary)]">
              <VsIcon name="account_balance_wallet" className="text-base" />
            </span>
            <h2 className="text-sm sm:text-base font-bold text-[var(--primary)] text-balance">
              Doanh thu &amp; Công nợ vận hành
            </h2>
          </div>
          <Link
            href={`${baseRoutePrefix}/${hotelId}/billing`}
            prefetch={true}
            className="text-xs font-bold text-[var(--primary)] hover:underline inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
          >
            <span>Chi tiết thu ngân</span>
            <VsIcon name="arrow_forward" className="text-xs" />
          </Link>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#166534]">Doanh thu hôm nay</p>
            <p className="vs-display mt-1 text-xl lg:text-2xl font-bold tabular-nums text-[#14532d]">
              {formatMoney(dashboard.revenue.today, dashboard.revenue.currency)}
            </p>
          </div>

          <div className="rounded-lg border border-[var(--outline-variant)]/40 bg-[var(--surface-container-low)] px-3 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--on-surface-variant)]">7 ngày gần nhất</p>
            <p className="vs-display mt-1 text-xl lg:text-2xl font-bold tabular-nums text-[var(--primary)]">
              {formatMoney(dashboard.revenue.last7Days, dashboard.revenue.currency)}
            </p>
          </div>

          <div className="rounded-lg border border-[#fed7aa] bg-[#fffaf5] px-3 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#9a3412]">Doanh thu tháng này</p>
            <p className="vs-display mt-1 text-xl lg:text-2xl font-bold tabular-nums text-[#9a3412]">
              {formatMoney(dashboard.revenue.currentMonth, dashboard.revenue.currency)}
            </p>
          </div>

          <div className="rounded-lg border border-[#fecaca] bg-[#fff5f5] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#991b1b]">Chờ thanh toán</p>
              <Link
                href={`${baseRoutePrefix}/${hotelId}/billing`}
                prefetch={true}
                className="text-xs font-bold text-[#b91c1c] hover:underline whitespace-nowrap"
              >
                Thu tiền &rarr;
              </Link>
            </div>
            <p className="vs-display mt-1 text-xl lg:text-2xl font-bold tabular-nums text-[#991b1b]">
              {formatDashboardCount(dashboard.stays.pendingCheckOuts)}{" "}
              <span className="text-xs font-semibold">lượt chưa chốt</span>
            </p>
          </div>
        </div>
      </section>

      {/* Kế hoạch Chuẩn bị đón tiếp ngày mai */}
      <section className="rounded-xl border border-amber-300/80 bg-amber-50/45 p-3.5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-900">
              <VsIcon name="assignment_turned_in" className="text-base" />
            </span>
            <h2 className="text-sm sm:text-base font-bold text-amber-950 text-balance">
              Chuẩn bị đón khách ngày mai ({tomorrowYmd})
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`${baseRoutePrefix}/${hotelId}/rooms?businessDate=${tomorrowYmd}`}
              prefetch={true}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-xs font-bold text-amber-950 shadow-2xs transition hover:bg-amber-50 whitespace-nowrap"
            >
              <VsIcon name="meeting_room" className="text-sm text-amber-800" />
              <span>Sơ đồ ngày mai</span>
            </Link>
            <Link
              href={`${baseRoutePrefix}/${hotelId}/rooms?status=processing`}
              prefetch={true}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-xs font-bold text-amber-950 shadow-2xs transition hover:bg-amber-50 whitespace-nowrap"
            >
              <VsIcon name="cleaning_services" className="text-sm text-amber-800" />
              <span>Chờ dọn ({dashboard.rooms.byStatus.processing})</span>
            </Link>
            <Link
              href={`${baseRoutePrefix}/${hotelId}/rooms?flow=reservation`}
              prefetch={true}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-xs font-bold text-amber-950 shadow-2xs transition hover:bg-amber-50 whitespace-nowrap"
            >
              <VsIcon name="edit_calendar" className="text-sm text-amber-800" />
              <span>Đặt phòng tương lai</span>
            </Link>
          </div>
        </div>

        {tomorrowArrivals.length > 0 ? (
          <div className="rounded-lg border border-amber-200/80 bg-white/95 p-3 shadow-2xs">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-950 mb-2 flex items-center gap-1.5">
              <VsIcon name="list_alt" className="text-sm text-amber-800" />
              <span>Đặt trước ngày mai ({tomorrowArrivals.length} lượt)</span>
            </p>
            <div className="space-y-1.5">
              {tomorrowArrivals.slice(0, 5).map((arrival) => (
                <div
                  key={arrival.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-amber-950"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-bold text-amber-950">{arrival.guestDisplayName}</span>
                    <span className="ml-2 text-xs text-amber-800/90">
                      #{arrival.reservationCode} · {arrival.room?.roomNumber ? `P.${arrival.room.roomNumber}` : arrival.roomId ? `P.${arrival.roomId}` : "Chưa gán phòng"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200/70 whitespace-nowrap">
                      Không nhận phòng sớm
                    </span>
                    <Link
                      href={`${baseRoutePrefix}/${hotelId}/rooms?businessDate=${tomorrowYmd}`}
                      className="inline-flex h-8 items-center rounded-lg bg-amber-800 px-3 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-amber-900 whitespace-nowrap"
                    >
                      Xem &amp; Gán phòng
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_0.8fr]">
        <article>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="vs-display text-lg font-bold text-[var(--primary)] text-balance">Yêu cầu của khách <span className="text-[var(--error)]">•</span></h2>
            <Link href={`${baseRoutePrefix}/${hotelId}/requests`} prefetch={true} className="text-xs font-bold text-[var(--primary)] hover:underline whitespace-nowrap">Xem tất cả</Link>
          </div>
          <div className="overflow-hidden rounded-xl bg-white shadow-2xs border border-[var(--outline-variant)]/30">
            <div className="grid grid-cols-[0.5fr_1.5fr_0.8fr_0.8fr] border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]"><span>Phòng</span><span>Loại yêu cầu</span><span>Thời gian</span><span>Trạng thái</span></div>
            {dashboard.attention.slice(0, 5).map((item) => (
              <Link key={`${item.type}-${item.id}`} href={attentionRoute(hotelId, item, baseRoutePrefix)} prefetch={true} className="grid grid-cols-[0.5fr_1.5fr_0.8fr_0.8fr] items-center border-b border-[var(--outline-variant)]/50 px-4 py-2.5 text-sm transition hover:bg-[var(--surface-container-low)]">
                <span className="font-bold text-[var(--primary)]">{item.title.match(/\d+/)?.[0] ?? "-"}</span><span className="font-semibold text-[var(--on-surface)] truncate pr-2">{item.title}</span><span className="text-xs text-[var(--on-surface-variant)] tabular-nums">{formatTime(item.createdAt)}</span><span className="w-fit rounded-full bg-[var(--primary-fixed)] px-2 py-0.5 text-xs font-bold uppercase text-[var(--on-primary-fixed-variant)] whitespace-nowrap">{item.priority}</span>
              </Link>
            ))}
            {dashboard.attention.length === 0 ? <p className="p-5 text-center text-sm text-[var(--on-surface-variant)]">Chưa có yêu cầu cần chú ý.</p> : null}
          </div>
        </article>

        <aside>
          <h2 className="vs-display mb-2.5 text-lg font-bold text-[var(--primary)] text-balance">Nhật ký hoạt động</h2>
          <div className="rounded-xl bg-white p-4 shadow-2xs border border-[var(--outline-variant)]/30">
            <div className="space-y-3.5">
              {dashboard.activities.slice(0, 6).map((activity) => (
                <div key={activity.id} className="relative flex gap-3 border-l border-[var(--outline-variant)] pl-4 last:border-transparent">
                  <span className="absolute -left-2 top-0 flex size-4 items-center justify-center rounded-full bg-[var(--primary)] text-white"><VsIcon name="arrow_forward" className="text-xs" /></span>
                  <div><p className="text-sm font-bold text-[var(--primary)]">{activity.title}</p><p className="mt-0.5 text-xs text-[var(--on-surface-variant)] text-pretty">{activity.description} · {formatTime(activity.createdAt)}</p></div>
                </div>
              ))}
              {dashboard.activities.length === 0 ? <p className="text-sm text-[var(--on-surface-variant)]">Chưa có hoạt động trong ca.</p> : null}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
