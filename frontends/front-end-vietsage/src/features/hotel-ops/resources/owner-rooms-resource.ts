import {
  createResource,
  defineQuery,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import {
  ownerRoomsRepository,
  type OwnerRoomsListInput,
} from "@/features/hotel-ops/repositories/owner-rooms-repository";
import type {
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export const ownerRoomsResource = createResource<{ hotelId: string }>()({
  namespace: ["vietsage"],
  name: "owner-rooms",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    list: defineQuery({
      inputKey: (input?: OwnerRoomsListInput) => [
        input?.q ?? "",
        input?.status ?? "",
        input?.type ?? "",
        input?.floor ?? "",
        input?.vipOnly ?? false,
        input?.page ?? 1,
        input?.limit ?? 100,
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        OwnerRoomsListInput | void
      >): Promise<HotelOpsPage<HotelRoomSummary>> =>
        ownerRoomsRepository.list(scope.hotelId, input || undefined, signal),
    }),
  },
});
