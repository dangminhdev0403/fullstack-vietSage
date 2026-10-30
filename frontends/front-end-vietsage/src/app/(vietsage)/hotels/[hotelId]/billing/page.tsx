import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { billingService } from "@/features/billing/service/billing-service-instance";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { formatMoney } from "@/features/billing/utils/money";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { StaffBillingWorkspaceClient } from "./staff-billing-workspace-client";
import { StaffSaasReminder } from "./staff-saas-reminder";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type PageProps = { params: Promise<{ hotelId: string }> };
export const dynamic = "force-dynamic";

export default async function StaffBillingPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/billing` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  if (!canUseHotelId(context, hotelId) || !context.permissions.includes("hotel.billing.view")) notFound();
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const hasRevenueProtectionPermission = context.permissions.includes("hotel.revenue-protection.view");
  const analyticsPromise = hasRevenueProtectionPermission
    ? authorizedApi("load platform billing analytics for staff reminder", (accessToken) =>
        billingService.getPlatformBillingAnalytics(hotelId, { accessToken }),
      ).catch(() => null)
    : Promise.resolve(null);

  const [folios, dashboard, analytics] = await Promise.all([
    authorizedApi("list staff billing folios", (accessToken) =>
      billingService.listFolios(hotelId, { query: { page: 1, limit: 100 }, accessToken }),
    ),
    authorizedApi("load staff billing metrics", (accessToken) =>
      hotelOpsService.getDashboard(hotelId, { accessToken }),
    ),
    analyticsPromise,
  ]);

  return (
    <div className="space-y-4">
      <StaffSaasReminder reminder={analytics?.reminder ?? null} />

      <header className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">THANH TOÁN & THU DOANH THU</p>
          <h1 className="vs-display mt-0.5 text-2xl font-semibold text-[var(--primary)] md:text-3xl">Folio, checkout &amp; Doanh thu</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#17201b] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm">
            {folios.items.length} Folio hoạt động
          </span>
        </div>
      </header>

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <article className="flex items-center gap-2.5 rounded-xl border border-[var(--outline-variant)] bg-white p-3 shadow-xs">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <VsIcon name="payments" className="text-lg" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--on-surface-variant)] truncate">Doanh thu hôm nay</p>
            <p className="text-base font-black text-[var(--primary)]">{formatMoney(dashboard.revenue.today, dashboard.revenue.currency)}</p>
          </div>
        </article>

        <article className="flex items-center gap-2.5 rounded-xl border border-[var(--outline-variant)] bg-white p-3 shadow-xs">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <VsIcon name="calendar_today" className="text-lg" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--on-surface-variant)] truncate">Doanh thu 7 ngày</p>
            <p className="text-base font-black text-[var(--primary)]">{formatMoney(dashboard.revenue.last7Days, dashboard.revenue.currency)}</p>
          </div>
        </article>

        <article className="flex items-center gap-2.5 rounded-xl border border-[var(--outline-variant)] bg-white p-3 shadow-xs">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
            <VsIcon name="meeting_room" className="text-lg" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--on-surface-variant)] truncate">Check-out hôm nay</p>
            <p className="text-base font-black text-[var(--primary)]">{dashboard.stays.todayCheckOuts} lượt</p>
          </div>
        </article>

        <article className="flex items-center gap-2.5 rounded-xl border border-[var(--outline-variant)] bg-white p-3 shadow-xs">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <VsIcon name="pending_actions" className="text-lg" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--on-surface-variant)] truncate">Đang chờ checkout</p>
            <p className="text-base font-black text-amber-700">{dashboard.stays.pendingCheckOuts} phòng</p>
          </div>
        </article>
      </section>

      <section>
        <StaffBillingWorkspaceClient
          hotelId={hotelId}
          folios={folios.items}
          canManage={
            context.permissions.includes("hotel.billing.manage") ||
            context.permissions.includes("hotel.billing.checkout") ||
            context.activeRole.code === "TENANT_OWNER" ||
            context.activeRole.code === "HOTEL_OWNER" ||
            context.activeRole.code === "SUPER_ADMIN"
          }
        />
      </section>
    </div>
  );
}
