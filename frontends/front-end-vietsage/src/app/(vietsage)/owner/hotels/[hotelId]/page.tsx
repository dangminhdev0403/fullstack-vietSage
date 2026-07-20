import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import type { Hotel } from "@/features/admin/types/admin-contract";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";
import { readServerSessionTokens } from "@/lib/server-session-tokens";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

import { VsIcon } from "../../../_components/vs-icon";
import { ownerAccessMessage } from "../../_components/owner-auth";
import { OwnerShell } from "../../_components/owner-shell";
import { OwnerHotelDetailClient } from "./owner-hotel-detail-client";

type OwnerHotelPageProps = {
  params: Promise<{ hotelId: string }> | { hotelId: string };
};

export const dynamic = "force-dynamic";

async function getOwnerVisibleHotel(hotelId: string, accessToken: string | undefined): Promise<Hotel | null> {
  const hotelsPage = await adminService.listHotels({
    query: { page: 1, limit: 100 },
    accessToken,
  });

  return hotelsPage.items.find((item) => item.id === hotelId) ?? null;
}

export default async function OwnerHotelPage({ params }: OwnerHotelPageProps) {
  const { hotelId } = await Promise.resolve(params);
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const callbackUrl = `/owner/hotels/${hotelId}` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const workspaceContext = await loadServerWorkspaceContext(callbackUrl, tokens.accessToken);

  let sidebarItems: DashboardNavItem[];
  let hotel: Hotel | null;

  try {
    [sidebarItems, hotel] = await Promise.all([
      Promise.resolve(buildWorkspaceNavigationForContext({ ...workspaceContext, hotelId })),
      authorizedApi("get owner visible hotel", (accessToken) => getOwnerVisibleHotel(hotelId, accessToken)),
    ]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }

    return (
      <OwnerShell activePath={callbackUrl} navItems={[]} subtitle="Thông tin khách sạn">
        <section className="rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-sm text-[var(--on-surface-variant)]">
          {ownerAccessMessage(error)}
        </section>
      </OwnerShell>
    );
  }

  if (!hotel) {
    notFound();
  }

  return (
    <OwnerShell activePath={callbackUrl} navItems={sidebarItems} subtitle="Thông tin khách sạn">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">KHÁCH SẠN</p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">{hotel.name}</h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
          Cập nhật cấu hình vận hành cơ bản. Giao diện chủ khách sạn không gửi tenantId.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        {sidebarItems.filter((item) => item.key.startsWith("owner.hotel.") && item.key !== "owner.hotel.overview").map((item) => (
          <Link key={item.href} href={item.href} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--surface-container)]">
            <VsIcon name={item.icon} className="text-[20px]" />
            {item.label}
          </Link>
        ))}
      </section>

      <OwnerHotelDetailClient hotel={hotel} />
    </OwnerShell>
  );
}
