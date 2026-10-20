import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import {
  staffRoomsRepository,
  type StaffRoomsListInput,
  type StayFolioContext,
} from "@/features/hotel-ops/repositories/staff-rooms-repository";
import type {
  BulkReservationInput,
  BulkReservationResult,
  HotelOpsPage,
  HotelRoomSummary,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export const staffRoomsResource = createResource<{ hotelId: string }>()({
  namespace: ["vietsage"],
  name: "staff-rooms",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    list: defineQuery({
      inputKey: (input?: StaffRoomsListInput) => [
        input?.q ?? "",
        input?.status ?? "",
        input?.type ?? "",
        input?.floor ?? "",
        input?.zone ?? "",
        input?.vipOnly ?? false,
        input?.businessDate ?? "",
        input?.page ?? 1,
        input?.limit ?? 50,
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        StaffRoomsListInput | void
      >): Promise<HotelOpsPage<HotelRoomSummary>> =>
        staffRoomsRepository.list(scope.hotelId, input || undefined, signal),
    }),
    stayFolio: defineQuery({
      inputKey: (stayId: string) => [stayId],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        string
      >): Promise<StayFolioContext> =>
        staffRoomsRepository.getStayFolioContext(scope.hotelId, input, signal),
    }),
  },
  mutations: {
    createBulkReservations: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        { hotelId: string },
        BulkReservationInput
      >): Promise<BulkReservationResult> =>
        staffRoomsRepository.createBulkReservations(scope.hotelId, variables),
      invalidates: [{ type: "query", operation: "list" }],
    }),
  },
});
