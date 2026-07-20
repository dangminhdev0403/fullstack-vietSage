import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { VsDashboardSidebar } from "../../../_components/vs-dashboard-sidebar";
import { VsTopBar } from "../../../_components/vs-top-bar";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

type Props = { params: Promise<{ hotelId: string }> | { hotelId: string } };

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default async function HotelArrivalsPage({ params }: Props) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/arrivals` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  if (!canUseHotelId(context, hotelId) || (!context.permissions.includes("hotel.reservations.view") && !context.permissions.includes("hotel.reservations.manage"))) notFound();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const arrivals = await authorizedApi("list hotel arrivals", (accessToken) =>
    hotelOpsService.listArrivals(hotelId, { query: { from: from.toISOString(), to: to.toISOString(), page: 1, limit: 100 }, accessToken }),
  );
  const navItems = buildWorkspaceNavigationForContext({ ...context, hotelId });

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <VsTopBar title="Vận hành khách sạn" brandLockup={false} showLeftControl={false} rightMode="profile" rightLabel={context.activeRole.name} subtitle="Khách đến" />
      <VsDashboardSidebar activePath={callbackUrl} items={navItems} />
      <main className="min-h-screen px-4 pb-24 pt-24 md:ml-80 md:px-10">
        <div className="mx-auto max-w-[1500px] space-y-6">
          <header><p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--secondary)]">7 NGÀY TỚI</p><h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)]">Khách đến & đặt phòng</h1><p className="mt-2 text-sm text-[var(--on-surface-variant)]">Chỉ tải danh sách arrivals của khách sạn đang chọn; thao tác gán phòng và check-in tiếp tục được backend kiểm tra quyền quản lý.</p></header>
          <section className="overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-[var(--surface-container-low)] text-xs uppercase"><tr><th className="px-5 py-4">Mã đặt phòng</th><th className="px-5 py-4">Khách</th><th className="px-5 py-4">Nhận phòng</th><th className="px-5 py-4">Trả phòng</th><th className="px-5 py-4">Trạng thái</th></tr></thead><tbody className="divide-y divide-[var(--outline-variant)]">{arrivals.items.map((arrival) => <tr key={arrival.id}><td className="px-5 py-4 font-semibold text-[var(--primary)]">{arrival.reservationCode}</td><td className="px-5 py-4"><p>{arrival.guestDisplayName}</p><p className="text-xs text-[var(--on-surface-variant)]">{arrival.guestPhone ?? "Không có số điện thoại"}</p></td><td className="px-5 py-4">{formatDateTime(arrival.plannedCheckInAt)}</td><td className="px-5 py-4">{formatDateTime(arrival.plannedCheckOutAt)}</td><td className="px-5 py-4"><span className="rounded-full bg-[var(--surface-container)] px-3 py-1 text-xs font-semibold">{arrival.status}</span></td></tr>)}</tbody></table></div>{arrivals.items.length === 0 ? <p className="p-8 text-center text-sm text-[var(--on-surface-variant)]">Không có khách dự kiến đến trong 7 ngày tới.</p> : null}</section>
        </div>
      </main>
    </div>
  );
}
