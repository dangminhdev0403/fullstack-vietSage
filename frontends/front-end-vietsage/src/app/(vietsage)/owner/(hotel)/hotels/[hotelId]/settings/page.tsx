import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import type { Hotel } from "@/features/admin/types/admin-contract";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { loadServerWorkspaceContext } from "@/libs/server-workspace-context";
import { ownerAccessMessage } from "@/app/(vietsage)/owner/_components/owner-auth";

import { collectCatalogPages, getOwnerSettingsTabs } from "@/features/owner/utils/owner-settings";

import { OwnerHotelSettingsClient } from "./owner-hotel-settings-client";

type PageProps = {
  params: Promise<{ hotelId: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export const dynamic = "force-dynamic";

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

  const availableTabs = getOwnerSettingsTabs(context.permissions);
  const requestedTab = resolvedSearchParams?.tab?.toLowerCase();
  const activeTab = availableTabs.find((tab) => tab === requestedTab) ?? availableTabs[0];
  if (!activeTab) return <p className="text-base">Bạn chưa được cấp quyền xem các mục thiết lập khách sạn.</p>;

  let hotel: Hotel | null = null;
  let roomsPage;
  let categoriesPage;
  let itemsPage;

  try {
    [hotel, roomsPage, categoriesPage, itemsPage] = await Promise.all([
      authorizedApi("get owner hotel", (accessToken) =>
        adminService.getHotel(hotelId, accessToken),
      ),
      activeTab === "rooms" ? authorizedApi("list owner rooms", (accessToken) =>
        hotelOpsService.listRooms(hotelId, {
          query: { page: 1, limit: 100 },
          accessToken,
        }),
      ) : Promise.resolve({ items: [] }),
      activeTab === "services" ? authorizedApi("list owner service categories", (accessToken) =>
        collectCatalogPages((page) => hotelOpsService.listServiceCategories(hotelId, {
          query: { page, limit: 100 },
          accessToken,
        })),
      ) : Promise.resolve([]),
      activeTab === "services" ? authorizedApi("list owner service items", (accessToken) =>
        collectCatalogPages((page) => hotelOpsService.listServiceItems(hotelId, {
          query: { page, limit: 100 },
          accessToken,
        })),
      ) : Promise.resolve([]),
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
  const tenantId = hotel.tenantId ?? currentAccessibleHotel?.tenantId ?? null;

  return (
    <OwnerHotelSettingsClient
      availableTabs={availableTabs}
      activeTab={activeTab}
      canManageTemplate={context.permissions.includes("hotel.reservations.manage")}
      canManageServices={context.permissions.includes("hotel.services.manage")}
      canViewKbtt={context.permissions.some((p) => ["hotel.kbtt.view", "hotel.kbtt.manage"].includes(p))}
      canViewChannels={context.permissions.some((p) => ["hotel.channels.view", "hotel.channels.manage"].includes(p))}
      hotelId={hotelId}
      hotel={hotel}
      tenantId={tenantId}
      initialRooms={roomsPage.items}
      initialCategories={categoriesPage}
      initialItems={itemsPage}
      canManageStaff={context.permissions.includes("hotel.staff.manage")}
      canManagePartners={context.permissions.includes("hotel.local-partners.manage")}
      canManageKbtt={context.permissions.includes("hotel.kbtt.manage")}
      canManageChannels={context.permissions.includes("hotel.channels.manage")}
    />
  );
}
