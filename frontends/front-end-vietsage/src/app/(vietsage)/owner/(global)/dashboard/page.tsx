import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { resolveWorkspacePersona } from "@/features/workspace/config/workspace-registry";

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

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-[#dcd3c1] bg-[#fffdfa] px-6 py-12 text-center text-sm font-semibold text-[#65726a]">
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
      className={`rounded-[1.75rem] border border-[#e8dfcf] bg-white p-6 sm:p-7 shadow-[0_8px_30px_rgba(23,32,27,0.04)] ${className}`}
    >
      {children}
    </section>
  );
}

type PageProps = {
  searchParams?: Promise<{ hotelId?: string }>;
};

export default async function OwnerDashboardPage({ searchParams }: PageProps) {
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

  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : {};
  const requestedHotelId = resolvedSearchParams.hotelId;
  const hotel =
    (requestedHotelId
      ? workspaceContext.accessibleHotels.find((h) => h.id === requestedHotelId)
      : null) ?? workspaceContext.accessibleHotels[0];

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

  const occupancyPercent = dashboard?.rooms.occupancyRate ?? 0;
  const availableRooms =
    dashboard?.rooms.byStatus?.AVAILABLE ??
    (dashboard ? Math.max(0, dashboard.rooms.total - dashboard.rooms.occupied) : 0);
  const cleaningRooms = dashboard?.rooms.byStatus?.CLEANING ?? 0;
  const maintenanceRooms = dashboard?.rooms.byStatus?.MAINTENANCE ?? 0;

  return (
    <div className="space-y-7">
      {/* Luminous Luxury Resort Hero Banner */}
      <section className="relative overflow-hidden rounded-[2rem] border border-[#e5dcce] bg-gradient-to-br from-[#fffdfa] via-[#fdfbf6] to-[#f5f9f6] p-6 sm:p-8 shadow-[0_12px_40px_rgba(33,87,68,0.05)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(232,179,99,0.18)_0%,transparent_70%)]" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(33,87,68,0.12)_0%,transparent_70%)]" />

        <div className="relative z-10 flex flex-col gap-6">
          {/* Top Meta Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d6e5d8] bg-[#eef6f0] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#1e5842]">
                <span className="h-2 w-2 rounded-full bg-[#2a7a5c] animate-pulse" />
                Không gian điều hành
              </span>
              {hotel ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Đang vận hành
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold text-[#5a6860]">
              {dashboard?.health?.score != null ? (
                <div className="flex items-center gap-1.5 rounded-full border border-[#ead8bf] bg-[#fbf5eb] px-3.5 py-1 text-[#8c6d29]">
                  <span>★</span>
                  <span>Chỉ số vận hành:</span>
                  <span className="font-extrabold text-[#745517]">{dashboard.health.score}/100</span>
                </div>
              ) : null}
              <span className="hidden sm:inline text-[#6d7971]">
                Cập nhật: {dashboard ? formatTime(dashboard.generatedAt) : "Chưa có dữ liệu"}
              </span>
            </div>
          </div>

          {/* Title & Hotel Selector */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#8c6d29]">
                Chủ sở hữu &amp; Ban quản trị
              </p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#17382F] md:text-4xl">
                Tổng quan vận hành — {hotel?.name ?? "Khách sạn"}
              </h1>
              <p className="mt-2 text-sm text-[#5a6860] max-w-2xl leading-relaxed">
                Nắm bắt nhanh hiệu suất phòng, luồng tài chính đối soát, chất lượng phục vụ và các hạng mục cần quyết định tức thời.
              </p>
            </div>

            {/* Hotel Selector Pills if multiple hotels */}
            {workspaceContext.accessibleHotels.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#e2dcd0] bg-white p-1.5 shadow-2xs">
                <span className="px-2.5 text-xs font-bold text-[#65726a]">Khách sạn:</span>
                {workspaceContext.accessibleHotels.map((h) => {
                  const isCurrent = h.id === hotel?.id;
                  return (
                    <Link
                      key={h.id}
                      href={`/owner/dashboard?hotelId=${h.id}`}
                      prefetch={true}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        isCurrent
                          ? "bg-[#215744] text-white shadow-xs"
                          : "text-[#5a6860] hover:bg-[#f4efe5] hover:text-[#17382F]"
                      }`}
                    >
                      {h.name}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Quick Action Navigation Bar */}
          {hotel ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[#eee6d8] pt-4">
              <span className="text-xs font-bold text-[#65726a] mr-1">Điều hướng nhanh:</span>
              <Link
                href={`/owner/hotels/${hotel.id}/rooms`}
                prefetch={true}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#dcd3c1] bg-white px-3.5 py-1.5 text-xs font-bold text-[#215744] shadow-2xs transition-all hover:bg-[#215744] hover:text-white hover:border-[#215744]"
              >
                <VsIcon name="door_front" className="text-[15px]" />
                Sơ đồ phòng
              </Link>
              <Link
                href={`/owner/hotels/${hotel.id}/billing`}
                prefetch={true}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#dcd3c1] bg-white px-3.5 py-1.5 text-xs font-bold text-[#215744] shadow-2xs transition-all hover:bg-[#215744] hover:text-white hover:border-[#215744]"
              >
                <VsIcon name="payments" className="text-[15px]" />
                Tài chính &amp; Đối soát
              </Link>
              <Link
                href={`/owner/hotels/${hotel.id}/services`}
                prefetch={true}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#dcd3c1] bg-white px-3.5 py-1.5 text-xs font-bold text-[#215744] shadow-2xs transition-all hover:bg-[#215744] hover:text-white hover:border-[#215744]"
              >
                <VsIcon name="room_service" className="text-[15px]" />
                Danh mục dịch vụ
              </Link>
              <Link
                href={`/owner/hotels/${hotel.id}/staff`}
                prefetch={true}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#dcd3c1] bg-white px-3.5 py-1.5 text-xs font-bold text-[#215744] shadow-2xs transition-all hover:bg-[#215744] hover:text-white hover:border-[#215744]"
              >
                <VsIcon name="group" className="text-[15px]" />
                Nhân sự
              </Link>
              <Link
                href={`/owner/hotels/${hotel.id}/partners`}
                prefetch={true}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#dcd3c1] bg-white px-3.5 py-1.5 text-xs font-bold text-[#215744] shadow-2xs transition-all hover:bg-[#215744] hover:text-white hover:border-[#215744]"
              >
                <VsIcon name="storefront" className="text-[15px]" />
                Đối tác liên kết
              </Link>
              <Link
                href={`/owner/hotels/${hotel.id}/kbtt`}
                prefetch={true}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#dcd3c1] bg-white px-3.5 py-1.5 text-xs font-bold text-[#215744] shadow-2xs transition-all hover:bg-[#215744] hover:text-white hover:border-[#215744]"
              >
                <VsIcon name="assignment" className="text-[15px]" />
                Khai báo tạm trú
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      {!dashboard || !hotel ? (
        <EmptyState>
          Chưa có khách sạn hoặc chưa đủ dữ liệu để hiển thị dashboard.
        </EmptyState>
      ) : (
        <>
          {/* Decision-Grade Financial Hub - Prominently Displayed for Owners */}
          <SectionCard>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#eee6d8] pb-5">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-widest text-[#8c6d29]">Hiệu quả kinh doanh &amp; Tài chính</span>
                <h2 className="mt-0.5 text-xl sm:text-2xl font-bold tracking-tight text-[#17382F]">
                  Dòng tiền &amp; Doanh thu vận hành
                </h2>
                <p className="mt-1 text-xs text-[#5a6860]">
                  Theo dõi doanh thu phòng, dịch vụ nội bộ và doanh thu dịch vụ đối tác ngoài (Marketplace).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href={`/owner/hotels/${hotel.id}/billing`}
                  prefetch={true}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#dcd3c1] bg-[#fffdfa] px-5 text-sm font-bold text-[#215744] transition-all hover:bg-[#f4efe5] shadow-2xs"
                >
                  Quản lý hóa đơn &amp; phí SaaS
                </Link>
                <Link
                  href={`/owner/hotels/${hotel.id}/partners`}
                  prefetch={true}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#215744] px-5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#184434]"
                >
                  Xem đối soát đối tác
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Doanh thu hôm nay */}
              <div className="rounded-2xl border border-[#e8dfcf] bg-[#fdfbf6] p-5">
                <p className="text-xs font-extrabold uppercase tracking-wider text-[#65726a]">Doanh thu hôm nay</p>
                <p className="mt-2 text-2xl lg:text-3xl font-extrabold tracking-tight text-[#17382F]">
                  {dashboard.revenue.available ? formatVnd(dashboard.revenue.today) : "Chưa đủ dữ liệu"}
                </p>
                <p className="mt-2 text-xs font-semibold text-[#8c6d29]">Ghi nhận phát sinh trong ngày</p>
              </div>

              {/* 7 ngày gần nhất */}
              <div className="rounded-2xl border border-[#e8dfcf] bg-[#fdfbf6] p-5">
                <p className="text-xs font-extrabold uppercase tracking-wider text-[#65726a]">7 ngày gần nhất</p>
                <p className="mt-2 text-2xl lg:text-3xl font-extrabold tracking-tight text-[#17382F]">
                  {dashboard.revenue.available ? formatVnd(dashboard.revenue.last7Days) : "Chưa đủ dữ liệu"}
                </p>
                <p className="mt-2 text-xs font-semibold text-[#5a6860]">Xu hướng tuần hiện tại</p>
              </div>

              {/* Doanh thu tháng này */}
              <div className="rounded-2xl border border-[#e8dfcf] bg-[#fdfbf6] p-5">
                <p className="text-xs font-extrabold uppercase tracking-wider text-[#65726a]">Doanh thu tháng này</p>
                <p className="mt-2 text-2xl lg:text-3xl font-extrabold tracking-tight text-[#17382F]">
                  {dashboard.revenue.available ? formatVnd(dashboard.revenue.currentMonth) : "Chưa đủ dữ liệu"}
                </p>
                <p className="mt-2 text-xs font-semibold text-[#5a6860]">Lũy kế tháng hiện hành</p>
              </div>

              {/* Doanh thu Marketplace lũy kế */}
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-5">
                <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">Doanh thu Marketplace lũy kế</p>
                <p className="mt-2 text-2xl lg:text-3xl font-extrabold tracking-tight text-[#174e38]">
                  {formatVnd(Number(marketplaceRevenue?.grossAmount ?? 0))}
                </p>
                <p className="mt-2 text-xs font-bold text-emerald-800">
                  {marketplaceRevenue?.orderCount ?? 0} đơn ngoài đã hoàn tất
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Top 4 Executive KPI Cards */}
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {/* Card 1: Công suất phòng */}
            <article className="relative overflow-hidden rounded-[1.6rem] border border-[#e8dfcf] bg-white p-5 shadow-[0_4px_20px_rgba(23,32,27,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#65726a]">Công suất phòng</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#17382F] md:text-4xl">
                    <AnimatedDashboardNumber value={`${occupancyPercent}%`} />
                  </p>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#eef6f0] text-[#215744] border border-[#d6e5d8]">
                  <VsIcon name="speed" className="text-[22px]" />
                </span>
              </div>
              <div className="mt-4 space-y-1.5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#f0ebd9]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#215744] to-[#cf9438] transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, occupancyPercent))}%` }}
                  />
                </div>
                <p className="text-xs font-semibold text-[#5a6860]">
                  {dashboard.rooms.occupied} / {dashboard.rooms.total} phòng đang có khách
                </p>
              </div>
            </article>

            {/* Card 2: Phòng đang có khách */}
            <article className="relative overflow-hidden rounded-[1.6rem] border border-[#e8dfcf] bg-white p-5 shadow-[0_4px_20px_rgba(23,32,27,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#65726a]">Phòng đang có khách</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#17382F] md:text-4xl">
                    <AnimatedDashboardNumber value={`${dashboard.rooms.occupied}/${dashboard.rooms.total}`} />
                  </p>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fbf5eb] text-[#8c6d29] border border-[#ecdcc3]">
                  <VsIcon name="bed" className="text-[22px]" />
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs font-semibold text-[#5a6860]">
                <span className="text-emerald-800 font-bold">{availableRooms} phòng trống</span>
                <span className="text-[#8c6d29] font-bold">{cleaningRooms} đang dọn</span>
              </div>
            </article>

            {/* Card 3: Lượt đến / rời hôm nay */}
            <article className="relative overflow-hidden rounded-[1.6rem] border border-[#e8dfcf] bg-white p-5 shadow-[0_4px_20px_rgba(23,32,27,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#65726a]">Lượt đến / rời hôm nay</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#17382F] md:text-4xl">
                    <AnimatedDashboardNumber value={`${dashboard.stays.todayCheckIns}/${dashboard.stays.todayCheckOuts}`} />
                  </p>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#eef3f6] text-[#24526b] border border-[#d2e2eb]">
                  <VsIcon name="hotel" className="text-[22px]" />
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs font-semibold text-[#5a6860]">
                <span>{dashboard.stays.activeStays} khách đang ở</span>
                {dashboard.stays.pendingCheckOuts > 0 ? (
                  <span className="text-[#9b3f2f] font-bold">{dashboard.stays.pendingCheckOuts} chờ check-out</span>
                ) : (
                  <span className="text-emerald-700 font-bold">Đúng giờ</span>
                )}
              </div>
            </article>

            {/* Card 4: Yêu cầu cần xử lý */}
            <article className="relative overflow-hidden rounded-[1.6rem] border border-[#e8dfcf] bg-white p-5 shadow-[0_4px_20px_rgba(23,32,27,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#65726a]">Yêu cầu cần xử lý</p>
                  <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#17382F] md:text-4xl">
                    <AnimatedDashboardNumber value={dashboard.requests.unprocessed} />
                  </p>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fef5ec] text-[#b86b24] border border-[#f5dcbe]">
                  <VsIcon name="pending_actions" className="text-[22px]" />
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs font-semibold">
                {dashboard.requests.urgentUnprocessed && dashboard.requests.urgentUnprocessed > 0 ? (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-bold text-red-800">
                    {dashboard.requests.urgentUnprocessed} khẩn cấp
                  </span>
                ) : (
                  <span className="text-emerald-700 font-bold">Xử lý ổn định</span>
                )}
                <span className="text-[#5a6860]">
                  SLA: {dashboard.sla?.completedWithinSlaPercent != null ? `${dashboard.sla.completedWithinSlaPercent}%` : "Theo dõi"}
                </span>
              </div>
            </article>
          </section>

          {/* Operational Health & Service Performance Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Phân bổ phòng thực tế */}
            <SectionCard>
              <div className="flex items-center justify-between border-b border-[#eee6d8] pb-3.5">
                <div>
                  <h3 className="text-lg font-bold text-[#17382F]">Phân bổ phòng thực tế</h3>
                  <p className="text-xs text-[#5a6860]">Hiện trạng phòng vận hành trên toàn bộ cơ sở</p>
                </div>
                <Link
                  href={`/owner/hotels/${hotel.id}/rooms`}
                  prefetch={true}
                  className="text-xs font-bold text-[#215744] hover:underline"
                >
                  Xem sơ đồ &rarr;
                </Link>
              </div>

              {/* Multi-segment distribution bar */}
              <div className="mt-5 space-y-2">
                <div className="h-3.5 w-full overflow-hidden rounded-full bg-[#f0ebd9] flex">
                  {dashboard.rooms.total > 0 ? (
                    <>
                      <div
                        className="h-full bg-[#215744]"
                        style={{ width: `${(dashboard.rooms.occupied / dashboard.rooms.total) * 100}%` }}
                        title={`Có khách: ${dashboard.rooms.occupied}`}
                      />
                      <div
                        className="h-full bg-emerald-400"
                        style={{ width: `${(availableRooms / dashboard.rooms.total) * 100}%` }}
                        title={`Sẵn sàng: ${availableRooms}`}
                      />
                      <div
                        className="h-full bg-[#cf9438]"
                        style={{ width: `${(cleaningRooms / dashboard.rooms.total) * 100}%` }}
                        title={`Đang dọn: ${cleaningRooms}`}
                      />
                      <div
                        className="h-full bg-[#a84435]"
                        style={{ width: `${(maintenanceRooms / dashboard.rooms.total) * 100}%` }}
                        title={`Bảo trì: ${maintenanceRooms}`}
                      />
                    </>
                  ) : null}
                </div>

                {/* Legend list */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs font-semibold text-[#46534b]">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#215744]" />
                    <span>Có khách: {dashboard.rooms.occupied}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <span>Sẵn sàng: {availableRooms}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#cf9438]" />
                    <span>Đang dọn: {cleaningRooms}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#a84435]" />
                    <span>Bảo trì: {maintenanceRooms}</span>
                  </div>
                </div>
              </div>

              {/* Health Factors summary */}
              {dashboard.health?.factors?.length ? (
                <div className="mt-5 rounded-2xl border border-[#e8dfcf] bg-[#fdfbf6] p-4 space-y-2">
                  <p className="text-xs font-bold text-[#17382F] flex items-center gap-1.5">
                    <span className="text-[#8c6d29]">✦</span>
                    Chỉ số chất lượng: {dashboard.health.title} {dashboard.health.score != null ? `(${dashboard.health.score}/100)` : ""}
                  </p>
                  <div className="space-y-1.5 text-xs text-[#5a6860]">
                    {dashboard.health.factors.slice(0, 2).map((factor, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-700 font-bold">•</span>
                        <span>{factor.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </SectionCard>

            {/* Hiệu suất phục vụ & Dịch vụ nổi bật */}
            <SectionCard>
              <div className="flex items-center justify-between border-b border-[#eee6d8] pb-3.5">
                <div>
                  <h3 className="text-lg font-bold text-[#17382F]">Hiệu suất dịch vụ &amp; SLA</h3>
                  <p className="text-xs text-[#5a6860]">Tốc độ phản hồi và các dịch vụ được gọi nhiều nhất</p>
                </div>
                <Link
                  href={`/owner/hotels/${hotel.id}/services`}
                  prefetch={true}
                  className="text-xs font-bold text-[#215744] hover:underline"
                >
                  Menu dịch vụ &rarr;
                </Link>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-[#e8dfcf] bg-[#fdfbf6] p-3.5 text-center">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#65726a]">Phản hồi TB</p>
                  <p className="mt-1 text-xl font-bold text-[#17382F]">
                    {dashboard.sla?.averageResponseMinutes != null ? `${dashboard.sla.averageResponseMinutes} phút` : "--"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#e8dfcf] bg-[#fdfbf6] p-3.5 text-center">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#65726a]">Hoàn tất TB</p>
                  <p className="mt-1 text-xl font-bold text-[#17382F]">
                    {dashboard.sla?.averageCompletionMinutes != null ? `${dashboard.sla.averageCompletionMinutes} phút` : "--"}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-center">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900">Đúng SLA</p>
                  <p className="mt-1 text-xl font-bold text-[#174e38]">
                    {dashboard.sla?.completedWithinSlaPercent != null ? `${dashboard.sla.completedWithinSlaPercent}%` : "--"}
                  </p>
                </div>
              </div>

              {/* Dịch vụ nổi bật list */}
              <div className="mt-5 space-y-2">
                <p className="text-xs font-bold text-[#17382F]">Dịch vụ phát sinh gần đây:</p>
                {dashboard.requests.topServices?.length ? (
                  <div className="space-y-2">
                    {dashboard.requests.topServices.slice(0, 3).map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl border border-[#eee6d8] bg-white px-3.5 py-2 text-xs font-semibold"
                      >
                        <span className="text-[#17382F]">{item.serviceName}</span>
                        <span className="rounded-full bg-[#f4ede0] px-2.5 py-0.5 text-[#8c6d29] font-bold">
                          {item.count} lượt
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#dcd3c1] p-3 text-center text-xs font-medium text-[#65726a]">
                    Chưa ghi nhận yêu cầu phát sinh mới trong ca trực.
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Executive Attention Center */}
          <SectionCard>
            <div className="flex items-center justify-between border-b border-[#eee6d8] pb-3.5">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight text-[#17382F]">
                  Cần chú ý ({dashboard.attention.length})
                </h2>
                {dashboard.attention.length > 0 ? (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
                    Cần phê duyệt / can thiệp
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {dashboard.attention.length ? (
                dashboard.attention.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="grid gap-4 rounded-2xl border border-[#ebdcc8] bg-[#fffaf2] p-4 sm:p-5 md:grid-cols-[1fr_auto] md:items-center shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                            item.priority === "urgent"
                              ? "bg-[#a84435] text-white"
                              : "bg-[#e8b363] text-[#17382F]"
                          }`}
                        >
                          {item.priority === "urgent" ? "Khẩn cấp" : "Cần chú ý"}
                        </span>
                        <span className="text-xs text-[#65726a]">
                          {formatTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-base font-bold text-[#17382F]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-sm text-[#5a6860] leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                    <Link
                      href={ownerAttentionRoute(item.action.route, hotel.id)}
                      prefetch={true}
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#215744] px-5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#184434]"
                    >
                      {item.action.label || "Xem chi tiết"}
                    </Link>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 text-center text-sm font-semibold text-emerald-900 flex flex-col items-center gap-2">
                  <span className="text-2xl">✨</span>
                  <span>Mọi hoạt động phòng và dịch vụ đang diễn ra ổn định. Không có cảnh báo tồn đọng.</span>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Operational Insights (if any) */}
          {dashboard.insights?.length ? (
            <SectionCard>
              <h3 className="text-lg font-bold text-[#17382F] mb-3 flex items-center gap-2">
                <span>💡</span> Gợi ý vận hành thông minh
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {dashboard.insights.map((insight) => (
                  <div
                    key={insight.id}
                    className="rounded-2xl border border-[#e8dfcf] bg-[#fdfbf6] p-4 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#8c6d29] uppercase tracking-wider">
                        {insight.title}
                      </span>
                      {insight.metric?.changePercent != null ? (
                        <span className="text-xs font-bold text-emerald-700">
                          +{insight.metric.changePercent}%
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold text-[#17382F] leading-relaxed">
                      {insight.description}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
