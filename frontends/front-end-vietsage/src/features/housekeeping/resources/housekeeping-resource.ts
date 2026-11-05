import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import {
  housekeepingRepository,
  type ListTasksParams,
  type ListRequestsParams,
  type ListRoomsParams,
  type TaskVersionInput,
  type UpdateRequestStatusInput,
} from "../repositories/housekeeping-repository";
import type {
  HotelOpsPage,
  HotelRoomSummary,
  HousekeepingTask,
  HousekeepingTaskPage,
  HousekeepingTasksSummary,
  StaffRequestListItem,
} from "../types/housekeeping-contract";

type HousekeepingScope = {
  hotelId: string;
};

export const housekeepingResource = createResource<HousekeepingScope>()({
  namespace: ["vietsage"],
  name: "housekeeping",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    tasks: defineQuery<HousekeepingScope, ListTasksParams | undefined, HousekeepingTaskPage>({
      inputKey: (params) => [
        params?.page ?? 1,
        params?.limit ?? 100,
        params?.status ?? "",
        params?.priority ?? "",
        params?.roomId ?? "",
        params?.assignedToUserId ?? "",
      ],
      queryFn: ({ scope, input, signal }) => housekeepingRepository.listTasks(scope.hotelId, input, signal),
    }),
    summary: defineQuery<HousekeepingScope, undefined, HousekeepingTasksSummary>({
      inputKey: () => [],
      queryFn: ({ scope, signal }) => housekeepingRepository.getTasksSummary(scope.hotelId, signal),
    }),
    rooms: defineQuery<HousekeepingScope, ListRoomsParams | undefined, HotelOpsPage<HotelRoomSummary>>({
      inputKey: (params) => [
        params?.page ?? 1,
        params?.limit ?? 100,
        params?.status ?? "",
        params?.floor ?? "",
        params?.q ?? "",
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<HousekeepingScope, ListRoomsParams | undefined>) =>
        housekeepingRepository.listRooms(scope.hotelId, input, signal),
    }),
    requests: defineQuery<HousekeepingScope, ListRequestsParams | undefined, HotelOpsPage<StaffRequestListItem>>({
      inputKey: (params) => [
        params?.page ?? 1,
        params?.limit ?? 20,
        params?.status ?? "",
        params?.priority ?? "",
        params?.roomNumber ?? "",
      ],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<HousekeepingScope, ListRequestsParams | undefined>) =>
        housekeepingRepository.listRequests(scope.hotelId, input, signal),
    }),
  },
  mutations: {
    claimTask: defineMutation<HousekeepingScope, { taskId: string } & TaskVersionInput, HousekeepingTask>({
      mutationFn: ({ scope, variables }) => housekeepingRepository.claimTask(scope.hotelId, variables.taskId, { expectedVersion: variables.expectedVersion }),
    }),
    startTask: defineMutation<HousekeepingScope, { taskId: string } & TaskVersionInput, HousekeepingTask>({
      mutationFn: ({ scope, variables }) => housekeepingRepository.startTask(scope.hotelId, variables.taskId, { expectedVersion: variables.expectedVersion }),
    }),
    blockTask: defineMutation<HousekeepingScope, { taskId: string; reason: string; notes?: string } & TaskVersionInput, HousekeepingTask>({
      mutationFn: ({ scope, variables }) => housekeepingRepository.blockTask(scope.hotelId, variables.taskId, { reason: variables.reason, notes: variables.notes, expectedVersion: variables.expectedVersion }),
    }),
    completeTask: defineMutation<HousekeepingScope, { taskId: string; notes?: string } & TaskVersionInput, HousekeepingTask>({
      mutationFn: ({ scope, variables }) => housekeepingRepository.completeTask(scope.hotelId, variables.taskId, { notes: variables.notes, expectedVersion: variables.expectedVersion }),
    }),
    reopenTask: defineMutation<HousekeepingScope, { taskId: string; reason?: string } & TaskVersionInput, HousekeepingTask>({
      mutationFn: ({ scope, variables }) => housekeepingRepository.reopenTask(scope.hotelId, variables.taskId, { reason: variables.reason, expectedVersion: variables.expectedVersion }),
    }),
    confirmRoomReady: defineMutation<
      HousekeepingScope,
      { roomId: string; expectedUpdatedAt: string },
      HotelRoomSummary
    >({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { roomId: string; expectedUpdatedAt: string }
      >) =>
        housekeepingRepository.confirmRoomReady(
          scope.hotelId,
          variables.roomId,
          variables.expectedUpdatedAt,
        ),
    }),
    updateRoomStatus: defineMutation<
      HousekeepingScope,
      { roomId: string; status: string },
      HotelRoomSummary
    >({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { roomId: string; status: string }
      >) =>
        housekeepingRepository.updateRoomStatus(
          scope.hotelId,
          variables.roomId,
          variables.status,
        ),
    }),
    updateRequestStatus: defineMutation<
      HousekeepingScope,
      { requestId: string } & UpdateRequestStatusInput,
      StaffRequestListItem
    >({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { requestId: string } & UpdateRequestStatusInput
      >) => {
        const { requestId, ...payload } = variables;
        return housekeepingRepository.updateRequestStatus(
          scope.hotelId,
          requestId,
          payload,
        );
      },
    }),
  },
});
