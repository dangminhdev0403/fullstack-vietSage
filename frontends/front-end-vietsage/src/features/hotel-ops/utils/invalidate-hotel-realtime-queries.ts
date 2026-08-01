import type { QueryClient } from "@tanstack/react-query";
import { staffRoomsResource } from "@/features/hotel-ops/resources/staff-rooms-resource";
import { ownerRoomsResource } from "@/features/hotel-ops/resources/owner-rooms-resource";

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
  ]);
}
