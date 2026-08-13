import type { QueryClient } from "@tanstack/react-query";
import { staffRoomsResource } from "../resources/staff-rooms-resource";
import { ownerRoomsResource } from "../resources/owner-rooms-resource";
import { localPartnersResource } from "@/features/local-partners/resources/local-partners-resource";

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
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["hotel-ops", hotelId, "messages", "unread-summary"],
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
  const localPartnersBound = localPartnersResource.bind({ hotelId });

  await Promise.allSettled([
    staffBound.queries.list.invalidateAll(queryClient),
    ownerBound.queries.list.invalidateAll(queryClient),
    localPartnersBound.queries.marketplaceOrders.invalidateAll(queryClient),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "local-partners", "hotel", hotelId],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "staff-rooms", "hotel", hotelId],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "owner-rooms", "hotel", hotelId],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({ queryKey: ["hotel-ops", hotelId], refetchType: "active" }),
    queryClient.invalidateQueries({ queryKey: ["hotel-requests", hotelId], refetchType: "active" }),
    queryClient.invalidateQueries({ queryKey: ["owner-requests", hotelId], refetchType: "active" }),
    queryClient.invalidateQueries({
      queryKey: ["hotel-ops", hotelId, "messages", "unread-summary"],
      refetchType: "active",
    }),
  ]);
}
