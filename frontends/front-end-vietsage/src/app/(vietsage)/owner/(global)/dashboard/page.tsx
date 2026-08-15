import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { resolveWorkspacePersona } from "@/features/workspace/config/workspace-registry";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { ownerAttentionRoute } from "@/features/hotel-ops/utils/owner-attention-route";
import { servicePortalClient } from "@/features/service-portal/service-client";
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

type MarketplaceRevenue = {
  grossAmount: string | number;
  orderCount: number;
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
  const marketplaceRevenue = hotel
    ? ((await authorizedApi("get owner marketplace revenue", (accessToken) =>
        servicePortalClient.hotelMarketplaceRevenue(accessToken!, hotel.id),
      )) as MarketplaceRevenue)
    : null;

  const kpis = dashboard
    ? [
        {
          label: "Công suất phòng",
          value: `${dashboard.rooms.occupancyRate}%`,
          icon: "speed",
        },
        {
          label: "Phòng đang có khách",
          value: `${dashboard.rooms.occupied}/${dashboard.rooms.total}`,
          icon: "bed",
        },
        {
          label: "Lượt đến / rời hôm nay",
          value: `${dashboard.stays.todayCheckIns}/${dashboard.stays.todayCheckOuts}`,
          icon: "hotel",
        },
        {
          label: "Yêu cầu cần xử lý",
          value: dashboard.requests.unprocessed,
          icon: "pending_actions",
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

          <SectionCard>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#69746c]">Tài chính vận hành</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#17201b]">
                  Doanh thu cần theo dõi
                </h2>
              </div>
              <Link
                href={`/owner/hotels/${hotel.id}/partners`}
                className="vs-touch-button inline-flex min-h-11 items-center justify-center rounded-full bg-[#24473d] px-5 text-sm font-bold text-[#fff8e8] shadow-sm"
              >
                Xem đối soát đối tác
              </Link>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-[#f8f1e6] p-5">
                <p className="text-sm font-semibold text-[#69746c]">Doanh thu hôm nay</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17201b]">
                  {dashboard.revenue.available ? formatVnd(dashboard.revenue.today) : "Chưa đủ dữ liệu"}
                </p>
              </div>
              <div className="rounded-2xl bg-[#f8f1e6] p-5">
                <p className="text-sm font-semibold text-[#69746c]">Doanh thu tháng này</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17201b]">
                  {dashboard.revenue.available ? formatVnd(dashboard.revenue.currentMonth) : "Chưa đủ dữ liệu"}
                </p>
              </div>
              <div className="rounded-2xl bg-[#eef5ef] p-5">
                <p className="text-sm font-semibold text-[#69746c]">Doanh thu Marketplace lũy kế</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#24473d]">
                  {formatVnd(Number(marketplaceRevenue?.grossAmount ?? 0))}
                </p>
                <p className="mt-2 text-xs font-semibold text-[#69746c]">
                  {marketplaceRevenue?.orderCount ?? 0} đơn ngoài đã hoàn tất
                </p>
              </div>
            </div>
          </SectionCard>

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
