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
        {
          reservationId: string;
          targetRoomId: string;
          mode?: "MOVE" | "SWAP";
          expectedUpdatedAt: string;
          swapWithReservationId?: string;
          swapExpectedUpdatedAt?: string;
          body?: UpdateReservationPlacementInput;
        }
      >): Promise<unknown> =>
        roomPlanRepository.updatePlacement(
          scope.hotelId,
          variables.reservationId,
          variables.body ?? {
            targetRoomId: variables.targetRoomId,
            expectedUpdatedAt: variables.expectedUpdatedAt,
            swapWithReservationId: variables.swapWithReservationId,
            swapExpectedUpdatedAt: variables.swapExpectedUpdatedAt,
          },
        ),
    }),
    extendStay: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        { hotelId: string },
        {
          stayId: string;
          plannedCheckOutAt: string;
          newEndDate?: string;
        }
      >): Promise<unknown> =>
        roomPlanRepository.extendStay(
          scope.hotelId,
          variables.stayId,
          variables.plannedCheckOutAt,
        ),
    }),
    updateReservationDates: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        { hotelId: string },
        {
          reservationId: string;
          startDate: string;
          endDate: string;
          expectedUpdatedAt: string;
        }
      >): Promise<unknown> =>
        roomPlanRepository.updateReservationDates(
          scope.hotelId,
          variables.reservationId,
          {
            startDate: variables.startDate,
            endDate: variables.endDate,
            expectedUpdatedAt: variables.expectedUpdatedAt,
          },
        ),
    }),
  },
});
