import type { QueryClient } from "@tanstack/react-query";
import { staffRoomsResource } from "../resources/staff-rooms-resource";
import { ownerRoomsResource } from "../resources/owner-rooms-resource";
import { localPartnersResource } from "@/features/local-partners/resources/local-partners-resource";
import { channelManagerResource } from "@/features/channel-manager/api/channel-manager.resource";

export async function invalidateHotelRequestRealtimeQueries(
  queryClient: QueryClient,
  hotelId: string,
): Promise<void> {
  if (!hotelId) return;

  const localPartnersBound = localPartnersResource.bind({ hotelId });

  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: ["hotel-requests", hotelId], refetchType: "active" }),
    queryClient.invalidateQueries({ queryKey: ["owner-requests", hotelId], refetchType: "active" }),
    localPartnersBound.queries.marketplaceOrders.invalidateAll(queryClient),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "local-partners", "hotel", hotelId],
      refetchType: "all",
    }),
    queryClient.invalidateQueries({
      queryKey: ["hotel-ops", hotelId, "messages", "unread-summary"],
      refetchType: "all",
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
  const localPartnersBound = localPartnersResource.bind({ hotelId });
  const cmAdminBound = channelManagerResource.bind({ hotelId, roleScope: "admin" });
  const cmOwnerBound = channelManagerResource.bind({ hotelId, roleScope: "owner" });

  await Promise.allSettled([
    staffBound.queries.list.invalidateAll(queryClient),
    ownerBound.queries.list.invalidateAll(queryClient),
    localPartnersBound.queries.marketplaceOrders.invalidateAll(queryClient),
    cmAdminBound.queries.inventoryGrid.invalidateAll(queryClient),
    cmOwnerBound.queries.inventoryGrid.invalidateAll(queryClient),
    cmAdminBound.invalidate(queryClient),
    cmOwnerBound.invalidate(queryClient),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "hotel", hotelId],
      refetchType: "all",
    }),
    queryClient.invalidateQueries({
      queryKey: ["hotel-ops", hotelId],
      refetchType: "all",
    }),
    queryClient.invalidateQueries({
      queryKey: ["hotel-requests", hotelId],
      refetchType: "all",
    }),
    queryClient.invalidateQueries({
      queryKey: ["owner-requests", hotelId],
      refetchType: "all",
    }),
    queryClient.invalidateQueries({
      queryKey: ["channel-manager", hotelId],
      refetchType: "all",
    }),
    queryClient.refetchQueries({
      queryKey: ["vietsage", "hotel", hotelId],
      type: "active",
    }),
  ]);
}
