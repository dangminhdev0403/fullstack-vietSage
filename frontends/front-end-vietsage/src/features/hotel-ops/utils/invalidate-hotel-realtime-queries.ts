import type { QueryClient } from "@tanstack/react-query";
import { staffRoomsResource } from "../resources/staff-rooms-resource";
import { ownerRoomsResource } from "../resources/owner-rooms-resource";

export async function invalidateHotelRequestRealtimeQueries(
  queryClient: QueryClient,
  hotelId: string,
): Promise<void> {
  if (!hotelId) return;

  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: ["hotel-requests", hotelId] }),
    queryClient.invalidateQueries({ queryKey: ["owner-requests", hotelId] }),
    queryClient.invalidateQueries({
      queryKey: ["hotel-ops", hotelId, "messages", "unread-summary"],
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

  await Promise.allSettled([
    // Resource-based query invalidations using @dangminhdev04032005/query-resource helpers
    staffBound.queries.list.invalidateAll(queryClient),
    ownerBound.queries.list.invalidateAll(queryClient),
    // Scope key prefixes for broader matching
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "staff-rooms", "hotel", hotelId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "owner-rooms", "hotel", hotelId],
    }),
    // Legacy / string-based query keys
    queryClient.invalidateQueries({ queryKey: ["hotel-ops", hotelId] }),
    queryClient.invalidateQueries({ queryKey: ["hotel-requests", hotelId] }),
    queryClient.invalidateQueries({ queryKey: ["owner-requests", hotelId] }),
    queryClient.invalidateQueries({ queryKey: ["biometric-workstations", hotelId] }),
    queryClient.invalidateQueries({ queryKey: ["owner-hotels"] }),
    queryClient.invalidateQueries({ queryKey: ["platform-billing"] }),
    queryClient.invalidateQueries({ queryKey: ["owner-analytics"] }),
    queryClient.invalidateQueries({ queryKey: ["owner-saas-billing"] }),
    queryClient.invalidateQueries({
      queryKey: ["hotel-ops", hotelId, "messages", "unread-summary"],
    }),
  ]);
}
