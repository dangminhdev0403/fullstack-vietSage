import type { QueryClient } from "@tanstack/react-query";
import { staffRoomsResource } from "../resources/staff-rooms-resource";
import { ownerRoomsResource } from "../resources/owner-rooms-resource";
import { roomPlanResource } from "../resources/room-plan-resource";
import { localPartnersResource } from "@/features/local-partners/resources/local-partners-resource";
import { channelManagerResource } from "@/features/channel-manager/api/channel-manager.resource";

export async function invalidateHotelMessageRealtimeQueries(
  queryClient: QueryClient,
  hotelId: string,
): Promise<void> {
  if (!hotelId) return;

  await queryClient.invalidateQueries({
    queryKey: ["vietsage", "hotel", hotelId, "hotel-messages"],
    refetchType: "active",
  });
}

export async function invalidateHotelRequestRealtimeQueries(
  queryClient: QueryClient,
  hotelId: string,
): Promise<void> {
  if (!hotelId) return;

  const localPartnersBound = localPartnersResource.bind({ hotelId });

  await Promise.allSettled([
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "request-queue"],
      refetchType: "active",
    }),
    localPartnersBound.queries.marketplaceOrders.invalidateAll(queryClient),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "hotel", hotelId, "hotel-messages"],
      refetchType: "active",
    }),
  ]);
}

export async function invalidateHotelRealtimeQueries(
  queryClient: QueryClient,
  hotelId: string,
): Promise<void> {
  if (!hotelId) return;

  const staffBound = staffRoomsResource.bind({ hotelId });
  const ownerBound = ownerRoomsResource.bind({ hotelId });
  const roomPlanBound = roomPlanResource.bind({ hotelId });
  const localPartnersBound = localPartnersResource.bind({ hotelId });
  const cmAdminBound = channelManagerResource.bind({ hotelId, roleScope: "admin" });
  const cmOwnerBound = channelManagerResource.bind({ hotelId, roleScope: "owner" });

  await Promise.allSettled([
    staffBound.queries.list.invalidateAll(queryClient),
    ownerBound.queries.list.invalidateAll(queryClient),
    roomPlanBound.queries.plan.invalidateAll(queryClient),
    localPartnersBound.queries.marketplaceOrders.invalidateAll(queryClient),
    cmAdminBound.queries.inventoryGrid.invalidateAll(queryClient),
    cmOwnerBound.queries.inventoryGrid.invalidateAll(queryClient),
    cmAdminBound.queries.simulatedBookings.invalidateAll(queryClient),
    cmOwnerBound.queries.simulatedBookings.invalidateAll(queryClient),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "request-queue"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "hotel", hotelId],
      refetchType: "active",
    }),
  ]);
}
