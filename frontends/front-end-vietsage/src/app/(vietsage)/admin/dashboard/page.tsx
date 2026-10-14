import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { billingService } from "@/features/billing/service/billing-service-instance";
import type { PlatformBillingSummary } from "@/features/billing/types/billing-contract";
import { rbacService } from "@/features/rbac/service/rbac-service-instance";
import type { Hotel, TenantOwner } from "@/features/admin/types/admin-contract";
import { resolveWorkspacePersona } from "@/features/workspace/utils/workspace-context";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { VsIcon } from "../../_components/vs-icon";

function formatVnd(value: number | null | undefined): string {
  if (value == null) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateStr));
}

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminDashboardPage({
  searchParams,
}: DashboardPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const rawTab = resolvedSearchParams.tab;
  const tab = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const normalizedTab = typeof tab === "string" ? tab.trim().toLowerCase() : "";

  if (["permissions", "roles"].includes(normalizedTab))
    redirect("/admin/roles");
  if (normalizedTab === "users") redirect("/admin/users");
  if (normalizedTab === "hotels") redirect("/admin/hotels");

  const callbackUrl = "/admin/dashboard" as const;
  const context = await loadServerWorkspaceContext(callbackUrl);
  const persona = resolveWorkspacePersona(context.activeRole.code);
  if (persona === "platform_finance") redirect("/finance/billing");
  if (
    persona === "localmate_manager" ||
    context.activeRole.code.includes("LOCALMATE") ||
    context.activeRole.code.includes("LOCAL_MATE")
  ) {
    redirect("/localmate/guides");
  }
  if (persona !== "platform_admin") notFound();

  const session = await auth();
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  let hotels: Hotel[] = [];
  let totalHotels = 0;
  let tenantOwners: TenantOwner[] = [];
  let totalTenantOwners = 0;
  let rolesCount = 0;
  let billingSummary: PlatformBillingSummary | null = null;

  try {
    const [hotelsRes, tenantOwnersRes, rolesRes, billingRes] =
      await Promise.allSettled([
        authorizedApi("list hotels for admin dashboard", (accessToken) =>
          adminService.listHotels({
            query: { page: 1, limit: 6 },
            accessToken,
          }),
        ),
        authorizedApi("list tenant owners for admin dashboard", (accessToken) =>
          adminService.listTenantOwners({
            query: { page: 1, limit: 6 },
            accessToken,
          }),
        ),
        authorizedApi("list roles for admin dashboard", (accessToken) =>
          rbacService.listRoles(accessToken),
        ),
        authorizedApi(
          "get platform billing summary for admin dashboard",
          (accessToken) =>
            billingService.getPlatformBillingDashboardSummary({ accessToken }),
        ),
      ]);

    if (hotelsRes.status === "fulfilled" && hotelsRes.value) {
      hotels = hotelsRes.value.items ?? [];
      totalHotels = hotelsRes.value.total ?? hotels.length;
    }
    if (tenantOwnersRes.status === "fulfilled" && tenantOwnersRes.value) {
      tenantOwners = tenantOwnersRes.value.items ?? [];
      totalTenantOwners = tenantOwnersRes.value.total ?? tenantOwners.length;
    }
    if (rolesRes.status === "fulfilled" && rolesRes.value) {
      rolesCount = Array.isArray(rolesRes.value) ? rolesRes.value.length : 0;
    }
    if (billingRes.status === "fulfilled" && billingRes.value) {
      billingSummary = billingRes.value;
    }
  } catch {
    // Fallback gracefully if any API fails
  }

  const kpiMetrics = [
    {
      label: "Khách sạn hệ thống",
      value: totalHotels,
      unit: "cơ sở lưu trú",
      icon: "hotel" as const,
      badge: "Đang liên kết",
      linkText: "Xem danh mục",
      href: "/admin/hotels",
    },
    {
      label: "Chủ sở hữu doanh nghiệp",
      value: totalTenantOwners,
      unit: "tài khoản đối tác",
      icon: "domain" as const,
      badge: "Doanh nghiệp",
      linkText: "Quản lý người dùng",
      href: "/admin/users",
    },
    {
      label: "Hợp đồng SaaS kích hoạt",
      value: billingSummary?.activeContracts ?? totalHotels,
      unit: "hợp đồng dịch vụ",
      icon: "receipt_long" as const,
      badge: "Đang hiệu lực",
      linkText: "Chi tiết hợp đồng",
      href: "/admin/billing",
    },
    {
      label: "Tổng cước SaaS phát sinh",
      value: formatVnd(billingSummary?.finalizedAmount ?? 0),
      unit: "lũy kế nền tảng",
      icon: "payments" as const,
      badge: `${billingSummary?.finalizedPeriods ?? 0} kỳ cước`,
      linkText: "Sổ cái tài chính",
      href: "/admin/billing",
    },
    {
      label: "Đã thực thu về quỹ",
      value: formatVnd(billingSummary?.collectedAmount ?? 0),
      unit: "tiền đã thu",
      icon: "account_balance" as const,
      badge:
        billingSummary && billingSummary.finalizedAmount > 0
          ? `${Math.round((billingSummary.collectedAmount / billingSummary.finalizedAmount) * 100)}% đã thu`
          : "Đối soát đầy đủ",
      linkText: "Đối soát thu tiền",
      href: "/admin/billing",
    },
    {
      label: "Công nợ SaaS cần thu",
      value: formatVnd(billingSummary?.outstandingAmount ?? 0),
      unit: "công nợ đối tác",
      icon: "pending_actions" as const,
      badge:
        (billingSummary?.overdueAmount ?? 0) > 0
          ? `${formatVnd(billingSummary?.overdueAmount)} quá hạn`
          : `${billingSummary?.unpaidPeriodCount ?? 0} kỳ chờ thu`,
      linkText: "Đôn đốc công nợ",
      href: "/admin/billing",
    },
  ];

  const managementModules = [
    {
      key: "hotels",
      title: "Danh mục khách sạn",
      description: "Cơ sở lưu trú & phòng nghỉ",
      icon: "hotel" as const,
      href: "/admin/hotels",
      badge: `${totalHotels} cơ sở`,
    },
    {
      key: "users",
      title: "Chủ sở hữu doanh nghiệp",
      description: "Tài khoản đối tác doanh nghiệp",
      icon: "group" as const,
      href: "/admin/users",
      badge: `${totalTenantOwners} tài khoản`,
    },
    {
      key: "roles",
      title: "Vai trò & Phân quyền",
      description: "Vai trò và quyền truy cập",
      icon: "verified_user" as const,
      href: "/admin/permissions",
      badge: `${rolesCount > 0 ? `${rolesCount} vai trò • ` : ""}${context.permissions.length} quyền`,
    },
    {
      key: "marketplace",
      title: "Đối tác dịch vụ",
      description: "Nhà cung cấp ngoại vi",
      icon: "storefront" as const,
      href: "/admin/marketplace",
      badge: "Dịch vụ liên kết",
    },
    {
      key: "billing",
      title: "Phí VietSage SaaS",
      description: "Doanh thu & công nợ SaaS",
      icon: "payments" as const,
      href: "/admin/billing",
      badge: "Thu phí nền tảng",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      {/* 1. Hero banner: 1 compact block only */}
      <header className="rounded-xl border border-[#dfe3e1] bg-white p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-[#17201b] sm:text-2xl">
              Trung tâm quản trị VietSage
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#5f6b63]">
              Điều phối tổng thể cơ sở lưu trú, tài khoản đối tác doanh nghiệp,
              phân quyền truy cập và hạ tầng vận hành.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#5f6b63]">
              <span className="font-semibold text-[#24473d]">
                {context.activeRole.name}
              </span>
              <span>{context.permissions.length} quyền đang hoạt động</span>
              <span className="inline-flex items-center gap-1.5 text-[#166534]">
                <span className="size-2 rounded-full bg-[#166534]" />
                Nền tảng vận hành bình thường
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/admin/hotels"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#24473d] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1a382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d] focus-visible:ring-offset-2"
            >
              <VsIcon name="add" className="text-base" />
              <span>Thêm khách sạn</span>
            </Link>
            <Link
              href="/admin/users"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#dfe3e1] bg-white px-4 py-2 text-sm font-semibold text-[#17201b] transition-colors hover:bg-[#f3f5f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d] focus-visible:ring-offset-2"
            >
              <VsIcon name="person_add" className="text-base text-[#24473d]" />
              <span>Thêm chủ sở hữu</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. KPI grid: 3 columns × 2 rows */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpiMetrics.map((kpi) => (
          <div
            key={kpi.label}
            className="flex flex-col justify-between rounded-xl border border-[#dfe3e1] bg-white p-4 transition-colors hover:border-[#24473d]/35"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#5f6b63]">
                  {kpi.label}
                </span>
                <span className="grid size-9 place-items-center rounded-lg bg-[#eef2f0] text-[#24473d]">
                  <VsIcon name={kpi.icon} className="text-lg" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-[#17201b]">
                  {kpi.value}
                </span>
                <span className="text-xs text-[#5f6b63]">{kpi.unit}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#e7eae8] pt-3 text-xs">
              <span className="text-xs font-medium text-[#5f6b63]">
                {kpi.badge}
              </span>
              <Link
                href={kpi.href}
                className="flex min-h-11 items-center gap-1 font-semibold text-[#24473d] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d]"
              >
                <span>{kpi.linkText}</span>
                <VsIcon name="arrow_forward" className="text-xs" />
              </Link>
            </div>
          </div>
        ))}
      </section>

      {/* 3. Main content: 2-column layout, Hotels + Owners/Tenants */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Left Column: Recent Hotels */}
        <div className="flex flex-col justify-between rounded-xl border border-[#dfe3e1] bg-white p-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#17201b]">
                  Khách sạn trong hệ thống
                </h2>
                <p className="text-xs text-[#5f6b63]">
                  Cơ sở lưu trú kết nối gần nhất.
                </p>
              </div>
              <Link
                href="/admin/hotels"
                className="flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-[#24473d] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d]"
              >
                Xem tất cả ({totalHotels}){" "}
                <VsIcon name="arrow_forward" className="text-xs" />
              </Link>
            </div>

            {hotels.length > 0 ? (
              <div className="divide-y divide-[#e7eae8]">
                {hotels.map((hotel) => (
                  <div
                    key={hotel.id}
                    className="py-2.5 flex items-center justify-between gap-3 min-w-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-[#17201b] truncate">
                          {hotel.name}
                        </span>
                        {hotel.code && (
                          <span className="rounded bg-[#eef2f0] px-1.5 py-0.5 font-mono text-xs font-bold text-[#24473d]">
                            {hotel.code}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#5f6b63] mt-0.5 truncate">
                        {hotel.tenant?.name
                          ? `Doanh nghiệp: ${hotel.tenant.name}`
                          : "Hệ thống độc lập"}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="rounded-full bg-[#f0fdf4] px-2 py-0.5 text-xs font-bold text-[#166534]">
                        {hotel.status === "ACTIVE"
                          ? "Hoạt động"
                          : hotel.status || "Hoạt động"}
                      </span>
                      <Link
                        href={`/hotels/${hotel.id}/dashboard`}
                        className="grid size-11 place-items-center rounded-lg text-[#5f6b63] transition-colors hover:bg-[#eef2f0] hover:text-[#24473d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d]"
                        title="Vào dashboard khách sạn"
                      >
                        <VsIcon name="open_in_new" className="text-sm" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[#24473d]/20 p-5 text-center text-xs text-[#5f6b63]">
                Chưa có khách sạn nào được khởi tạo trên nền tảng.
              </div>
            )}
          </div>

          <div className="mt-3 border-t border-[#e7eae8] pt-3">
            <Link
              href="/admin/hotels"
              className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[#24473d] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d]"
            >
              <span>+ Đăng ký và kết nối khách sạn mới</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Recent Tenant Owners */}
        <div className="flex flex-col justify-between rounded-xl border border-[#dfe3e1] bg-white p-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#17201b]">
                  Chủ sở hữu doanh nghiệp
                </h2>
                <p className="text-xs text-[#5f6b63]">
                  Tài khoản quản trị viên doanh nghiệp.
                </p>
              </div>
              <Link
                href="/admin/users"
                className="flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-[#24473d] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d]"
              >
                Xem tất cả ({totalTenantOwners}){" "}
                <VsIcon name="arrow_forward" className="text-xs" />
              </Link>
            </div>

            {tenantOwners.length > 0 ? (
              <div className="divide-y divide-[#e7eae8]">
                {tenantOwners.map((owner) => (
                  <div
                    key={owner.id}
                    className="py-2.5 flex items-center justify-between gap-3 min-w-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-[#17201b] truncate">
                          {owner.fullName}
                        </span>
                        <span className="rounded bg-[#eef2f0] px-1.5 py-0.5 text-xs font-semibold text-[#5f6b63]">
                          Chủ sở hữu
                        </span>
                      </div>
                      <p className="text-xs text-[#5f6b63] mt-0.5 truncate">
                        {owner.email} • Tổ chức:{" "}
                        {owner.tenant?.name || owner.tenant?.code || "Chưa gán"}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="rounded-full bg-[#f0fdf4] border border-[#bbf7d0] px-2 py-0.5 text-xs font-bold text-[#166534]">
                        Hoạt động
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[#24473d]/20 p-5 text-center text-xs text-[#5f6b63]">
                Chưa có chủ sở hữu nào được tạo trên hệ thống.
              </div>
            )}
          </div>

          <div className="mt-3 border-t border-[#e7eae8] pt-3">
            <Link
              href="/admin/users"
              className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[#24473d] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d]"
            >
              <span>+ Tạo tài khoản chủ sở hữu mới</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Platform administration: 5 compact cards in one row */}
      <section>
        <div className="mb-2.5">
          <h2 className="text-sm font-bold text-[#17201b]">
            Phân hệ quản trị nền tảng
          </h2>
          <p className="text-xs text-[#5f6b63]">
            Truy cập nhanh các phân hệ nghiệp vụ được phân quyền.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {managementModules.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="group flex min-h-40 flex-col justify-between rounded-xl border border-[#dfe3e1] bg-white p-4 transition-colors hover:border-[#24473d]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d] focus-visible:ring-offset-2"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="grid size-9 place-items-center rounded-lg bg-[#eef2f0] text-[#24473d]">
                    <VsIcon name={item.icon} className="text-lg" />
                  </span>
                  <span className="text-xs font-medium text-[#5f6b63]">
                    {item.badge}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-[#17201b]">
                  {item.title}
                </h3>
                <p className="mt-0.5 text-xs text-[#5f6b63] line-clamp-1">
                  {item.description}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[#e7eae8] pt-3 text-xs font-semibold text-[#24473d]">
                <span>Truy cập</span>
                <VsIcon name="arrow_forward" className="text-xs" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. Platform Financial & SaaS Receivables Hub */}
      <section className="rounded-xl border border-[#dfe3e1] bg-white p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-[#eef2f0] text-[#24473d]">
              <VsIcon name="account_balance_wallet" className="text-lg" />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#17201b]">
                Giám sát dòng tiền &amp; Đối soát cước phí SaaS
              </h2>
              <p className="text-xs text-[#5f6b63]">
                Theo dõi các khoản tiền cước nền tảng VietSage từ các cơ sở lưu
                trú và đối tác doanh nghiệp.
              </p>
            </div>
          </div>
          <Link
            href="/admin/billing"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-[#24473d] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1a382f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d] focus-visible:ring-offset-2"
          >
            <VsIcon name="receipt" className="text-sm" />
            <span>Mở sổ cái Billing</span>
          </Link>
        </div>

        {/* 4 financial highlights */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <div className="rounded-lg border border-[#dfe3e1] bg-[#fafbfa] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#5f6b63]">
              Tổng cước đã phát sinh
            </p>
            <p className="mt-1.5 text-xl sm:text-2xl font-extrabold text-[#17201b]">
              {formatVnd(billingSummary?.finalizedAmount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-[#5f6b63]">
              {billingSummary?.finalizedPeriods ?? 0} kỳ cước đã kết chuyển
            </p>
          </div>

          <div className="rounded-lg border border-[#dfe3e1] bg-[#fafbfa] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#5f6b63]">
              Thực thu về quỹ nền tảng
            </p>
            <p className="mt-1.5 text-xl font-bold text-[#17201b] sm:text-2xl">
              {formatVnd(billingSummary?.collectedAmount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-[#5f6b63]">
              {billingSummary && billingSummary.finalizedAmount > 0
                ? `Đạt ${Math.round((billingSummary.collectedAmount / billingSummary.finalizedAmount) * 100)}% tổng cước`
                : "Đã ghi nhận thanh toán"}
            </p>
          </div>

          <div className="rounded-lg border border-[#eadca6] bg-[#fffcf0] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#854d0e]">
              Công nợ chờ thu
            </p>
            <p className="mt-1.5 text-xl sm:text-2xl font-extrabold text-[#854d0e]">
              {formatVnd(billingSummary?.outstandingAmount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-[#854d0e]">
              {billingSummary?.unpaidPeriodCount ?? 0} kỳ chưa thanh toán đầy đủ
            </p>
          </div>

          <div className="rounded-lg border border-[#efc2c2] bg-[#fff7f7] p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#b91c1c]">
              Nợ quá hạn cần đôn đốc
            </p>
            <p className="mt-1.5 text-xl sm:text-2xl font-extrabold text-[#b91c1c]">
              {formatVnd(billingSummary?.overdueAmount ?? 0)}
            </p>
            <p className="mt-1 text-xs text-[#b91c1c]">
              {billingSummary?.overduePeriodCount ?? 0} kỳ đã vượt quá hạn thanh
              toán
            </p>
          </div>
        </div>

        {/* Due / Overdue Periods Table */}
        {billingSummary?.duePeriods && billingSummary.duePeriods.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#17201b]">
                Kỳ cước khách sạn cần thu / Đang đến hạn (
                {billingSummary.duePeriods.length})
              </h3>
              <span className="text-xs text-[#5f6b63]">
                Ưu tiên xử lý kỳ cước quá hạn trước
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-[#dfe3e1]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#dfe3e1] bg-[#f5f7f6] font-semibold uppercase tracking-wider text-[#5f6b63]">
                  <tr>
                    <th className="px-3 py-2">Khách sạn</th>
                    <th className="px-3 py-2">Kỳ cước</th>
                    <th className="px-3 py-2">Hạn trả</th>
                    <th className="px-3 py-2 text-right">Tổng cước</th>
                    <th className="px-3 py-2 text-right">Còn nợ</th>
                    <th className="px-3 py-2 text-center">Trạng thái</th>
                    <th className="px-3 py-2 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e7eae8] bg-white">
                  {billingSummary.duePeriods.slice(0, 6).map((period) => (
                    <tr
                      key={period.id}
                      className="transition-colors hover:bg-[#f7f9f8]"
                    >
                      <td className="px-3 py-2 font-semibold text-[#17201b]">
                        <div>
                          {period.hotel?.name ??
                            `Hợp đồng: ${period.contractId?.slice(0, 8) ?? "-"}`}
                        </div>
                        {period.hotel?.code && (
                          <span className="font-mono text-xs text-[#5f6b63]">
                            {period.hotel.code}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[#5f6b63]">
                        {formatDate(period.periodStart)} –{" "}
                        {formatDate(period.periodEnd)}
                      </td>
                      <td className="px-3 py-2 text-[#5f6b63]">
                        {formatDate(period.dueAt)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-[#17201b]">
                        {formatVnd(period.total)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-[#b91c1c]">
                        {formatVnd(period.outstandingAmount ?? period.total)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {period.isOverdue ? (
                          <span className="rounded-full bg-[#fff7f7] border border-[#efc2c2] px-2 py-0.5 text-xs font-bold text-[#b91c1c]">
                            Quá hạn
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#fffcf0] border border-[#eadca6] px-2 py-0.5 text-xs font-bold text-[#854d0e]">
                            Đến hạn
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Link
                          href="/admin/billing"
                          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[#dfe3e1] px-3 py-2 text-xs font-semibold text-[#24473d] transition-colors hover:bg-[#eef2f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24473d]"
                        >
                          <span>Đối soát</span>
                          <VsIcon name="arrow_forward" className="text-xs" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[#24473d]/20 bg-[#fbfdfb] p-4 text-center text-xs text-[#24473d] font-semibold flex items-center justify-center gap-2">
            <span className="size-2 rounded-full bg-[#166534]" />
            <span>
              Tất cả các cơ sở lưu trú đều đã thanh toán đủ cước phí hoặc chưa
              phát sinh nợ quá hạn.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
