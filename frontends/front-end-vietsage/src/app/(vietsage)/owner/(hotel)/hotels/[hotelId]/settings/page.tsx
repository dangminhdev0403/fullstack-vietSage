import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import type { Hotel } from "@/features/admin/types/admin-contract";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { ownerAccessMessage } from "@/app/(vietsage)/owner/_components/owner-auth";

import { OwnerHotelSettingsClient } from "./owner-hotel-settings-client";

type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export const dynamic = "force-dynamic";

async function getOwnerVisibleHotel(
  hotelId: string,
  accessToken: string | undefined,
): Promise<Hotel | null> {
  const hotelsPage = await adminService.listHotels({
    query: { page: 1, limit: 100 },
    accessToken,
  });

  return hotelsPage.items.find((item) => item.id === hotelId) ?? null;
}

export default async function OwnerHotelSettingsPage({ params, searchParams }: PageProps) {
  const { hotelId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  if (resolvedSearchParams?.tab?.toLowerCase() === "profile") {
    redirect(`/owner/hotels/${encodeURIComponent(hotelId)}/profile`);
  }
  const session = await auth();
  const callbackUrl = `/owner/hotels/${encodeURIComponent(hotelId)}/settings` as const;
  const authorizedApi = createAuthorizedApiExecutor({ session, callbackUrl });
  const context = await loadServerWorkspaceContext(callbackUrl);

  let hotel: Hotel | null = null;
  let roomsPage;
  let categoriesPage;
  let itemsPage;

  try {
    [hotel, roomsPage, categoriesPage, itemsPage] = await Promise.all([
      authorizedApi("get owner hotel", (accessToken) =>
        getOwnerVisibleHotel(hotelId, accessToken),
      ),
      authorizedApi("list owner rooms", (accessToken) =>
        hotelOpsService.listRooms(hotelId, {
          query: { page: 1, limit: 100 },
          accessToken,
        }),
      ),
      authorizedApi("list owner service categories", (accessToken) =>
        hotelOpsService.listServiceCategories(hotelId, {
          query: { page: 1, limit: 100 },
          accessToken,
        }),
      ),
      authorizedApi("list owner service items", (accessToken) =>
        hotelOpsService.listServiceItems(hotelId, {
          query: { page: 1, limit: 100 },
          accessToken,
        }),
      ),
    ]);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }

    return (
      <section className="rounded-xl border border-[var(--outline-variant)] bg-white p-6 text-sm text-[var(--on-surface-variant)]">
        {ownerAccessMessage(error)}
      </section>
    );
  }

  if (!hotel) {
    notFound();
  }

  const currentAccessibleHotel = context.accessibleHotels.find((h) => h.id === hotelId);
  const tenantId = currentAccessibleHotel?.tenantId ?? context.tenants[0]?.id ?? null;

  return (
    <OwnerHotelSettingsClient
      hotelId={hotelId}
      hotel={hotel}
      tenantId={tenantId}
      initialRooms={roomsPage.items}
      initialCategories={categoriesPage.items}
      initialItems={itemsPage.items}
      canManageStaff={context.permissions.includes("hotel.staff.manage")}
      canManagePartners={context.permissions.includes("hotel.local-partners.manage")}
      canManageKbtt={context.permissions.includes("hotel.kbtt.manage")}
      canManageChannels={context.permissions.includes("hotel.channels.manage")}
    />
  );
}
