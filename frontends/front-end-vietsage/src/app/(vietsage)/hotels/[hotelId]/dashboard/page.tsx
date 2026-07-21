import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { formatMoney } from "@/features/billing/utils/money";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };
export const dynamic = "force-dynamic";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
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

  const roomMetrics = [
    ["Sẵn sàng", dashboard.rooms.byStatus.available, "bg-emerald-100 text-emerald-800"],
    ["Đang ở", dashboard.rooms.byStatus.occupied, "bg-blue-100 text-blue-800"],
    ["Chờ dọn", dashboard.rooms.byStatus.processing, "bg-amber-100 text-amber-800"],
    ["Bảo trì", dashboard.rooms.byStatus.maintenance, "bg-red-100 text-red-800"],
  ] as const;
  const operations = [
    ["Check-in hôm nay", dashboard.stays.todayCheckIns],
    ["Check-out hôm nay", dashboard.stays.todayCheckOuts],
    ["Chờ thanh toán", dashboard.stays.pendingCheckOuts],
    ["Yêu cầu mới", dashboard.requests.byStatus.sent],
  ] as const;

  return (
    <>
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--secondary)]">BÀN ĐIỀU HÀNH LỄ TÂN</p>
          <h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)]">Tình hình vận hành hôm nay</h1>
          <p className="mt-2 text-sm text-[var(--on-surface-variant)]">Cập nhật lúc {formatTime(dashboard.generatedAt)} · Điểm vận hành {dashboard.health.score}/100 ({dashboard.health.title})</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/hotels/${hotelId}/rooms`} className="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white">Mở phòng mới</Link>
          <Link href={`/hotels/${hotelId}/arrivals`} className="rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-3 text-sm font-bold text-[var(--primary)]">Làm thủ tục đến</Link>
          <Link href={`/hotels/${hotelId}/billing`} className="rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-3 text-sm font-bold text-[var(--primary)]">Thanh toán</Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roomMetrics.map(([label, value, tone]) => <article key={label} className="rounded-lg border border-[var(--outline-variant)] bg-white p-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{label}</span><p className="mt-3 text-4xl font-black text-[var(--primary)]">{value}</p><p className="mt-1 text-xs text-[var(--on-surface-variant)]">trên {dashboard.rooms.total} phòng</p></article>)}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {operations.map(([label, value]) => <article key={label} className="rounded-lg border-l-4 border-[var(--secondary)] bg-white p-4"><p className="text-sm font-semibold text-[var(--on-surface-variant)]">{label}</p><p className="mt-2 text-3xl font-black text-[var(--primary)]">{value}</p></article>)}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <article className="overflow-hidden rounded-lg border border-[var(--outline-variant)] bg-white">
          <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-lg font-bold text-[var(--primary)]">Việc cần chú ý</h2><p className="text-xs text-[var(--on-surface-variant)]">Ưu tiên yêu cầu khẩn, checkout và phòng chưa sẵn sàng</p></div><Link href={`/hotels/${hotelId}/requests`} className="text-sm font-bold text-[var(--primary)]">Mở hàng đợi</Link></div>
          <div className="divide-y">
            {dashboard.attention.map((item) => <div key={`${item.type}-${item.id}`} className="flex items-start justify-between gap-4 p-4"><div><p className="font-bold text-[var(--on-surface)]">{item.title}</p><p className="mt-1 text-sm text-[var(--on-surface-variant)]">{item.description}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item.priority === "urgent" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{item.priority}</span></div>)}
            {dashboard.attention.length === 0 ? <p className="p-8 text-center text-sm text-[var(--on-surface-variant)]">Không có việc tồn đọng cần ưu tiên.</p> : null}
          </div>
        </article>

        <aside className="space-y-5">
          <article className="rounded-lg border border-[var(--outline-variant)] bg-[var(--primary)] p-5 text-white">
            <p className="text-xs font-bold uppercase text-white/70">Doanh thu đã thu</p>
            <p className="mt-2 text-3xl font-black">{formatMoney(dashboard.revenue.today, dashboard.revenue.currency)}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4 text-sm"><div><p className="text-white/65">7 ngày</p><p className="mt-1 font-bold">{formatMoney(dashboard.revenue.last7Days, dashboard.revenue.currency)}</p></div><div><p className="text-white/65">Tháng này</p><p className="mt-1 font-bold">{formatMoney(dashboard.revenue.currentMonth, dashboard.revenue.currency)}</p></div></div>
          </article>
          <article className="rounded-lg border border-[var(--outline-variant)] bg-white p-5"><h2 className="font-bold text-[var(--primary)]">SLA yêu cầu</h2><p className="mt-3 text-3xl font-black text-[var(--primary)]">{dashboard.sla.completedWithinSlaPercent == null ? "--" : `${dashboard.sla.completedWithinSlaPercent}%`}</p><p className="mt-1 text-sm text-[var(--on-surface-variant)]">Hoàn tất trong {dashboard.sla.thresholdMinutes} phút</p></article>
        </aside>
      </section>

      <section className="rounded-lg border border-[var(--outline-variant)] bg-white p-5"><h2 className="text-lg font-bold text-[var(--primary)]">Nhật ký hoạt động</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{dashboard.activities.slice(0, 8).map((activity) => <div key={activity.id} className="border-l-2 border-[var(--secondary)] pl-4"><p className="font-semibold">{activity.title ?? activity.type ?? "Cập nhật vận hành"}</p><p className="mt-1 text-xs text-[var(--on-surface-variant)]">{activity.description} · {formatTime(activity.createdAt)}</p></div>)}</div>{dashboard.activities.length === 0 ? <p className="mt-4 text-sm text-[var(--on-surface-variant)]">Chưa có hoạt động trong ca.</p> : null}</section>
    </>
  );
}
