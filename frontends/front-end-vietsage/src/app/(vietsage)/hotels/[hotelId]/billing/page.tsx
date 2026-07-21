import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { billingService } from "@/features/billing/service/billing-service-instance";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { formatMoney } from "@/features/billing/utils/money";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";
import { BillingFolioTableClient } from "@/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/billing/billing-folio-table-client";

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
    <>
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--secondary)]">THANH TOÁN VÀ NHẬT KÝ CA</p>
        <h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)]">Folio, checkout và doanh thu</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-variant)]">Kiểm tra chi phí phòng và dịch vụ, phát hành hóa đơn, thu tiền rồi đóng stay. Phòng sẽ chuyển sang chờ dọn sau khi thanh toán thành công.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-lg border bg-white p-4"><p className="text-sm text-[var(--on-surface-variant)]">Doanh thu hôm nay</p><p className="mt-2 text-2xl font-black text-[var(--primary)]">{formatMoney(dashboard.revenue.today, dashboard.revenue.currency)}</p></article>
        <article className="rounded-lg border bg-white p-4"><p className="text-sm text-[var(--on-surface-variant)]">7 ngày</p><p className="mt-2 text-2xl font-black text-[var(--primary)]">{formatMoney(dashboard.revenue.last7Days, dashboard.revenue.currency)}</p></article>
        <article className="rounded-lg border bg-white p-4"><p className="text-sm text-[var(--on-surface-variant)]">Check-out hôm nay</p><p className="mt-2 text-2xl font-black text-[var(--primary)]">{dashboard.stays.todayCheckOuts}</p></article>
        <article className="rounded-lg border bg-white p-4"><p className="text-sm text-[var(--on-surface-variant)]">Đang chờ checkout</p><p className="mt-2 text-2xl font-black text-amber-700">{dashboard.stays.pendingCheckOuts}</p></article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <BillingFolioTableClient
          hotelId={hotelId}
          folios={folios.items}
          apiBasePath={`/api/hotel-ops/hotels/${hotelId}`}
          invoiceBasePath={`/hotels/${hotelId}/billing/invoices`}
        />

        <aside className="h-fit rounded-xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--outline-variant)] pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--secondary)]">SHIFT LOG</p>
              <h2 className="vs-display mt-1 text-2xl font-semibold text-[var(--primary)]">Nhật ký ca</h2>
            </div>
            <span className="rounded-full bg-[var(--secondary-fixed)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--on-secondary-fixed)]">Đang hoạt động</span>
          </div>
          <dl className="grid grid-cols-2 gap-3 border-b border-[var(--outline-variant)] py-4">
            <div><dt className="text-xs text-[var(--on-surface-variant)]">Đã thu hôm nay</dt><dd className="mt-1 text-lg font-bold text-[var(--primary)]">{formatMoney(dashboard.revenue.today, dashboard.revenue.currency)}</dd></div>
            <div><dt className="text-xs text-[var(--on-surface-variant)]">Doanh thu tháng</dt><dd className="mt-1 text-lg font-bold text-[var(--primary)]">{formatMoney(dashboard.revenue.currentMonth, dashboard.revenue.currency)}</dd></div>
            <div><dt className="text-xs text-[var(--on-surface-variant)]">Công suất phòng</dt><dd className="mt-1 text-lg font-bold text-[var(--primary)]">{dashboard.rooms.occupancyRate}%</dd></div>
            <div><dt className="text-xs text-[var(--on-surface-variant)]">Folio đang mở</dt><dd className="mt-1 text-lg font-bold text-[var(--primary)]">{folios.items.length}</dd></div>
          </dl>
          <div className="space-y-4 pt-4">
            {dashboard.activities.slice(0, 5).map((activity) => (
              <div key={activity.id} className="border-l-2 border-[var(--secondary)] pl-3">
                <p className="text-sm font-semibold text-[var(--primary)]">{activity.title}</p>
                <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{activity.description}</p>
              </div>
            ))}
            {dashboard.activities.length === 0 ? <p className="text-sm text-[var(--on-surface-variant)]">Chưa có hoạt động trong ca.</p> : null}
          </div>
        </aside>
      </section>
    </>
  );
}
