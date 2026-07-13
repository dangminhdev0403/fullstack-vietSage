import Link from "next/link";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { VsIcon } from "../../_components/vs-icon";
import { OwnerShell } from "../_components/owner-shell";
import { AnimatedDashboardNumber } from "./animated-dashboard-number";

export const dynamic = "force-dynamic";

type Dashboard = {
  hotelId: string;
  generatedAt: string;
  rooms: { total: number; occupied: number; occupancyRate: number; byStatus: Record<string, number> };
  stays: { todayCheckIns: number; todayCheckOuts: number; pendingCheckOuts: number; activeStays: number };
  requests: { unprocessed: number; urgentUnprocessed: number | null; byStatus: Record<string, number>; topServices: Array<{ serviceName: string; count: number }> };
  revenue: { available: boolean; currency: string; today: number | null; last7Days: number | null; currentMonth: number | null };
  health: { score: number | null; status: "excellent" | "good" | "warning" | "critical" | "unknown"; title: string; factors: Array<{ type: string; label: string; impact: string; message: string }> };
  attention: Array<{ id: string; type: string; priority: "urgent" | "high" | "normal"; title: string; description: string; createdAt: string; action: { label: string; route: string } }>;
  insights: Array<{ id: string; severity: "info" | "warning" | "critical"; title: string; description: string; metric?: { current: number; previous?: number; changePercent?: number } }>;
  sla: { available: boolean; averageResponseMinutes: number | null; averageCompletionMinutes: number | null; completedWithinSlaPercent: number | null; thresholdMinutes: number };
  activities: Array<{ id: string; type: string; title: string; description: string; createdAt: string }>;
  warnings: string[];
};

