import Link from "next/link";

import { auth } from "@/auth";
import { adminService } from "@/features/admin/service/admin-service-instance";
import type { Hotel } from "@/features/admin/types/admin-contract";
import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { VsIcon } from "../../_components/vs-icon";
import { OwnerShell } from "../_components/owner-shell";

export const dynamic = "force-dynamic";

function formatDate(value: string | null | undefined): string {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getActiveHotels(hotels: readonly Hotel[]): Hotel[] {
  return hotels.filter((hotel) => hotel.status !== "DISABLED");
}

export default async function OwnerRoomsPage() {
  const session = await auth();
  const callbackUrl = "/owner/rooms" as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });

  const [sidebarItems, hotelsPage] = await Promise.all([
    resolveDashboardNavigation({
      roles: session?.user.roles ?? [],
      accessToken: session?.accessToken ?? null,
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? null,
      refreshToken: session?.refreshToken ?? null,
      authError: session?.authError ?? null,
    }),
    authorizedApi("list owner hotels for room manager", (accessToken) =>
      adminService.listHotels({ query: { page: 1, limit: 100 }, accessToken }),
    ),
  ]);

  const hotels = hotelsPage.items;
  const activeHotels = getActiveHotels(hotels);

  return (
    <OwnerShell activePath={callbackUrl} navItems={sidebarItems} subtitle="Quản lý phòng">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">PHÒNG</p>
          <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">Quản lý phòng</h1>
          <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
            Chọn khách sạn để mở danh sách phòng, tạo phòng mới và quản lý QR cho từng phòng.
          </p>
        </div>

        <div className="grid min-w-full grid-cols-2 gap-3 sm:min-w-[360px]">
          <div className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--outline)]">Khách sạn</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--primary)]">{hotelsPage.total || hotels.length}</p>
          </div>
          <div className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--outline)]">Đang hoạt động</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--primary)]">{activeHotels.length}</p>
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-white">
        <div className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--secondary-container)] text-[var(--on-secondary-container)]">
              <VsIcon name="bed" className="text-[20px]" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[var(--primary)]">Khách sạn có thể quản lý phòng</h2>
              <p className="text-sm text-[var(--on-surface-variant)]">Mỗi khách sạn có bộ phòng và QR riêng.</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[var(--surface-container-low)] text-xs uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
              <tr>
                <th className="px-5 py-4">Khách sạn</th>
                <th className="px-5 py-4">Mã</th>
                <th className="px-5 py-4">Cập nhật</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--outline-variant)]">
              {hotels.map((hotel) => (
                <tr key={hotel.id} className="align-top transition-colors hover:bg-[var(--surface-container-low)]">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-[var(--primary)]">{hotel.name}</p>
                    <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{hotel.timezone ?? "Asia/Saigon"}</p>
                  </td>
                  <td className="px-5 py-4 text-[var(--on-surface-variant)]">{hotel.code ?? hotel.id}</td>
                  <td className="px-5 py-4 text-[var(--on-surface-variant)]">{formatDate(hotel.updatedAt ?? hotel.createdAt)}</td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/owner/hotels/${hotel.id}/rooms`}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-low)]"
                    >
                      <VsIcon name="bed" className="text-[16px]" />
                      Mở phòng
                    </Link>
                  </td>
                </tr>
              ))}
              {hotels.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-[var(--on-surface-variant)]">
                    Chưa có khách sạn để quản lý phòng.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </OwnerShell>
  );
}
