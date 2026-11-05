import type { QueryClient } from "@tanstack/react-query";
import { staffRoomsResource } from "../resources/staff-rooms-resource";
import { ownerRoomsResource } from "../resources/owner-rooms-resource";
import { ownerRoomTypesResource } from "../resources/owner-room-types-resource";
import { roomPlanResource } from "../resources/room-plan-resource";
import { hotelMessagesResource } from "../resources/hotel-messages-resource";
import { localPartnersResource } from "@/features/local-partners/resources/local-partners-resource";
import { channelManagerResource } from "@/features/channel-manager/api/channel-manager.resource";
import { housekeepingResource } from "@/features/housekeeping/resources/housekeeping-resource";

export async function invalidateHotelMessageRealtimeQueries(
  queryClient: QueryClient,
  hotelId: string,
): Promise<void> {
  if (!hotelId) return;

  const messagesBound = hotelMessagesResource.bind({ hotelId });
  await messagesBound.invalidate(queryClient);
}

export async function invalidateHotelRequestRealtimeQueries(
  queryClient: QueryClient,
  hotelId: string,
): Promise<void> {
  if (!hotelId) return;

  const localPartnersBound = localPartnersResource.bind({ hotelId });
  const messagesBound = hotelMessagesResource.bind({ hotelId });

  await Promise.allSettled([
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "request-queue"],
      refetchType: "active",
    }),
    localPartnersBound.queries.marketplaceOrders.invalidateAll(queryClient),
    messagesBound.invalidate(queryClient),
  ]);
}

export async function invalidateHotelHousekeepingRealtimeQueries(
  queryClient: QueryClient,
  hotelId: string,
): Promise<void> {
  if (!hotelId) return;

  const staffBound = staffRoomsResource.bind({ hotelId });
  const ownerBound = ownerRoomsResource.bind({ hotelId });
  const roomPlanBound = roomPlanResource.bind({ hotelId });
  const housekeepingBound = housekeepingResource.bind({ hotelId });

  await Promise.allSettled([
    staffBound.queries.list.invalidateAll(queryClient),
    staffBound.queries.allRooms.invalidateAll(queryClient),
    ownerBound.queries.list.invalidateAll(queryClient),
    roomPlanBound.queries.plan.invalidateAll(queryClient),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "request-queue"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["housekeeping"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["housekeeping-tasks"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["hotels", hotelId, "housekeeping"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["hotels", hotelId, "rooms"],
      refetchType: "active",
    }),
    staffBound.invalidate(queryClient),
    ownerBound.invalidate(queryClient),
    roomPlanBound.invalidate(queryClient),
    housekeepingBound.invalidate(queryClient),
  ]);
}

export async function invalidateHotelRealtimeQueries(
  queryClient: QueryClient,
  hotelId: string,
): Promise<void> {
  if (!hotelId) return;

  const staffBound = staffRoomsResource.bind({ hotelId });
  const ownerBound = ownerRoomsResource.bind({ hotelId });
  const roomTypesBound = ownerRoomTypesResource.bind({ hotelId });
  const roomPlanBound = roomPlanResource.bind({ hotelId });
  const housekeepingBound = housekeepingResource.bind({ hotelId });
  const localPartnersBound = localPartnersResource.bind({ hotelId });
  const messagesBound = hotelMessagesResource.bind({ hotelId });
  const cmAdminBound = channelManagerResource.bind({ hotelId, roleScope: "admin" });
  const cmOwnerBound = channelManagerResource.bind({ hotelId, roleScope: "owner" });

  await Promise.allSettled([
    roomTypesBound.invalidate(queryClient),
    localPartnersBound.queries.marketplaceOrders.invalidateAll(queryClient),
    messagesBound.invalidate(queryClient),
    cmAdminBound.queries.inventoryGrid.invalidateAll(queryClient),
    cmOwnerBound.queries.inventoryGrid.invalidateAll(queryClient),
    cmAdminBound.queries.simulatedBookings.invalidateAll(queryClient),
    cmOwnerBound.queries.simulatedBookings.invalidateAll(queryClient),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "request-queue"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["housekeeping"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["housekeeping-tasks"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["hotels", hotelId, "housekeeping"],
      refetchType: "active",
    }),
    staffBound.invalidate(queryClient),
    ownerBound.invalidate(queryClient),
    roomPlanBound.invalidate(queryClient),
    housekeepingBound.invalidate(queryClient),
  ]);
}
