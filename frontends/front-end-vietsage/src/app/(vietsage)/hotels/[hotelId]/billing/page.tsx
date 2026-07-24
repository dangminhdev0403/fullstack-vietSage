import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { billingService } from "@/features/billing/service/billing-service-instance";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { formatMoney } from "@/features/billing/utils/money";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { StaffBillingWorkspaceClient } from "./staff-billing-workspace-client";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };
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
  const [folios, dashboard] = await Promise.all([
    authorizedApi("list staff billing folios", (accessToken) =>
      billingService.listFolios(hotelId, { query: { page: 1, limit: 100 }, accessToken }),
    ),
    authorizedApi("load staff billing metrics", (accessToken) =>
      hotelOpsService.getDashboard(hotelId, { accessToken }),
    ),
  ]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">THANH TOÁN & THU DOANH THU</p>
          <h1 className="vs-display mt-0.5 text-2xl font-semibold text-[var(--primary)] md:text-3xl">Folio, checkout & doanh thu</h1>
          <p className="mt-0.5 text-xs text-[var(--on-surface-variant)]">Kiểm tra chi phí phòng, phát hành hóa đơn và thu tiền checkout cho khách lưu trú.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#17201b] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm">
            {folios.items.length} Folio hoạt động
          </span>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="flex items-center gap-3.5 rounded-2xl border border-[var(--outline-variant)] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <VsIcon name="payments" className="text-xl" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--on-surface-variant)]">Doanh thu hôm nay</p>
            <p className="mt-0.5 text-lg font-black text-[var(--primary)]">{formatMoney(dashboard.revenue.today, dashboard.revenue.currency)}</p>
          </div>
        </article>

        <article className="flex items-center gap-3.5 rounded-2xl border border-[var(--outline-variant)] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <VsIcon name="calendar_today" className="text-xl" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--on-surface-variant)]">Doanh thu 7 ngày</p>
            <p className="mt-0.5 text-lg font-black text-[var(--primary)]">{formatMoney(dashboard.revenue.last7Days, dashboard.revenue.currency)}</p>
          </div>
        </article>

        <article className="flex items-center gap-3.5 rounded-2xl border border-[var(--outline-variant)] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
            <VsIcon name="meeting_room" className="text-xl" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--on-surface-variant)]">Check-out hôm nay</p>
            <p className="mt-0.5 text-lg font-black text-[var(--primary)]">{dashboard.stays.todayCheckOuts} lượt</p>
          </div>
        </article>

        <article className="flex items-center gap-3.5 rounded-2xl border border-[var(--outline-variant)] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <VsIcon name="pending_actions" className="text-xl" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--on-surface-variant)]">Đang chờ checkout</p>
            <p className="mt-0.5 text-lg font-black text-amber-700">{dashboard.stays.pendingCheckOuts} phòng</p>
          </div>
        </article>
      </section>

      <section>
        <StaffBillingWorkspaceClient
          hotelId={hotelId}
          folios={folios.items}
          canManage={context.permissions.includes("hotel.billing.manage")}
        />
      </section>
    </div>
  );
}
