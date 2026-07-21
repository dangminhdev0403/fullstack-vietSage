import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import type { Hotel } from "@/features/admin/types/admin-contract";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { VsIcon } from "../../../../_components/vs-icon";
import { ownerAccessMessage } from "../../../_components/owner-auth";
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
    const callbackUrl = `/owner/hotels/${hotelId}` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  
  let sidebarItems: DashboardNavItem[];
  let hotel: Hotel | null;

  try {
    [hotel] = await Promise.all([
      authorizedApi("get owner visible hotel", (accessToken) => getOwnerVisibleHotel(hotelId, accessToken)),
    ]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }

    return (
      <>
        <section className="rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-sm text-[var(--on-surface-variant)]">
          {ownerAccessMessage(error)}
        </section>
      </>
    );
  }

  if (!hotel) {
    notFound();
  }

  return (
    <>
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--secondary)]">KHÁCH SẠN</p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--primary)]">{hotel.name}</h1>
        <p className="mt-2 max-w-3xl text-base text-[var(--on-surface-variant)]">
          Cập nhật cấu hình vận hành cơ bản. Giao diện chủ khách sạn không gửi tenantId.
        </p>
      </header>

      <OwnerHotelDetailClient hotel={hotel} />
    </>
  );
}
