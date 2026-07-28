import {
  createResource,
  defineQuery,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import { ownerRoomsRepository } from "@/features/hotel-ops/repositories/owner-rooms-repository";
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
      inputKey: () => [],
      queryFn: ({
        scope,
        signal,
      }: ResourceQueryContext<{ hotelId: string }, void>): Promise<
        HotelOpsPage<HotelRoomSummary>
      > => ownerRoomsRepository.list(scope.hotelId, signal),
    }),
  },
});
