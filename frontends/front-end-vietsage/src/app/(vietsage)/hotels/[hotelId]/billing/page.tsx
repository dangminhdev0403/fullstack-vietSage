import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { billingService } from "@/features/billing/service/billing-service-instance";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { formatMoney } from "@/features/billing/utils/money";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";
import { StaffBillingWorkspaceClient } from "./staff-billing-workspace-client";

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

      <section>
        <StaffBillingWorkspaceClient
          hotelId={hotelId}
          folios={folios.items}
          canManage={context.permissions.includes("hotel.billing.manage")}
        />
      </section>
    </>
  );
}
