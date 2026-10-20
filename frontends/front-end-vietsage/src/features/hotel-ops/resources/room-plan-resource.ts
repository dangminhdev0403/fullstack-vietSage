import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import {
  roomPlanRepository,
  type RoomPlanQueryInput,
} from "@/features/hotel-ops/repositories/room-plan-repository";
import type {
  RoomPlanResponse,
  UpdateReservationPlacementInput,
} from "@/features/hotel-ops/types/hotel-ops-contract";

export const roomPlanResource = createResource<{ hotelId: string }>()({
  namespace: ["vietsage"],
  name: "room-plan",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    plan: defineQuery({
      inputKey: (input: RoomPlanQueryInput) => [input.from, input.to],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<
        { hotelId: string },
        RoomPlanQueryInput
      >): Promise<RoomPlanResponse> =>
        roomPlanRepository.getRoomPlan(scope.hotelId, input, signal),
    }),
  },
  mutations: {
    updatePlacement: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        { hotelId: string },
        { reservationId: string; body: UpdateReservationPlacementInput }
      >): Promise<unknown> =>
        roomPlanRepository.updatePlacement(scope.hotelId, variables.reservationId, variables.body),
    }),
  },
});
