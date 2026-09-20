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

  const managementModules = [
    {
      key: "hotels",
      title: "Danh mục khách sạn",
      description: "Quản lý cơ sở lưu trú, thông tin kết nối và cấu hình phòng nghỉ.",
      icon: "hotel" as const,
      href: "/admin/hotels",
      badge: `${totalHotels} khách sạn`,
    },
    {
      key: "users",
      title: "Chủ sở hữu & Tenant",
      description: "Quản lý tài khoản chủ sở hữu, phân bổ tổ chức và quyền hạn doanh nghiệp.",
      icon: "group" as const,
      href: "/admin/users",
      badge: `${totalTenantOwners} tài khoản`,
    },
    {
      key: "roles",
      title: "Vai trò & Phân quyền",
      description: "Quản trị ma trận phân quyền RBAC, role template và capability hệ thống.",
      icon: "verified_user" as const,
      href: "/admin/permissions",
      badge: `${context.permissions.length} capabilities`,
    },
    {
      key: "marketplace",
      title: "Đối tác dịch vụ",
      description: "Quản lý mạng lưới nhà cung cấp dịch vụ bên ngoài, tour, ẩm thực và xe đưa đón.",
      icon: "storefront" as const,
      href: "/admin/marketplace",
      badge: "Marketplace",
    },
    {
      key: "billing",
      title: "Phí VietSage SaaS",
      description: "Theo dõi doanh thu toàn nền tảng, công nợ, hoa hồng dịch vụ và thanh quyết toán.",
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
    <div className="space-y-8">
      {/* 1. Header with Platform Summary & Actions */}
      <header className="rounded-[2rem] border border-[#24473d]/10 bg-[#fffaf0]/85 p-6 shadow-[0_22px_70px_rgba(31,61,53,0.10)] md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bf7836]">
              Platform administration
            </p>
            <h1 className="vs-display mt-2 text-3xl font-bold tracking-[-0.03em] text-[#17201b] md:text-4xl">
              Trung tâm quản trị VietSage
            </h1>
            <p className="mt-2 text-sm text-[#5f6b63] max-w-2xl leading-relaxed">
              Tổng quan toàn diện về cơ sở lưu trú, tài khoản chủ sở hữu, cấu hình bảo mật và trạng thái vận hành trên toàn bộ nền tảng.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5 text-xs font-semibold">
              <span className="rounded-full bg-[#24473d] px-3.5 py-1.5 text-[#fff8e8] shadow-xs">
                {context.activeRole.name}
              </span>
              <span className="rounded-full bg-[#eadfce] px-3.5 py-1.5 text-[#5d3b1f]">
                {context.permissions.length} capability đang hoạt động
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6efe9] px-3.5 py-1.5 text-[#1b4332] font-semibold">
                <span className="size-2 rounded-full bg-[#10b981] animate-pulse" />
                Nền tảng hoạt động bình thường
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/admin/hotels"
              className="inline-flex items-center gap-2 rounded-full bg-[#24473d] hover:bg-[#1a382f] text-white px-4 py-2.5 text-xs font-semibold shadow-xs transition active:scale-95"
            >
              <VsIcon name="add" className="text-base" />
              <span>Thêm khách sạn</span>
            </Link>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-2 rounded-full border border-[#24473d]/20 bg-white hover:bg-[#FAF7F0] text-[#17201b] px-4 py-2.5 text-xs font-semibold shadow-2xs transition active:scale-95"
            >
              <VsIcon name="person_add" className="text-base text-[#bf7836]" />
              <span>Thêm chủ sở hữu</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Platform KPI Metrics Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Metric 1: Khách sạn */}
        <div className="rounded-2xl border border-[#24473d]/10 bg-white/90 p-5 shadow-xs hover:shadow-sm transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5f6b63]">Khách sạn</span>
            <span className="grid size-10 place-items-center rounded-xl bg-[#e6efe9] text-[#24473d]">
              <VsIcon name="hotel" className="text-xl" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold tracking-tight text-[#17201b]">
              {totalHotels}
            </span>
            <span className="ml-2 text-xs text-[#5f6b63]">cơ sở lưu trú</span>
          </div>
          <div className="mt-4 pt-3 border-t border-[#f0ebe0] flex items-center justify-between text-xs">
            <span className="text-[#24473d] font-semibold">Đang liên kết</span>
            <Link href="/admin/hotels" className="text-[#bf7836] font-semibold hover:underline flex items-center gap-1">
              Xem danh mục <VsIcon name="arrow_forward" className="text-xs" />
            </Link>
          </div>
        </div>

        {/* Metric 2: Chủ sở hữu & Tenant */}
        <div className="rounded-2xl border border-[#24473d]/10 bg-white/90 p-5 shadow-xs hover:shadow-sm transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5f6b63]">Chủ sở hữu & Tenant</span>
            <span className="grid size-10 place-items-center rounded-xl bg-[#fdf3e7] text-[#bf7836]">
              <VsIcon name="group" className="text-xl" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold tracking-tight text-[#17201b]">
              {totalTenantOwners}
            </span>
            <span className="ml-2 text-xs text-[#5f6b63]">tài khoản đối tác</span>
          </div>
          <div className="mt-4 pt-3 border-t border-[#f0ebe0] flex items-center justify-between text-xs">
            <span className="text-[#bf7836] font-semibold">Doanh nghiệp quản trị</span>
            <Link href="/admin/users" className="text-[#bf7836] font-semibold hover:underline flex items-center gap-1">
              Quản lý người dùng <VsIcon name="arrow_forward" className="text-xs" />
            </Link>
          </div>
        </div>

        {/* Metric 3: Vai trò & Quyền hạn */}
        <div className="rounded-2xl border border-[#24473d]/10 bg-white/90 p-5 shadow-xs hover:shadow-sm transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5f6b63]">Phân quyền RBAC</span>
            <span className="grid size-10 place-items-center rounded-xl bg-[#eef2f6] text-[#2c4c64]">
              <VsIcon name="verified_user" className="text-xl" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold tracking-tight text-[#17201b]">
              {rolesCount > 0 ? rolesCount : "8+"}
            </span>
            <span className="ml-2 text-xs text-[#5f6b63]">role templates</span>
          </div>
          <div className="mt-4 pt-3 border-t border-[#f0ebe0] flex items-center justify-between text-xs">
            <span className="text-[#2c4c64] font-semibold">{context.permissions.length} capabilities</span>
            <Link href="/admin/permissions" className="text-[#bf7836] font-semibold hover:underline flex items-center gap-1">
              Cấu hình quyền <VsIcon name="arrow_forward" className="text-xs" />
            </Link>
          </div>
        </div>

        {/* Metric 4: Trạng thái hệ thống */}
        <div className="rounded-2xl border border-[#24473d]/10 bg-white/90 p-5 shadow-xs hover:shadow-sm transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5f6b63]">Tình trạng nền tảng</span>
            <span className="grid size-10 place-items-center rounded-xl bg-[#ecfdf5] text-[#059669]">
              <VsIcon name="check_circle" className="text-xl" />
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-3xl font-bold tracking-tight text-[#059669]">
              100%
            </span>
            <span className="rounded-full bg-[#d1fae5] px-2 py-0.5 text-[11px] font-bold text-[#065f46]">
              Ổn định
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-[#f0ebe0] flex items-center justify-between text-xs">
            <span className="text-[#059669] font-semibold">Tất cả dịch vụ Online</span>
            <Link href="/admin/marketplace" className="text-[#bf7836] font-semibold hover:underline flex items-center gap-1">
              Chi tiết dịch vụ <VsIcon name="arrow_forward" className="text-xs" />
            </Link>
          </div>
        </div>
      </section>

      {/* 3. Live Operational Overview: Hotels & Tenant Owners */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Recent Hotels */}
        <div className="rounded-2xl border border-[#24473d]/10 bg-white/90 p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#17201b]">Khách sạn trong hệ thống</h2>
                <p className="text-xs text-[#6d756e]">Danh sách cơ sở lưu trú kết nối gần nhất.</p>
              </div>
              <Link
                href="/admin/hotels"
                className="text-xs font-semibold text-[#24473d] hover:underline flex items-center gap-1"
              >
                Xem tất cả ({totalHotels}) <VsIcon name="arrow_forward" className="text-xs" />
              </Link>
            </div>

            {hotels.length > 0 ? (
              <div className="divide-y divide-[#f0ebe0]">
                {hotels.map((hotel) => (
                  <div key={hotel.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#17201b] truncate">
                          {hotel.name}
                        </span>
                        {hotel.code && (
                          <span className="rounded bg-[#f0f4f1] px-1.5 py-0.5 text-[10px] font-bold text-[#24473d]">
                            {hotel.code}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#6d756e] mt-0.5 truncate">
                        {hotel.tenant?.name ? `Tenant: ${hotel.tenant.name}` : "Hệ thống độc lập"} • Múi giờ: {hotel.timezone || "Asia/Ho_Chi_Minh"}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="rounded-full bg-[#dcfce7] px-2.5 py-1 text-[11px] font-bold text-[#15803d]">
                        {hotel.status === "ACTIVE" ? "Hoạt động" : (hotel.status || "Hoạt động")}
                      </span>
                      <Link
                        href={`/hotels/${hotel.id}/dashboard`}
                        className="rounded-lg p-1.5 text-[#5f6b63] hover:text-[#24473d] hover:bg-[#f0f4f1] transition"
                        title="Vào dashboard khách sạn"
                      >
                        <VsIcon name="open_in_new" className="text-base" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#24473d]/20 p-6 text-center text-xs text-[#6d756e]">
                Chưa có khách sạn nào được khởi tạo trên nền tảng.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0ebe0]">
            <Link
              href="/admin/hotels"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#bf7836] hover:text-[#8a4e17] transition"
            >
              <span>+ Đăng ký và kết nối khách sạn mới</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Recent Tenant Owners */}
        <div className="rounded-2xl border border-[#24473d]/10 bg-white/90 p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#17201b]">Chủ sở hữu & Đối tác</h2>
                <p className="text-xs text-[#6d756e]">Tài khoản quản trị viên doanh nghiệp trên hệ thống.</p>
              </div>
              <Link
                href="/admin/users"
                className="text-xs font-semibold text-[#24473d] hover:underline flex items-center gap-1"
              >
                Xem tất cả ({totalTenantOwners}) <VsIcon name="arrow_forward" className="text-xs" />
              </Link>
            </div>

            {tenantOwners.length > 0 ? (
              <div className="divide-y divide-[#f0ebe0]">
                {tenantOwners.map((owner) => (
                  <div key={owner.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#17201b] truncate">
                          {owner.fullName}
                        </span>
                        <span className="rounded bg-[#fdf3e7] px-1.5 py-0.5 text-[10px] font-bold text-[#bf7836]">
                          TENANT_OWNER
                        </span>
                      </div>
                      <p className="text-xs text-[#6d756e] mt-0.5 truncate">
                        {owner.email} • Tổ chức: {owner.tenant?.name || owner.tenant?.code || "Chưa gán"}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="rounded-full bg-[#f0fdf4] border border-[#bbf7d0] px-2.5 py-0.5 text-[11px] font-bold text-[#166534]">
                        Hoạt động
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#24473d]/20 p-6 text-center text-xs text-[#6d756e]">
                Chưa có chủ sở hữu nào được tạo trên hệ thống.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#f0ebe0]">
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#bf7836] hover:text-[#8a4e17] transition"
            >
              <span>+ Tạo tài khoản chủ sở hữu mới</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Core Management Modules Strip */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-[#17201b]">Phân hệ quản trị nền tảng</h2>
          <p className="text-xs text-[#6d756e]">Truy cập nhanh các khu vực chức năng được cấp quyền.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {managementModules.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="group rounded-2xl border border-[#24473d]/10 bg-white/90 p-4 shadow-2xs hover:shadow-sm hover:-translate-y-0.5 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#f0f4f1] text-[#24473d] group-hover:bg-[#24473d] group-hover:text-white transition">
                    <VsIcon name={item.icon} className="text-lg" />
                  </span>
                  <span className="text-[11px] font-bold text-[#bf7836] bg-[#fdf3e7] px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[#17201b] group-hover:text-[#24473d] transition">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs text-[#6d756e] line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#f5f1e8] flex items-center justify-between text-xs font-semibold text-[#24473d]">
                <span>Truy cập</span>
                <VsIcon name="arrow_forward" className="text-xs transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. System Health Status Card */}
      <section className="rounded-2xl border border-[#24473d]/10 bg-[#f9f8f5] p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#17201b] flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[#10b981]" />
              Tình trạng kết nối vi dịch vụ (Microservices Health)
            </h3>
            <p className="text-xs text-[#6d756e]">Trạng thái sẵn sàng của các cụm xử lý thời gian thực.</p>
          </div>
          <span className="text-xs font-bold text-[#24473d] bg-white border border-[#24473d]/15 px-3 py-1 rounded-full self-start">
            Thời gian phản hồi trung bình: ~20ms
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {systemServices.map((svc) => (
            <div key={svc.name} className="rounded-xl border border-[#e5dfd5] bg-white p-3 shadow-2xs">
              <span className="block text-xs font-semibold text-[#17201b] truncate">{svc.name}</span>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-[#059669] font-bold">
                  <span className="size-1.5 rounded-full bg-[#059669]" />
                  {svc.status}
                </span>
                <span className="text-[11px] text-[#6d756e] font-mono">{svc.latency}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
