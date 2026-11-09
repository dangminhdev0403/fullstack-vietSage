import type { QueryClient } from "@tanstack/react-query";
import { requestQueueResource } from "../resources/request-queue-resource";
import { staffRoomsResource } from "../resources/staff-rooms-resource";
import { ownerRoomsResource } from "../resources/owner-rooms-resource";
import { ownerRoomTypesResource } from "../resources/owner-room-types-resource";
import { roomPlanResource } from "../resources/room-plan-resource";
import { hotelMessagesResource } from "../resources/hotel-messages-resource";
import { localPartnersResource } from "@/features/local-partners/resources/local-partners-resource";
import { channelManagerResource } from "@/features/channel-manager/api/channel-manager.resource";
import { housekeepingResource } from "@/features/housekeeping/resources/housekeeping-resource";

const RESOURCE_KEY_PREFIXES = [
  ["rooms"],
  ["front-desk"],
  ["billing"],
  ["housekeeping"],
  ["owner-hotels"],
  ["requests"],
  ["guest-os"],
] as const;

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
    requestQueueResource.bind({
      basePath: `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/requests`,
    }).queries.detail.invalidateAll(queryClient),
    localPartnersBound.queries.marketplaceOrders.invalidateAll(queryClient),
    messagesBound.invalidate(queryClient),
    queryClient.invalidateQueries({
      queryKey: ["requests"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["hotel-requests"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["marketplace-orders"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "local-partners"],
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: ["vietsage", "request-queue"],
      refetchType: "active",
    }),
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
    requestQueueResource.bind({
      basePath: `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/requests`,
    }).queries.detail.invalidateAll(queryClient),
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
    ...RESOURCE_KEY_PREFIXES.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey: [...queryKey],
        refetchType: "active",
      }),
    ),
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
    requestQueueResource.bind({
      basePath: `/api/hotel-ops/hotels/${encodeURIComponent(hotelId)}/requests`,
    }).queries.detail.invalidateAll(queryClient),
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
    ...RESOURCE_KEY_PREFIXES.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey: [...queryKey],
        refetchType: "active",
      }),
    ),
    staffBound.invalidate(queryClient),
    ownerBound.invalidate(queryClient),
    roomPlanBound.invalidate(queryClient),
    housekeepingBound.invalidate(queryClient),
  ]);
}
