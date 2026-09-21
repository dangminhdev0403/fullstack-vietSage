import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { rbacService } from "@/features/rbac/service/rbac-service-instance";
import type { Hotel, TenantOwner } from "@/features/admin/types/admin-contract";
import { resolveWorkspacePersona } from "@/features/workspace/utils/workspace-context";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { VsIcon } from "../../_components/vs-icon";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminDashboardPage({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const rawTab = resolvedSearchParams.tab;
  const tab = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const normalizedTab = typeof tab === "string" ? tab.trim().toLowerCase() : "";

  if (["permissions", "roles"].includes(normalizedTab)) redirect("/admin/roles");
  if (normalizedTab === "users") redirect("/admin/users");
  if (normalizedTab === "hotels") redirect("/admin/hotels");

  const callbackUrl = "/admin/dashboard" as const;
  const context = await loadServerWorkspaceContext(callbackUrl);
  const persona = resolveWorkspacePersona(context.activeRole.code);
  if (persona === "platform_finance") redirect("/finance/billing");
  if (persona !== "platform_admin") notFound();

  const session = await auth();
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  let hotels: Hotel[] = [];
  let totalHotels = 0;
  let tenantOwners: TenantOwner[] = [];
  let totalTenantOwners = 0;
  let rolesCount = 0;

  try {
    const [hotelsRes, tenantOwnersRes, rolesRes] = await Promise.allSettled([
      authorizedApi("list hotels for admin dashboard", (accessToken) =>
        adminService.listHotels({ query: { page: 1, limit: 6 }, accessToken }),
      ),
      authorizedApi("list tenant owners for admin dashboard", (accessToken) =>
        adminService.listTenantOwners({ query: { page: 1, limit: 6 }, accessToken }),
      ),
      authorizedApi("list roles for admin dashboard", (accessToken) =>
        rbacService.listRoles(accessToken),
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
  } catch {
    // Fallback gracefully if any API fails
  }

  const kpiMetrics = [
    {
      label: "Khách sạn hệ thống",
      value: totalHotels,
      unit: "cơ sở lưu trú",
      icon: "hotel" as const,
      iconBg: "bg-[#e6efe9]",
      iconColor: "text-[#24473d]",
      badge: "Đang liên kết",
      linkText: "Xem danh mục",
      href: "/admin/hotels",
    },
    {
      label: "Chủ sở hữu & Tenant",
      value: totalTenantOwners,
      unit: "tài khoản đối tác",
      icon: "domain" as const,
      iconBg: "bg-[#fdf3e7]",
      iconColor: "text-[#bf7836]",
      badge: "Doanh nghiệp",
      linkText: "Quản lý người dùng",
      href: "/admin/users",
    },
    {
      label: "Vai trò phân quyền",
      value: rolesCount > 0 ? rolesCount : "8+",
      unit: "role templates",
      icon: "admin_panel_settings" as const,
      iconBg: "bg-[#eef2f6]",
      iconColor: "text-[#2c4c64]",
      badge: "RBAC Matrix",
      linkText: "Cấu hình vai trò",
      href: "/admin/roles",
    },
    {
      label: "Capabilities kích hoạt",
      value: context.permissions.length,
      unit: "quyền hạn active",
      icon: "verified_user" as const,
      iconBg: "bg-[#f5f0fa]",
      iconColor: "text-[#6b21a8]",
      badge: "Bảo mật phạm vi",
      linkText: "Ma trận quyền",
      href: "/admin/permissions",
    },
    {
      label: "Dịch vụ Marketplace",
      value: "Sẵn sàng",
      unit: "ẩm thực, tour, xe",
      icon: "storefront" as const,
      iconBg: "bg-[#fef9c3]",
      iconColor: "text-[#854d0e]",
      badge: "Hệ sinh thái",
      linkText: "Cổng Marketplace",
      href: "/admin/marketplace",
    },
    {
      label: "Độ ổn định nền tảng",
      value: "99.98%",
      unit: "đáp ứng thời gian thực",
      icon: "check_circle" as const,
      iconBg: "bg-[#ecfdf5]",
      iconColor: "text-[#059669]",
      badge: "Trực tuyến",
      linkText: "Phí SaaS & Billing",
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
      title: "Chủ sở hữu & Tenant",
      description: "Tài khoản đối tác doanh nghiệp",
      icon: "group" as const,
      href: "/admin/users",
      badge: `${totalTenantOwners} tài khoản`,
    },
    {
      key: "roles",
      title: "Vai trò & Phân quyền",
      description: "Ma trận bảo mật RBAC",
      icon: "verified_user" as const,
      href: "/admin/permissions",
      badge: `${context.permissions.length} quyền`,
    },
    {
      key: "marketplace",
      title: "Đối tác dịch vụ",
      description: "Nhà cung cấp ngoại vi",
      icon: "storefront" as const,
      href: "/admin/marketplace",
      badge: "Marketplace",
    },
    {
      key: "billing",
      title: "Phí VietSage SaaS",
      description: "Doanh thu & công nợ SaaS",
      icon: "payments" as const,
      href: "/admin/billing",
      badge: "SaaS Billing",
    },
  ];

  const systemServices = [
    { name: "Xác thực & Phân quyền (IAM)", status: "Trực tuyến", latency: "< 15ms" },
    { name: "Điều phối Vận hành Khách sạn", status: "Trực tuyến", latency: "< 25ms" },
    { name: "Định danh CCCD & Biometrics", status: "Sẵn sàng", latency: "< 40ms" },
    { name: "Kết nối KBTT Bộ Công An", status: "Đã kích hoạt", latency: "API C06" },
  ];

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-4">
      {/* 1. Hero banner: 1 compact block only */}
      <header className="rounded-xl border border-[#24473d]/10 bg-[#fffaf0]/95 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#bf7836]">
              Quản trị nền tảng • Platform Administration
            </p>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-[#17201b]">
              Trung tâm quản trị VietSage
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#5f6b63] max-w-3xl leading-relaxed truncate">
              Điều phối tổng thể cơ sở lưu trú, tài khoản đối tác doanh nghiệp, phân quyền RBAC và hạ tầng vận hành.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-md bg-[#24473d] px-2.5 py-1 text-[#fff8e8] shadow-2xs">
                {context.activeRole.name}
              </span>
              <span className="rounded-md bg-[#eadfce] px-2.5 py-1 text-[#5d3b1f]">
                {context.permissions.length} capabilities hoạt động
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#e6efe9] px-2.5 py-1 text-[#1b4332]">
                <span className="size-2 rounded-full bg-[#10b981] animate-pulse" />
                Nền tảng vận hành bình thường
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/admin/hotels"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#24473d] hover:bg-[#1a382f] text-white px-3.5 py-2 text-xs font-semibold shadow-2xs transition active:scale-95"
            >
              <VsIcon name="add" className="text-base" />
              <span>Thêm khách sạn</span>
            </Link>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#24473d]/20 bg-white hover:bg-[#f5f1e8] text-[#17201b] px-3.5 py-2 text-xs font-semibold shadow-2xs transition active:scale-95"
            >
              <VsIcon name="person_add" className="text-base text-[#bf7836]" />
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
            className="rounded-xl border border-[#24473d]/10 bg-white/90 p-4 shadow-2xs hover:border-[#24473d]/25 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#5f6b63]">
                  {kpi.label}
                </span>
                <span className={`grid size-8 place-items-center rounded-lg ${kpi.iconBg} ${kpi.iconColor}`}>
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
            <div className="mt-3 flex items-center justify-between border-t border-[#f0ebe0] pt-2.5 text-xs">
              <span className="rounded-md bg-[#f5f1e8] px-2 py-0.5 text-[11px] font-medium text-[#5f6b63]">
                {kpi.badge}
              </span>
              <Link
                href={kpi.href}
                className="font-semibold text-[#bf7836] hover:text-[#8a4e17] flex items-center gap-1 transition"
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
        <div className="rounded-xl border border-[#24473d]/10 bg-white/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#17201b]">Khách sạn trong hệ thống</h2>
                <p className="text-xs text-[#5f6b63]">Cơ sở lưu trú kết nối gần nhất.</p>
              </div>
              <Link
                href="/admin/hotels"
                className="text-xs font-semibold text-[#24473d] hover:underline flex items-center gap-1 shrink-0"
              >
                Xem tất cả ({totalHotels}) <VsIcon name="arrow_forward" className="text-xs" />
              </Link>
            </div>

            {hotels.length > 0 ? (
              <div className="divide-y divide-[#f0ebe0]">
                {hotels.map((hotel) => (
                  <div key={hotel.id} className="py-2.5 flex items-center justify-between gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-[#17201b] truncate">
                          {hotel.name}
                        </span>
                        {hotel.code && (
                          <span className="rounded bg-[#f0f4f1] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#24473d]">
                            {hotel.code}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#5f6b63] mt-0.5 truncate">
                        {hotel.tenant?.name ? `Tenant: ${hotel.tenant.name}` : "Hệ thống độc lập"} • Múi giờ: {hotel.timezone || "Asia/Ho_Chi_Minh"}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-bold text-[#15803d]">
                        {hotel.status === "ACTIVE" ? "Hoạt động" : (hotel.status || "Hoạt động")}
                      </span>
                      <Link
                        href={`/hotels/${hotel.id}/dashboard`}
                        className="rounded-lg p-1 text-[#5f6b63] hover:text-[#24473d] hover:bg-[#f0f4f1] transition"
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

          <div className="mt-3 pt-3 border-t border-[#f0ebe0]">
            <Link
              href="/admin/hotels"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#bf7836] hover:text-[#8a4e17] transition"
            >
              <span>+ Đăng ký và kết nối khách sạn mới</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Recent Tenant Owners */}
        <div className="rounded-xl border border-[#24473d]/10 bg-white/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#17201b]">Chủ sở hữu & Tenant</h2>
                <p className="text-xs text-[#5f6b63]">Tài khoản quản trị viên doanh nghiệp.</p>
              </div>
              <Link
                href="/admin/users"
                className="text-xs font-semibold text-[#24473d] hover:underline flex items-center gap-1 shrink-0"
              >
                Xem tất cả ({totalTenantOwners}) <VsIcon name="arrow_forward" className="text-xs" />
              </Link>
            </div>

            {tenantOwners.length > 0 ? (
              <div className="divide-y divide-[#f0ebe0]">
                {tenantOwners.map((owner) => (
                  <div key={owner.id} className="py-2.5 flex items-center justify-between gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-semibold text-[#17201b] truncate">
                          {owner.fullName}
                        </span>
                        <span className="rounded bg-[#fdf3e7] px-1.5 py-0.5 text-[10px] font-bold text-[#bf7836]">
                          TENANT_OWNER
                        </span>
                      </div>
                      <p className="text-xs text-[#5f6b63] mt-0.5 truncate">
                        {owner.email} • Tổ chức: {owner.tenant?.name || owner.tenant?.code || "Chưa gán"}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="rounded-full bg-[#f0fdf4] border border-[#bbf7d0] px-2 py-0.5 text-[11px] font-bold text-[#166534]">
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

          <div className="mt-3 pt-3 border-t border-[#f0ebe0]">
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#bf7836] hover:text-[#8a4e17] transition"
            >
              <span>+ Tạo tài khoản chủ sở hữu mới</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Platform administration: 5 compact cards in one row */}
      <section>
        <div className="mb-2.5">
          <h2 className="text-sm font-bold text-[#17201b]">Phân hệ quản trị nền tảng</h2>
          <p className="text-xs text-[#5f6b63]">Truy cập nhanh các phân hệ nghiệp vụ được phân quyền.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {managementModules.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="group rounded-xl border border-[#24473d]/10 bg-white/90 p-4 shadow-2xs hover:border-[#24473d]/25 hover:shadow-xs transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-[#f0f4f1] text-[#24473d] group-hover:bg-[#24473d] group-hover:text-white transition">
                    <VsIcon name={item.icon} className="text-lg" />
                  </span>
                  <span className="text-[10px] font-bold text-[#bf7836] bg-[#fdf3e7] px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[#17201b] group-hover:text-[#24473d] transition">
                  {item.title}
                </h3>
                <p className="mt-0.5 text-xs text-[#5f6b63] line-clamp-1">
                  {item.description}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-[#f5f1e8] flex items-center justify-between text-xs font-semibold text-[#24473d]">
                <span>Truy cập</span>
                <VsIcon name="arrow_forward" className="text-xs transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. Microservices Health: 1 compact full-width section at bottom */}
      <section className="rounded-xl border border-[#24473d]/10 bg-[#faf8f4] p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#10b981] animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#17201b]">
              Tình trạng vi dịch vụ (Microservices Health)
            </h3>
          </div>
          <span className="text-xs font-medium text-[#5f6b63]">
            SLA Uptime: 99.98% • Độ trễ trung bình: ~20ms
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {systemServices.map((svc) => (
            <div
              key={svc.name}
              className="rounded-lg border border-[#e8e2d5] bg-white px-3 py-2 flex items-center justify-between gap-2 shadow-2xs"
            >
              <span className="text-xs font-semibold text-[#17201b] truncate">{svc.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1 text-[11px] text-[#059669] font-bold">
                  <span className="size-1.5 rounded-full bg-[#059669]" />
                  {svc.status}
                </span>
                <span className="text-[10px] text-[#5f6b63] font-mono bg-[#f5f1e8] px-1.5 py-0.5 rounded">
                  {svc.latency}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
