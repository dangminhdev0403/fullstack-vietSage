import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { formatMoney } from "@/features/billing/utils/money";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };
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

function attentionRoute(hotelId: string, item: { type: string; id: string; action: { route: string } }): string {
  if (item.type.includes("request")) return `/hotels/${hotelId}/requests?requestId=${encodeURIComponent(item.id)}`;
  if (item.type.includes("checkout")) return `/hotels/${hotelId}/billing`;
  if (item.type.includes("room")) return `/hotels/${hotelId}/rooms`;
  if (item.action.route.startsWith(`/hotels/${hotelId}/`)) return item.action.route;
  return `/hotels/${hotelId}/dashboard`;
}

export default async function StaffHotelDashboardPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/dashboard` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  if (!canUseHotelId(context, hotelId) || !context.permissions.includes("hotel.dashboard.view")) notFound();

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const dashboard = await authorizedApi("load staff hotel dashboard", (accessToken) =>
    hotelOpsService.getDashboard(hotelId, { accessToken }),
  );

  const roomCards = [
    { label: "Đang ở", value: dashboard.rooms.byStatus.occupied, icon: "hotel", tone: "text-[var(--primary)]", progress: dashboard.rooms.occupancyRate },
    { label: "Sẵn sàng", value: dashboard.rooms.byStatus.available, icon: "check_circle", tone: "text-[var(--secondary)]", progress: dashboard.rooms.total ? (dashboard.rooms.byStatus.available / dashboard.rooms.total) * 100 : 0 },
    { label: "Khách đến hôm nay", value: dashboard.stays.todayCheckIns, icon: "event_available", tone: "text-[var(--on-tertiary-container)]", progress: undefined },
    { label: "Đang dọn", value: dashboard.rooms.byStatus.processing, icon: "cleaning_services", tone: "text-[var(--primary)]", progress: undefined },
    { label: "Bảo trì", value: dashboard.rooms.byStatus.maintenance, icon: "build", tone: "text-[var(--error)]", progress: undefined },
  ] as const;

  const operations = [
    { label: "Nhận phòng", value: dashboard.stays.todayCheckIns, icon: "login", tone: "border-[var(--primary)]", iconTone: "bg-[var(--primary-fixed)] text-[var(--on-primary-fixed)]" },
    { label: "Trả phòng", value: dashboard.stays.todayCheckOuts, icon: "logout", tone: "border-[var(--secondary)]", iconTone: "bg-[var(--secondary-fixed)] text-[var(--on-secondary-fixed)]" },
    { label: "Thanh toán chờ", value: dashboard.stays.pendingCheckOuts, icon: "payments", tone: "border-[var(--error)]", iconTone: "bg-[var(--error-container)] text-[var(--on-error-container)]" },
    { label: "Yêu cầu mới", value: dashboard.requests.byStatus.sent, icon: "notifications_active", tone: "border-[var(--primary-fixed-dim)]", iconTone: "bg-[var(--surface-container-highest)] text-[var(--primary)]" },
  ] as const;

  return (
    <main className="space-y-8 bg-[var(--surface)]">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="vs-display text-4xl font-bold text-[var(--primary)]">Dashboard Tiếp Tân</h1>
          <p className="mt-2 text-base italic text-[var(--on-surface-variant)]">Kính chào Quý Quản lý. Chúc một ngày làm việc hiệu quả.</p>
        </div>
        <div className="text-left md:text-right">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--primary)]/60">Ngày hôm nay</p>
          <p className="vs-display mt-1 text-xl font-semibold text-[var(--primary)]">{formatTime(dashboard.generatedAt)}</p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {roomCards.map((card) => (
          <article key={card.label} className="group flex min-h-40 flex-col justify-between rounded-xl border border-[var(--outline-variant)]/30 bg-[var(--surface-container-low)] p-5 transition hover:-translate-y-1 hover:shadow-lg">
            <div className="flex items-start justify-between">
              <VsIcon name={card.icon} className={`text-3xl ${card.tone}`} />
              {card.progress !== undefined ? (
                <span className="relative flex size-12 items-center justify-center rounded-full border-4 border-[var(--outline-variant)]/25 text-xs font-semibold text-[var(--on-surface-variant)]">
                  <span className={`absolute inset-[-4px] rounded-full border-4 border-transparent border-t-current ${card.tone}`} style={{ transform: `rotate(${percent(card.progress) * 3.6 - 45}deg)` }} />
                  {percent(card.progress)}%
                </span>
              ) : null}
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">{card.label}</p>
              <p className={`vs-display mt-1 text-4xl font-bold ${card.tone}`}>{String(card.value).padStart(2, "0")}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {operations.map((operation) => (
          <article key={operation.label} className={`flex items-center gap-4 rounded-xl border-l-4 bg-white p-5 shadow-sm ${operation.tone}`}>
            <span className={`flex size-12 items-center justify-center rounded-lg ${operation.iconTone}`}><VsIcon name={operation.icon} className="text-2xl" /></span>
            <div>
              <p className="text-sm font-semibold text-[var(--on-surface-variant)]">{operation.label}</p>
              <p className="vs-display mt-1 text-2xl font-semibold text-[var(--primary)]">{String(operation.value).padStart(2, "0")}</p>
            </div>
          </article>
        ))}
      </section>

      <section>
        <h2 className="vs-display mb-4 text-2xl font-semibold text-[var(--primary)]">Thao tác nhanh</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link href={`/hotels/${hotelId}/rooms?flow=check-in`} className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl bg-[var(--primary)] p-5 text-center font-bold text-white shadow-lg transition hover:-translate-y-1">
            <VsIcon name="person_add" className="text-4xl" /><span className="text-sm tracking-[0.08em]">LÀM THỦ TỤC ĐẾN</span>
          </Link>
          <Link href={`/hotels/${hotelId}/rooms?flow=reservation`} className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl bg-[var(--secondary)] p-5 text-center font-bold text-white shadow-lg transition hover:-translate-y-1">
            <VsIcon name="calendar_month" className="text-4xl" /><span className="text-sm tracking-[0.08em]">ĐẶT PHÒNG NHANH</span>
          </Link>
          <Link href={`/hotels/${hotelId}/billing`} className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-[var(--outline-variant)] bg-white p-5 text-center font-bold text-[var(--primary)] transition hover:bg-[var(--primary-fixed)]">
            <VsIcon name="logout" className="text-4xl" /><span className="text-sm tracking-[0.08em]">LÀM THỦ TỤC ĐI</span>
          </Link>
          <Link href={`/hotels/${hotelId}/rooms`} className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-[var(--outline-variant)] bg-white p-5 text-center font-bold text-[var(--primary)] transition hover:bg-[var(--primary-fixed)]">
            <VsIcon name="key" className="text-4xl" /><span className="text-sm tracking-[0.08em]">MỞ PHÒNG MỚI</span>
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
        <article>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="vs-display text-2xl font-semibold text-[var(--primary)]">Yêu cầu của Khách <span className="text-[var(--error)]">•</span></h2>
            <Link href={`/hotels/${hotelId}/requests`} className="text-sm font-bold text-[var(--primary)]">Xem tất cả</Link>
          </div>
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="grid grid-cols-[0.5fr_1.5fr_0.8fr_0.8fr] border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-5 py-4 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]"><span>Phòng</span><span>Loại yêu cầu</span><span>Thời gian</span><span>Trạng thái</span></div>
            {dashboard.attention.slice(0, 5).map((item) => (
              <Link key={`${item.type}-${item.id}`} href={attentionRoute(hotelId, item)} className="grid grid-cols-[0.5fr_1.5fr_0.8fr_0.8fr] items-center border-b border-[var(--outline-variant)]/50 px-5 py-4 text-sm transition hover:bg-[var(--surface-container-low)]">
                <span className="font-bold text-[var(--primary)]">{item.title.match(/\d+/)?.[0] ?? "-"}</span><span className="font-semibold text-[var(--on-surface)]">{item.title}</span><span className="text-sm text-[var(--on-surface-variant)]">{formatTime(item.createdAt)}</span><span className="w-fit rounded-full bg-[var(--primary-fixed)] px-2.5 py-1 text-xs font-bold uppercase text-[var(--on-primary-fixed-variant)]">{item.priority}</span>
              </Link>
            ))}
            {dashboard.attention.length === 0 ? <p className="p-8 text-center text-sm text-[var(--on-surface-variant)]">Chưa có yêu cầu cần chú ý.</p> : null}
          </div>
        </article>

        <aside>
          <h2 className="vs-display mb-4 text-2xl font-semibold text-[var(--primary)]">Nhật ký hoạt động</h2>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="space-y-5">
              {dashboard.activities.slice(0, 6).map((activity) => (
                <div key={activity.id} className="relative flex gap-3 border-l border-[var(--outline-variant)] pl-5 last:border-transparent">
                  <span className="absolute -left-2 top-0 flex size-4 items-center justify-center rounded-full bg-[var(--primary)] text-white"><VsIcon name="arrow_forward" className="text-[10px]" /></span>
                  <div><p className="text-sm font-bold text-[var(--primary)]">{activity.title}</p><p className="mt-1 text-sm text-[var(--on-surface-variant)]">{activity.description} · {formatTime(activity.createdAt)}</p></div>
                </div>
              ))}
              {dashboard.activities.length === 0 ? <p className="text-sm text-[var(--on-surface-variant)]">Chưa có hoạt động trong ca.</p> : null}
            </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl bg-[var(--primary)] p-5 text-white"><p className="text-sm font-bold uppercase tracking-[0.12em] text-white/70">Doanh thu đã thu</p><p className="mt-2 text-3xl font-bold">{formatMoney(dashboard.revenue.today, dashboard.revenue.currency)}</p><p className="mt-2 text-sm text-white/70">7 ngày: {formatMoney(dashboard.revenue.last7Days, dashboard.revenue.currency)}</p></article>
        <article className="rounded-xl border border-[var(--outline-variant)] bg-white p-5"><p className="text-sm font-bold text-[var(--primary)]">SLA yêu cầu</p><p className="mt-2 text-3xl font-bold text-[var(--primary)]">{dashboard.sla.completedWithinSlaPercent == null ? "--" : `${dashboard.sla.completedWithinSlaPercent}%`}</p><p className="mt-1 text-sm text-[var(--on-surface-variant)]">Hoàn tất trong {dashboard.sla.thresholdMinutes} phút</p></article>
        <article className="rounded-xl border border-[var(--outline-variant)] bg-white p-5"><p className="text-sm font-bold text-[var(--primary)]">Tình trạng vận hành</p><p className="mt-2 text-3xl font-bold text-[var(--secondary)]">{dashboard.health.score}/100</p><p className="mt-1 text-sm text-[var(--on-surface-variant)]">{dashboard.health.title}</p></article>
      </section>
    </main>
  );
}