function formatVnd(value: number | null | undefined): string {
  if (value == null) return "Chưa đủ dữ liệu";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function healthTone(status: Dashboard["health"]["status"]): string {
  if (status === "excellent" || status === "good") return "border-[#87b59d]/50 bg-[#e9f4ed] text-[#1f5f45]";
  if (status === "critical") return "border-[#d37a68]/50 bg-[#fff0ea] text-[#9b3f2f]";
  return "border-[#e8b363]/60 bg-[#fff7df] text-[#8a5a14]";
}

function severityTone(severity: string): string {
  if (severity === "critical") return "bg-[#9b3f2f] text-white";
  if (severity === "warning") return "bg-[#e8b363] text-[#17201b]";
  return "bg-[#24473d] text-[#fff8e8]";
}

const roomStatusLabels: Record<string, string> = {
  AVAILABLE: "Còn trống",
  OCCUPIED: "Đang có khách",
  PROCESSING: "Đang xử lý",
  MAINTENANCE: "Bảo trì",
  CLEANING: "Đang dọn phòng",
  UNAVAILABLE: "Không khả dụng",
};

const requestStatusLabels: Record<string, string> = {
  CREATED: "Mới tạo",
  SENT: "Đã gửi",
  ACKNOWLEDGED: "Đã tiếp nhận",
  IN_PROGRESS: "Đang xử lý",
  PROCESSING: "Đang xử lý",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  FAILED: "Thất bại",
};

const insightSeverityLabels: Record<string, string> = {
  info: "Thông tin",
  warning: "Cảnh báo",
  critical: "Khẩn cấp",
};

function fallbackStatusLabel(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function roomStatusLabel(status: string): string {
  const normalized = status.trim().toUpperCase();
  return roomStatusLabels[normalized] ?? fallbackStatusLabel(status);
}

function requestStatusLabel(status: string): string {
  const normalized = status.trim().toUpperCase();
  return requestStatusLabels[normalized] ?? fallbackStatusLabel(status);
}

function insightSeverityLabel(severity: string): string {
  const normalized = severity.trim().toLowerCase();
  return insightSeverityLabels[normalized] ?? fallbackStatusLabel(severity);
}

function ownerAttentionRoute(route: string, hotelId: string): string {
  const detailPrefix = `/owner/hotels/${hotelId}/requests/`;
  if (!route.startsWith(detailPrefix)) {
    return route;
  }

  const requestId = route.slice(detailPrefix.length).split(/[?#]/)[0]?.trim();
  if (!requestId) {
    return `/owner/hotels/${hotelId}/requests`;
  }

  return `/owner/hotels/${hotelId}/requests?requestId=${encodeURIComponent(requestId)}`;
}

function StatCard({ label, value, icon, delay = 0 }: { label: string; value: string | number; icon: string; delay?: number }) {
  return (
    <article className="vs-owner-panel vs-owner-reveal rounded-[1.4rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(31,61,53,0.10)] backdrop-blur" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#69746c]">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#17201b] md:text-4xl">
            <AnimatedDashboardNumber value={value} />
          </p>
        </div>
        <span className="vs-owner-icon grid h-11 w-11 place-items-center rounded-2xl bg-[#24473d] text-[#e8b363]">
          <VsIcon name={icon} className="text-[21px]" />
        </span>
      </div>
    </article>
  );
}

function EmptyState({ children }: { children: string }) {
  return <div className="rounded-2xl border border-dashed border-[#cfc4b5] bg-[#f8f1e6]/70 px-4 py-8 text-center text-sm font-semibold text-[#6d756e]">{children}</div>;
}

function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`vs-owner-panel rounded-[1.75rem] border border-white/70 bg-white/80 p-6 shadow-[0_18px_60px_rgba(31,61,53,0.10)] backdrop-blur ${className}`}>{children}</section>;
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="vs-owner-metric rounded-2xl bg-[#f8f1e6] p-4">
      <p className="text-sm font-semibold text-[#69746c]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17201b]">
        <AnimatedDashboardNumber value={value} />
      </p>
    </div>
  );
}

export default async function OwnerDashboardPage() {
  const session = await auth();
  const callbackUrl = "/owner/dashboard" as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  const [sidebarItems, hotelsPage] = await Promise.all([
    resolveDashboardNavigation({
      roles: session?.user.roles ?? [],
      accessToken: session?.accessToken ?? null,
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? null,
      refreshToken: session?.refreshToken ?? null,
      authError: session?.authError ?? null,
    }),
    authorizedApi("list owner hotels", (accessToken) => adminService.listHotels({ query: { page: 1, limit: 100 }, accessToken })),
  ]);

  const hotel = hotelsPage.items.find((item) => item.status !== "DISABLED") ?? hotelsPage.items[0];
  const dashboard = hotel
    ? ((await authorizedApi("get hotel dashboard", (accessToken) =>
        hotelOpsService.getDashboard(hotel.id, { accessToken, accessTokenExpiresAt: session?.accessTokenExpiresAt ?? null }),
      )) as Dashboard)
    : null;

  const kpis = dashboard
    ? [
        { label: "Tổng số phòng", value: dashboard.rooms.total, icon: "hotel" },
        { label: "Đang có khách", value: dashboard.rooms.occupied, icon: "bed" },
        { label: "Công suất phòng", value: `${dashboard.rooms.occupancyRate}%`, icon: "speed" },
        { label: "Yêu cầu chưa xử lý", value: dashboard.requests.unprocessed, icon: "pending_actions" },
        { label: "Yêu cầu khẩn cấp", value: dashboard.requests.urgentUnprocessed ?? "Chưa đủ dữ liệu", icon: "report" },
        { label: "Check-in hôm nay", value: dashboard.stays.todayCheckIns, icon: "login" },
        { label: "Check-out hôm nay", value: dashboard.stays.todayCheckOuts, icon: "logout" },
        { label: "Doanh thu hôm nay", value: dashboard.revenue.available ? formatVnd(dashboard.revenue.today) : "Chưa đủ dữ liệu", icon: "payments" },
      ]
    : [];

  return (
    <OwnerShell activePath={callbackUrl} navItems={sidebarItems}>
      <section className="vs-owner-hero vs-owner-reveal relative overflow-hidden rounded-[2rem] border border-white/70 bg-[#17201b] px-6 py-7 text-[#fff8e8] shadow-[0_24px_80px_rgba(23,32,27,0.24)] md:px-9 md:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(232,179,99,0.35),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.12),transparent_42%)]" />
        <div className="vs-owner-scanline pointer-events-none absolute inset-x-8 top-0 h-px" />
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-[#e8b363]/35 bg-[#e8b363]/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.28em] text-[#e8b363]">Operational dashboard</p>
            <h1 className="vs-display mt-5 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] md:text-7xl">Bức tranh vận hành trong 10 giây.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#d7cbb8] md:text-lg">Tập trung vào sức khỏe vận hành, việc cần xử lý, phòng, yêu cầu và doanh thu thật của khách sạn.</p>
          </div>
          <div className="vs-owner-glass rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-[#d7cbb8] backdrop-blur">
            <p className="font-bold text-[#e8b363]">{hotel?.name ?? "Chưa có khách sạn"}</p>
            <p className="mt-2">Snapshot: {dashboard ? formatTime(dashboard.generatedAt) : "Chưa đủ dữ liệu"}</p>
          </div>
        </div>
      </section>

      {!dashboard ? (
        <EmptyState>Chưa có khách sạn hoặc chưa đủ dữ liệu để hiển thị dashboard.</EmptyState>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{kpis.map((item, index) => <StatCard key={item.label} {...item} delay={80 + index * 45} />)}</section>

          <section className={`rounded-[1.75rem] border p-6 shadow-[0_18px_60px_rgba(31,61,53,0.10)] ${healthTone(dashboard.health.status)}`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.22em]">Sức khỏe vận hành</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{dashboard.health.title}</h2></div>
              <div className="text-left md:text-right"><p className="text-sm font-bold">Điểm vận hành</p><p className="text-5xl font-semibold tracking-[-0.06em]"><AnimatedDashboardNumber value={dashboard.health.score ?? "--"} /></p></div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">{dashboard.health.factors.map((factor) => <div key={factor.type} className="vs-owner-metric rounded-2xl bg-white/60 p-4"><p className="font-bold">{factor.label}</p><p className="mt-2 text-sm opacity-80">{factor.message}</p></div>)}</div>
          </section>

          <SectionCard>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17201b]">Cần xử lý</h2>
            <div className="mt-4 space-y-3">{dashboard.attention.length ? dashboard.attention.map((item) => <div key={`${item.type}-${item.id}`} className="vs-owner-attention grid gap-3 rounded-2xl border border-[#eadfce] bg-[#fffaf0] p-4 md:grid-cols-[1fr_auto] md:items-center"><div><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.priority === "urgent" ? "bg-[#9b3f2f] text-white" : "bg-[#e8b363] text-[#17201b]"}`}>{item.priority === "urgent" ? "Khẩn cấp" : "Cần chú ý"}</span><p className="mt-3 font-bold text-[#17201b]">{item.title}</p><p className="mt-1 text-sm text-[#6d756e]">{item.description}</p></div><Link href={ownerAttentionRoute(item.action.route, hotel.id)} className="vs-touch-button inline-flex items-center justify-center rounded-full bg-[#24473d] px-4 py-2 text-sm font-bold text-[#fff8e8] shadow-[0_10px_24px_rgba(36,71,61,0.18)]">{item.action.label}</Link></div>) : <EmptyState>Không có việc cần xử lý ngay.</EmptyState>}</div>
          </SectionCard>

          <section className="grid gap-4 lg:grid-cols-2">
            <SectionCard><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17201b]">Insight vận hành</h2><div className="mt-4 space-y-3">{dashboard.insights.length ? dashboard.insights.map((item) => <div key={item.id} className="vs-owner-attention rounded-2xl border border-[#eadfce] bg-[#f8f1e6]/70 p-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${severityTone(item.severity)}`}>{insightSeverityLabel(item.severity)}</span><p className="mt-3 font-bold text-[#17201b]">{item.title}</p><p className="mt-1 text-sm text-[#6d756e]">{item.description}</p></div>) : <EmptyState>Chưa có insight vận hành.</EmptyState>}</div></SectionCard>
            <SectionCard><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17201b]">Tình trạng phòng</h2><div className="mt-5 grid grid-cols-2 gap-3">{Object.entries(dashboard.rooms.byStatus).map(([key, value]) => <MetricTile key={key} label={roomStatusLabel(key)} value={value} />)}</div></SectionCard>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <SectionCard><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17201b]">Yêu cầu của khách</h2><div className="mt-5 grid grid-cols-2 gap-3">{Object.entries(dashboard.requests.byStatus).map(([key, value]) => <MetricTile key={key} label={requestStatusLabel(key)} value={value} />)}</div><h3 className="mt-5 font-bold text-[#17201b]">Dịch vụ được yêu cầu nhiều</h3><div className="mt-3 space-y-2">{dashboard.requests.topServices.length ? dashboard.requests.topServices.map((item) => <div key={item.serviceName} className="vs-owner-service-row flex items-center justify-between rounded-xl bg-[#fffaf0] px-4 py-3 text-sm"><span>{item.serviceName}</span><strong><AnimatedDashboardNumber value={item.count} /></strong></div>) : <EmptyState>Chưa có dữ liệu yêu cầu dịch vụ.</EmptyState>}</div></SectionCard>
            {dashboard.sla.available ? <SectionCard><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17201b]">SLA xử lý yêu cầu</h2><div className="mt-5 space-y-3"><StatCard label="Thời gian phản hồi trung bình" value={`${dashboard.sla.averageResponseMinutes ?? "--"} phút`} icon="schedule" /><StatCard label="Thời gian hoàn thành trung bình" value={`${dashboard.sla.averageCompletionMinutes ?? "--"} phút`} icon="task_alt" /><StatCard label="Hoàn thành đúng SLA" value={`${dashboard.sla.completedWithinSlaPercent ?? "--"}%`} icon="verified" /></div></SectionCard> : null}
          </section>

          {dashboard.revenue.available ? <section className="grid gap-4 md:grid-cols-3"><StatCard label="Doanh thu hôm nay" value={formatVnd(dashboard.revenue.today)} icon="payments" /><StatCard label="Doanh thu 7 ngày" value={formatVnd(dashboard.revenue.last7Days)} icon="calendar_view_week" /><StatCard label="Doanh thu tháng này" value={formatVnd(dashboard.revenue.currentMonth)} icon="calendar_month" /></section> : null}

          <SectionCard><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17201b]">Hoạt động gần đây</h2><div className="mt-4 divide-y divide-[#eadfce]">{dashboard.activities.length ? dashboard.activities.map((item) => <div key={item.id} className="vs-owner-activity py-4"><p className="font-bold text-[#17201b]">{item.title}</p><p className="mt-1 text-sm text-[#6d756e]">{item.description}</p><p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-[#bf7836]">{formatTime(item.createdAt)}</p></div>) : <EmptyState>Chưa có hoạt động gần đây.</EmptyState>}</div></SectionCard>
        </>
      )}
    </OwnerShell>
  );
}
