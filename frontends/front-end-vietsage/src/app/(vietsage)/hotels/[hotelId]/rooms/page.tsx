import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { assertCanAccessHotelOps, canUseHotelId, requireHotelOpsServerTokens } from "@/features/hotel-ops/utils/hotel-route-auth";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { StaffRoomsClient } from "./staff-rooms-client";

type PageProps = { params: Promise<{ hotelId: string }> | { hotelId: string } };
export const dynamic = "force-dynamic";

export default async function StaffRoomsPage({ params }: PageProps) {
  const { hotelId } = await Promise.resolve(params);
  const callbackUrl = `/hotels/${hotelId}/rooms` as const;
  const session = await auth();
  assertCanAccessHotelOps(session, callbackUrl);
  const tokens = await requireHotelOpsServerTokens(callbackUrl);
  const context = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);
  const canViewRooms = context.permissions.includes("hotel.rooms.view");
  const canViewReservations = context.permissions.includes("hotel.reservations.view") || context.permissions.includes("hotel.reservations.manage");
  if (!canUseHotelId(context, hotelId) || (!canViewRooms && !canViewReservations)) {
    notFound();
  }

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);

  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const [roomsPage, arrivals, dashboard] = await Promise.all([
    authorizedApi("list staff rooms", (accessToken) =>
      hotelOpsService.listRooms(hotelId, { query: { page: 1, limit: 20 }, accessToken }),
    ),
    canViewReservations
      ? authorizedApi("list staff arrivals", (accessToken) =>
          hotelOpsService.listArrivals(hotelId, { query: { from: from.toISOString(), to: to.toISOString(), page: 1, limit: 100 }, accessToken }),
        )
      : Promise.resolve({ page: 1, limit: 100, total: 0, items: [] }),
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
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, tone]) => (
          <article key={label} className="rounded-lg border border-[var(--outline-variant)] bg-white p-4">
            <p className="text-sm font-semibold text-[var(--on-surface-variant)]">{label}</p>
            <p className={`mt-2 text-3xl font-black ${tone}`}>{value}</p>
          </article>
        ))}
      </section>

      <section>
        <StaffRoomsClient
          hotelId={hotelId}
          initialRoomsPage={roomsPage}
          arrivals={arrivals.items}
          canManageRooms={context.permissions.includes("hotel.rooms.manage")}
          canManageReservations={context.permissions.includes("hotel.reservations.manage")}
          canManageStays={context.permissions.includes("hotel.stays.manage")}
        />
      </section>
    </>
  );
}
