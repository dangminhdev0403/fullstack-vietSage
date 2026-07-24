import {
  createResource,
  defineQuery,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import {
  staffRoomsRepository,
  type StaffRoomsListInput,
} from "@/features/hotel-ops/repositories/staff-rooms-repository";
import type {
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export const staffRoomsResource = createResource<{ hotelId: string }>()({
  namespace: ["vietsage"],
  name: "staff-rooms",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    list: defineQuery({
      inputKey: (input: StaffRoomsListInput) => [input],
      queryFn: ({ scope, input, signal }: ResourceQueryContext<
        { hotelId: string },
        StaffRoomsListInput
      >): Promise<HotelOpsPage<HotelRoomSummary>> =>
        staffRoomsRepository.list(scope.hotelId, input, signal),
    }),
  },
});
