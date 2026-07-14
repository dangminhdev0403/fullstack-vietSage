import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { readServerSessionTokens } from "@/lib/server-session-tokens";

import { VsDashboardSidebar } from "../../_components/vs-dashboard-sidebar";
import { VsIcon } from "../../_components/vs-icon";
import { VsTopBar } from "../../_components/vs-top-bar";

const requestCategoryBreakdown = [
  {
    name: "Dịch vụ phòng",
    percent: 45,
    color: "bg-[var(--primary-container)]",
  },
  { name: "Vệ sinh", percent: 25, color: "bg-[var(--secondary-container)]" },
  { name: "Kỹ thuật", percent: 15, color: "bg-[var(--tertiary-fixed-dim)]" },
  { name: "Khác", percent: 15, color: "bg-[var(--surface-variant)]" },
];

const weeklyTrend = [
  { day: "T2", thisWeek: 42, lastWeek: 34 },
  { day: "T3", thisWeek: 58, lastWeek: 41 },
  { day: "T4", thisWeek: 61, lastWeek: 47 },
  { day: "T5", thisWeek: 66, lastWeek: 52 },
  { day: "T6", thisWeek: 74, lastWeek: 61 },
  { day: "T7", thisWeek: 82, lastWeek: 68 },
  { day: "CN", thisWeek: 57, lastWeek: 44 },
];

const recentActivities = [
  {
    id: "recent-1",
    title: "Dịch vụ ăn uống tại phòng",
    subtitle: "Phòng 402 - 10 phút trước",
    status: "Đang xử lý",
    tone: "warning",
  },
  {
    id: "recent-2",
    title: "Yêu cầu dọn dẹp",
    subtitle: "Phòng 215 - 25 phút trước",
    status: "Đã nhận",
    tone: "info",
  },
  {
    id: "recent-3",
    title: "Sửa chữa máy điều hòa",
    subtitle: "Phòng 108 - 45 phút trước",
    status: "Chờ duyệt",
    tone: "error",
  },
] as const;

const toneClassMap = {
  warning:
    "bg-[var(--secondary-container)]/40 text-[var(--on-secondary-container)]",
  info: "bg-[var(--primary-fixed)] text-[var(--on-primary-fixed-variant)]",
  error: "bg-[var(--error-container)] text-[var(--on-error-container)]",
} as const;

type DashboardPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export default async function AdminDashboardPage({
  searchParams,
}: DashboardPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const rawTab = resolvedSearchParams.tab;
  const tab = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const normalizedTab = typeof tab === "string" ? tab.trim().toLowerCase() : "";

  if (normalizedTab === "permissions") {
    redirect("/admin/permissions");
  }

  if (normalizedTab === "roles") {
    redirect("/admin/roles");
  }

  if (normalizedTab === "users") {
    redirect("/admin/users");
  }

  if (normalizedTab === "hotels") {
    redirect("/admin/hotels");
  }

  const activeSidebarPath =
    normalizedTab.length > 0
      ? "/admin/dashboard?tab=" + encodeURIComponent(normalizedTab)
      : "/admin/dashboard";

  const session = await auth();
  const tokens = await readServerSessionTokens();

  const sidebarItems = await resolveDashboardNavigation({
    userRole: "admin",
    assignedRoles: [],
    permissions: [],
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: session?.accessTokenExpiresAt ?? tokens.accessTokenExpiresAt,
    refreshToken: tokens.refreshToken,
    authError: session?.authError ?? null,
  });

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <VsTopBar
        title="VietSage"
        brandLockup={false}
        titleClassName="text-[32px] font-semibold leading-none tracking-tight"
        showLeftControl={false}
        rightMode="profile"
        rightLabel="Quản trị viên"
        subtitle="Quản trị viên"
      />

      <VsDashboardSidebar activePath={activeSidebarPath} items={sidebarItems} />

      <main className="min-h-screen px-4 pb-24 pt-24 md:ml-80 md:px-10">
        <div className="mx-auto max-w-[1600px] space-y-10">
          <section>
            <h1 className="vs-display text-[32px] font-semibold text-[var(--primary)] md:text-[40px]">
              Tổng quan vận hành
            </h1>
            <p className="mt-2 text-lg text-[var(--on-surface-variant)]">
              Cập nhật lúc 09:45, Thứ Hai, 24 Tháng 5, 2024
            </p>
          </section>

          <section className="grid gap-6 xl:grid-cols-3">
            <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.15)] p-6">
              <div className="mb-6 flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--primary-fixed)] text-[var(--on-primary-fixed)]">
                  <VsIcon name="hotel" className="text-[24px]" />
                </div>
                <span className="inline-flex items-center gap-1 text-sm text-[var(--on-surface-variant)]">
                  <VsIcon name="trending_up" className="text-[16px]" />
                  +2.5%
                </span>
              </div>
              <p className="text-sm font-semibold text-[var(--on-surface-variant)]">
                Tổng số phòng
              </p>
              <h2 className="vs-display mt-1 text-[44px] font-bold text-[var(--primary)]">
                128
              </h2>
            </article>

            <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.15)] bg-[var(--secondary-fixed)] p-6">
              <div className="mb-6 flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/40 text-[var(--on-secondary-fixed)]">
                  <VsIcon name="person_pin" className="text-[24px]" />
                </div>
                <span className="text-sm font-medium text-[var(--on-secondary-fixed-variant)]">
                  82% Công suất
                </span>
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--on-secondary-fixed-variant)]">
                Phòng đang ở
              </p>
              <h2 className="vs-display mt-1 text-[44px] font-bold text-[var(--on-secondary-fixed)]">
                105
              </h2>
            </article>

            <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.15)] p-6">
              <div className="mb-6 flex items-start justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--tertiary-fixed)] text-[var(--on-tertiary-fixed)]">
                  <VsIcon name="door_front" className="text-[24px]" />
                </div>
                <span className="text-sm text-[var(--on-surface-variant)]">
                  Sẵn sàng đón khách
                </span>
              </div>
              <p className="text-sm font-semibold text-[var(--on-surface-variant)]">
                Phòng trống
              </p>
              <h2 className="vs-display mt-1 text-[44px] font-bold text-[var(--primary)]">
                23
              </h2>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.15)] p-8">
              <div className="flex flex-col items-start gap-8 md:flex-row md:items-center">
                <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[conic-gradient(var(--primary-container)_76%,var(--surface-variant)_76%)]">
                  <div className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-white text-[32px] font-bold text-[var(--primary)]">
                    12
                  </div>
                </div>

                <div>
                  <p className="text-[24px] font-semibold text-[var(--on-surface-variant)]">
                    Yêu cầu đang hoạt động
                  </p>
                  <h3 className="vs-display mt-1 text-[34px] font-semibold text-[var(--primary)]">
                    Cần xử lí ngay
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full bg-[var(--error-container)] px-3 py-1 text-[var(--on-error-container)]">
                      4 Khẩn cấp
                    </span>
                    <span className="rounded-full bg-[var(--secondary-container)] px-3 py-1 text-[var(--on-secondary-container)]">
                      8 Bình thường
                    </span>
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-[color:rgba(198,197,213,0.15)] bg-[var(--primary)] p-8 text-white shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
              <p className="text-[22px] font-semibold text-white/80">
                Thời gian phản hồi trung bình
              </p>
              <div className="mt-3 flex items-end gap-3">
                <h3 className="vs-display text-[56px] font-bold leading-none">
                  4.2
                </h3>
                <span className="mb-2 text-[24px]">phút</span>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full w-3/4 rounded-full bg-[var(--secondary-container)]" />
                </div>
                <span className="text-sm font-semibold">Nhanh hơn 15%</span>
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.15)] p-8">
              <div className="mb-8 flex items-center justify-between">
                <h2 className="vs-display text-[32px] font-semibold text-[var(--primary)]">
                  Yêu cầu theo danh mục
                </h2>
                <VsIcon
                  name="more_vert"
                  className="text-[20px] text-[var(--on-surface-variant)]"
                />
              </div>

              <div className="relative mx-auto h-52 w-52 rounded-full bg-[conic-gradient(var(--primary-container)_0_45%,var(--secondary-container)_45%_70%,var(--tertiary-fixed-dim)_70%_85%,var(--surface-variant)_85%_100%)] p-4">
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
                  <span className="text-sm text-[var(--on-surface-variant)]">
                    Tổng cộng
                  </span>
                  <span className="vs-display text-[32px] font-bold text-[var(--primary)]">
                    458
                  </span>
                </div>
              </div>

              <ul className="mt-8 grid gap-3">
                {requestCategoryBreakdown.map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center gap-3 text-base text-[var(--on-surface-variant)]"
                  >
                    <span className={`h-3 w-3 rounded-full ${item.color}`} />
                    {item.name} ({item.percent}%)
                  </li>
                ))}
              </ul>
            </article>

            <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.15)] p-8">
              <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="vs-display text-[32px] font-semibold text-[var(--primary)]">
                    Xu hướng yêu cầu
                  </h2>
                  <p className="text-base text-[var(--on-surface-variant)]">
                    Thống kê 7 ngày gần nhất
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[color:rgba(198,197,213,0.5)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)]"
                  >
                    Tuần này
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--surface-container)] px-4 py-2 text-sm font-semibold text-[var(--on-surface-variant)]"
                  >
                    Tuần trước
                  </button>
                </div>
              </div>

              <div className="relative h-64">
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between py-4 opacity-30">
                  <div className="border-b border-[var(--outline-variant)]" />
                  <div className="border-b border-[var(--outline-variant)]" />
                  <div className="border-b border-[var(--outline-variant)]" />
                </div>

                <div className="relative z-10 flex h-full items-end gap-4">
                  {weeklyTrend.map((point) => (
                    <div
                      key={point.day}
                      className="flex flex-1 flex-col items-center gap-2"
                    >
                      <div className="flex h-full items-end gap-2">
                        <div
                          className="w-2 rounded-full bg-[var(--surface-container-highest)]"
                          style={{ height: `${point.lastWeek}%` }}
                        />
                        <div
                          className="w-2 rounded-full bg-[var(--primary-container)]"
                          style={{ height: `${point.thisWeek}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-[var(--on-surface-variant)]">
                        {point.day}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>

          <section className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.15)] p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="vs-display text-[32px] font-semibold text-[var(--primary)]">
                Yêu cầu dịch vụ gần đây
              </h2>
              <button
                type="button"
                className="text-sm font-semibold text-[var(--primary)]"
              >
                Xem tất cả yêu cầu
              </button>
            </div>

            <ul className="space-y-3">
              {recentActivities.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-[color:rgba(198,197,213,0.25)] p-4 transition-colors hover:bg-[var(--surface-container-low)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-[var(--primary)]">
                        {item.title}
                      </p>
                      <p className="text-sm text-[var(--on-surface-variant)]">
                        {item.subtitle}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${toneClassMap[item.tone]}`}
                    >
                      {item.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
