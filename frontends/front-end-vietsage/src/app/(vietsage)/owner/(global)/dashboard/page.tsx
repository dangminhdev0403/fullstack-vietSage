import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { resolveWorkspacePersona } from "@/features/workspace/config/workspace-registry";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { ownerAttentionRoute } from "@/features/hotel-ops/utils/owner-attention-route";
import { readServerSessionTokens } from "@/libs/server-session-tokens";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";

import { VsIcon } from "../../../_components/vs-icon";
import { AnimatedDashboardNumber } from "./animated-dashboard-number";

export const dynamic = "force-dynamic";

type Dashboard = {
  hotelId: string;
  generatedAt: string;
  rooms: {
    total: number;
    occupied: number;
    occupancyRate: number;
    byStatus: Record<string, number>;
  };
  stays: {
    todayCheckIns: number;
    todayCheckOuts: number;
    pendingCheckOuts: number;
    activeStays: number;
  };
  requests: {
    unprocessed: number;
    urgentUnprocessed: number | null;
    byStatus: Record<string, number>;
    topServices: Array<{ serviceName: string; count: number }>;
  };
  revenue: {
    available: boolean;
    currency: string;
    today: number | null;
    last7Days: number | null;
    currentMonth: number | null;
  };
  health: {
    score: number | null;
    status: "excellent" | "good" | "warning" | "critical" | "unknown";
    title: string;
    factors: Array<{
      type: string;
      label: string;
      impact: string;
      message: string;
    }>;
  };
  attention: Array<{
    id: string;
    type: string;
    priority: "urgent" | "high" | "normal";
    title: string;
    description: string;
    createdAt: string;
    action: { label: string; route: string };
  }>;
  insights: Array<{
    id: string;
    severity: "info" | "warning" | "critical";
    title: string;
    description: string;
    metric?: { current: number; previous?: number; changePercent?: number };
  }>;
  sla: {
    available: boolean;
    averageResponseMinutes: number | null;
    averageCompletionMinutes: number | null;
    completedWithinSlaPercent: number | null;
    thresholdMinutes: number;
  };
  activities: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    createdAt: string;
  }>;
  warnings: string[];
};

function formatVnd(value: number | null | undefined): string {
  if (value == null) return "Chưa đủ dữ liệu";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
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

function StatCard({
  label,
  value,
  icon,
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: string;
  delay?: number;
}) {
  return (
    <article
      className="vs-owner-panel vs-owner-reveal rounded-[1.4rem] border border-white/70 bg-white/80 p-5 shadow-[0_16px_40px_rgba(31,61,53,0.10)] backdrop-blur"
      style={{ animationDelay: `${delay}ms` }}
    >
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
  return (
    <div className="rounded-2xl border border-dashed border-[#cfc4b5] bg-[#f8f1e6]/70 px-4 py-8 text-center text-sm font-semibold text-[#6d756e]">
      {children}
    </div>
  );
}

function SectionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`vs-owner-panel rounded-[1.75rem] border border-white/70 bg-white/80 p-6 shadow-[0_18px_60px_rgba(31,61,53,0.10)] backdrop-blur ${className}`}
    >
      {children}
    </section>
  );
}

function MetricTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
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
  const tokens = await readServerSessionTokens();
  const callbackUrl = "/owner/dashboard" as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const workspaceContext = await loadServerWorkspaceContext(
    callbackUrl,
    tokens.accessToken,
  );
  const persona = resolveWorkspacePersona(workspaceContext.activeRole.code);
  if (persona !== "owner") notFound();

  const hotelsPage = await authorizedApi("list owner hotels", (accessToken) =>
    adminService.listHotels({ query: { page: 1, limit: 100 }, accessToken }),
  );

  const hotel =
    hotelsPage.items.find((item) => item.status !== "DISABLED") ??
    hotelsPage.items[0];
  const dashboard = hotel
    ? ((await authorizedApi("get hotel dashboard", (accessToken) =>
        hotelOpsService.getDashboard(hotel.id, {
          accessToken,
          accessTokenExpiresAt:
            session?.accessTokenExpiresAt ?? tokens.accessTokenExpiresAt,
        }),
      )) as Dashboard)
    : null;

  const kpis = dashboard
    ? [
        { label: "Tổng số phòng", value: dashboard.rooms.total, icon: "hotel" },
        {
          label: "Đang có khách",
          value: dashboard.rooms.occupied,
          icon: "bed",
        },
        {
          label: "Công suất phòng",
          value: `${dashboard.rooms.occupancyRate}%`,
          icon: "speed",
        },
        {
          label: "Yêu cầu chưa xử lý",
          value: dashboard.requests.unprocessed,
          icon: "pending_actions",
        },
        {
          label: "Yêu cầu khẩn cấp",
          value: dashboard.requests.urgentUnprocessed ?? "Chưa đủ dữ liệu",
          icon: "report",
        },
        {
          label: "Check-in hôm nay",
          value: dashboard.stays.todayCheckIns,
          icon: "login",
        },
        {
          label: "Check-out hôm nay",
          value: dashboard.stays.todayCheckOuts,
          icon: "logout",
        },
        {
          label: "Doanh thu hôm nay",
          value: dashboard.revenue.available
            ? formatVnd(dashboard.revenue.today)
            : "Chưa đủ dữ liệu",
          icon: "payments",
        },
      ]
    : [];

  return (
    <>
      <section className="vs-owner-hero vs-owner-reveal relative overflow-hidden rounded-3xl border border-white/70 bg-[#17201b] px-6 py-6 text-[#fff8e8] shadow-[0_20px_60px_rgba(23,32,27,0.20)] md:px-8 md:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(232,179,99,0.25),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_42%)]" />
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-[#e8b363]/35 bg-[#e8b363]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#e8b363]">
                Operational Dashboard
              </span>
              <span className="text-xs font-bold text-[#d7cbb8]">
                Snapshot: {dashboard ? formatTime(dashboard.generatedAt) : "Chưa có dữ liệu"}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl text-white">
              Tổng quan vận hành — {hotel?.name ?? "Khách sạn"}
            </h1>
          </div>
        </div>
      </section>

      {!dashboard ? (
        <EmptyState>
          Chưa có khách sạn hoặc chưa đủ dữ liệu để hiển thị dashboard.
        </EmptyState>
      ) : (
        <>
          {/* Executive KPI Cards */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((item, index) => (
              <StatCard key={item.label} {...item} delay={80 + index * 45} />
            ))}
          </section>

          {/* Core Operations Grid: Row 1 - Status Tiles (1:1 Symmetry) */}
          <section className="grid gap-6 lg:grid-cols-2">
            <SectionCard>
              <h2 className="text-xl font-semibold tracking-tight text-[#17201b]">
                Tình trạng phòng
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {Object.entries(dashboard.rooms.byStatus).map(
                  ([key, value]) => (
                    <MetricTile
                      key={key}
                      label={roomStatusLabel(key)}
                      value={value}
                    />
                  ),
                )}
              </div>
            </SectionCard>

            <SectionCard>
              <h2 className="text-xl font-semibold tracking-tight text-[#17201b]">
                Yêu cầu dịch vụ của khách
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {Object.entries(dashboard.requests.byStatus).map(
                  ([key, value]) => (
                    <MetricTile
                      key={key}
                      label={requestStatusLabel(key)}
                      value={value}
                    />
                  ),
                )}
              </div>
            </SectionCard>
          </section>

          {/* Core Operations Grid: Row 2 - Revenue & Top Services (1:1 Symmetry) */}
          <section className="grid gap-6 lg:grid-cols-2">
            {dashboard.revenue.available ? (
              <SectionCard>
                <h2 className="text-xl font-semibold tracking-tight text-[#17201b]">
                  Doanh thu tổng hợp
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MetricTile
                    label="Doanh thu 7 ngày"
                    value={formatVnd(dashboard.revenue.last7Days)}
                  />
                  <MetricTile
                    label="Doanh thu tháng này"
                    value={formatVnd(dashboard.revenue.currentMonth)}
                  />
                </div>
              </SectionCard>
            ) : (
              <SectionCard>
                <h2 className="text-xl font-semibold tracking-tight text-[#17201b]">
                  Doanh thu tổng hợp
                </h2>
                <div className="mt-4">
                  <EmptyState>Chưa đủ dữ liệu doanh thu.</EmptyState>
                </div>
              </SectionCard>
            )}

            <SectionCard>
              <h2 className="text-xl font-semibold tracking-tight text-[#17201b]">
                Top dịch vụ được yêu cầu nhiều
              </h2>
              <div className="mt-4 space-y-2">
                {dashboard.requests.topServices.length ? (
                  dashboard.requests.topServices.map((item) => (
                    <div
                      key={item.serviceName}
                      className="vs-owner-service-row flex items-center justify-between rounded-xl bg-[#fffaf0] px-4 py-2.5 text-sm"
                    >
                      <span className="font-medium">{item.serviceName}</span>
                      <strong className="font-bold text-[#24473d]">
                        <AnimatedDashboardNumber value={item.count} /> yêu cầu
                      </strong>
                    </div>
                  ))
                ) : (
                  <EmptyState>Chưa có dữ liệu dịch vụ.</EmptyState>
                )}
              </div>
            </SectionCard>
          </section>

          {/* Action Needed Card at the Bottom */}
          <SectionCard>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-[#17201b]">
                Cần xử lý ngay ({dashboard.attention.length})
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              {dashboard.attention.length ? (
                dashboard.attention.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="vs-owner-attention grid gap-3 rounded-2xl border border-[#eadfce] bg-[#fffaf0] p-4 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${item.priority === "urgent" ? "bg-[#9b3f2f] text-white" : "bg-[#e8b363] text-[#17201b]"}`}
                      >
                        {item.priority === "urgent" ? "Khẩn cấp" : "Cần chú ý"}
                      </span>
                      <p className="mt-2 text-base font-bold text-[#17201b]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-sm text-[#6d756e]">
                        {item.description}
                      </p>
                    </div>
                    <Link
                      href={ownerAttentionRoute(item.action.route, hotel.id)}
                      className="vs-touch-button inline-flex items-center justify-center rounded-full bg-[#24473d] px-4 py-2 text-sm font-bold text-[#fff8e8] shadow-sm"
                    >
                      {item.action.label}
                    </Link>
                  </div>
                ))
              ) : (
                <EmptyState>Vận hành mượt mà, không có việc cần xử lý ngay.</EmptyState>
              )}
            </div>
          </SectionCard>
        </>
      )}
    </>
  );
}
