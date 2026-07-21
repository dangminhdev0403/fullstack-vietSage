import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";
import { OwnerStayRoomGridClient } from "@/app/(vietsage)/owner/(hotel)/hotels/[hotelId]/stay/owner-stay-room-grid-client";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };
export const dynamic = "force-dynamic";

export default async function StaffRoomsPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/rooms` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  if (!canUseHotelId(context, hotelId) || !context.permissions.includes("hotel.rooms.view")) {
    notFound();
  }

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const [roomsPage, dashboard] = await Promise.all([
    authorizedApi("list staff rooms", (accessToken) =>
      hotelOpsService.listRooms(hotelId, { query: { page: 1, limit: 100 }, accessToken }),
    ),
    authorizedApi("load room dashboard", (accessToken) =>
      hotelOpsService.getDashboard(hotelId, { accessToken }),
    ),
  ]);

  const metrics = [
    ["Sẵn sàng", dashboard.rooms.byStatus.available, "text-emerald-700"],
    ["Đang ở", dashboard.rooms.byStatus.occupied, "text-blue-700"],
    ["Chờ dọn", dashboard.rooms.byStatus.processing, "text-amber-700"],
    ["Bảo trì", dashboard.rooms.byStatus.maintenance, "text-red-700"],
  ] as const;

  return (
    <>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--secondary)]">SƠ ĐỒ PHÒNG</p>
          <h1 className="vs-display mt-2 text-4xl font-semibold text-[var(--primary)]">Mở phòng và lưu trú</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--on-surface-variant)]">Chọn phòng sẵn sàng để check-in khách vãng lai. Sau khi mở phòng, QR GuestOS và mã truy cập được kích hoạt ngay.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/hotels/${hotelId}/arrivals`} className="rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-3 text-sm font-semibold text-[var(--primary)]">Khách đặt trước</Link>
          <Link href={`/hotels/${hotelId}/billing`} className="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white">Thanh toán và checkout</Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, tone]) => (
          <article key={label} className="rounded-lg border border-[var(--outline-variant)] bg-white p-4">
            <p className="text-sm font-semibold text-[var(--on-surface-variant)]">{label}</p>
            <p className={`mt-2 text-3xl font-black ${tone}`}>{value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-[var(--outline-variant)] bg-white p-5">
        <OwnerStayRoomGridClient
          hotelId={hotelId}
          rooms={roomsPage.items}
          apiBasePath={`/api/hotel-ops/hotels/${hotelId}`}
        />
      </section>
    </>
  );
}
