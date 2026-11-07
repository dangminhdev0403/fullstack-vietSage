import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
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
  HousekeepingAssignmentScope,
  HousekeepingRoom,
  HousekeepingTask,
  HousekeepingTaskPage,
  HousekeepingTasksSummary,
  StaffRequestListItem,
} from "../types/housekeeping-contract";

type HousekeepingScope = {
  hotelId: string;
};

const taskAndRoomInvalidates = [
  { type: "query", operation: "tasks" },
  { type: "query", operation: "summary" },
  { type: "query", operation: "rooms" },
  { type: "query", operation: "room" },
] as const;

const requestInvalidates = [
  { type: "query", operation: "requests" },
] as const;

export const housekeepingResource = createResource<HousekeepingScope>()({
  namespace: ["vietsage"],
  name: "housekeeping",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    assignmentScope: defineQuery<HousekeepingScope, undefined, HousekeepingAssignmentScope>({
      inputKey: () => [],
      queryFn: ({ scope, signal }) => housekeepingRepository.getScope(scope.hotelId, signal),
    }),
    room: defineQuery<HousekeepingScope, string, HousekeepingRoom>({
      inputKey: (roomId) => [roomId],
      queryFn: ({ scope, input, signal }) => housekeepingRepository.getRoom(scope.hotelId, input, signal),
    }),
    tasks: defineQuery<HousekeepingScope, ListTasksParams | undefined, HousekeepingTaskPage>({
      inputKey: (params) => [
        params?.page ?? 1,
        params?.limit ?? 100,
        params?.status ?? "",
        params?.priority ?? "",
        params?.roomId ?? "",
        params?.assignedToUserId ?? "",
      ],
      queryFn: ({ scope, input, signal }) => housekeepingRepository.listAllTasks(scope.hotelId, input, signal),
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
        housekeepingRepository.listAllRooms(scope.hotelId, input, signal),
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
        housekeepingRepository.listActiveRequests(scope.hotelId, input, signal),
    }),
  },
  mutations: {
    claimTask: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { taskId: string } & TaskVersionInput
      >): Promise<HousekeepingTask> =>
        housekeepingRepository.claimTask(scope.hotelId, variables.taskId, {
          expectedVersion: variables.expectedVersion,
        }),
      invalidates: taskAndRoomInvalidates,
    }),
    assignCleaner: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { taskId: string } & TaskVersionInput
      >): Promise<HousekeepingTask> =>
        housekeepingRepository.claimTask(scope.hotelId, variables.taskId, {
          expectedVersion: variables.expectedVersion,
        }),
      invalidates: taskAndRoomInvalidates,
    }),
    startTask: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { taskId: string } & TaskVersionInput
      >): Promise<HousekeepingTask> =>
        housekeepingRepository.startTask(scope.hotelId, variables.taskId, {
          expectedVersion: variables.expectedVersion,
        }),
      invalidates: taskAndRoomInvalidates,
    }),
    blockTask: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { taskId: string; reason: string; notes?: string } & TaskVersionInput
      >): Promise<HousekeepingTask> =>
        housekeepingRepository.blockTask(scope.hotelId, variables.taskId, {
          reason: variables.reason,
          notes: variables.notes,
          expectedVersion: variables.expectedVersion,
        }),
      invalidates: taskAndRoomInvalidates,
    }),
    completeTask: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { taskId: string; notes?: string } & TaskVersionInput
      >): Promise<HousekeepingTask> =>
        housekeepingRepository.completeTask(scope.hotelId, variables.taskId, {
          notes: variables.notes,
          expectedVersion: variables.expectedVersion,
        }),
      invalidates: taskAndRoomInvalidates,
    }),
    reopenTask: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { taskId: string; reason?: string } & TaskVersionInput
      >): Promise<HousekeepingTask> =>
        housekeepingRepository.reopenTask(scope.hotelId, variables.taskId, {
          reason: variables.reason,
          expectedVersion: variables.expectedVersion,
        }),
      invalidates: taskAndRoomInvalidates,
    }),
    confirmRoomReady: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { roomId: string; expectedUpdatedAt: string }
      >): Promise<HotelRoomSummary> =>
        housekeepingRepository.confirmRoomReady(
          scope.hotelId,
          variables.roomId,
          variables.expectedUpdatedAt,
        ),
      invalidates: taskAndRoomInvalidates,
    }),
    inspectRoom: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { roomId: string; expectedUpdatedAt: string }
      >): Promise<HotelRoomSummary> =>
        housekeepingRepository.confirmRoomReady(
          scope.hotelId,
          variables.roomId,
          variables.expectedUpdatedAt,
        ),
      invalidates: taskAndRoomInvalidates,
    }),
    updateRoomStatus: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { roomId: string; status: string }
      >): Promise<HotelRoomSummary> =>
        housekeepingRepository.updateRoomStatus(
          scope.hotelId,
          variables.roomId,
          variables.status,
        ),
      invalidates: taskAndRoomInvalidates,
    }),
    updateRequestStatus: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HousekeepingScope,
        { requestId: string } & UpdateRequestStatusInput
      >): Promise<StaffRequestListItem> => {
        const { requestId, ...payload } = variables;
        return housekeepingRepository.updateRequestStatus(
          scope.hotelId,
          requestId,
          payload,
        );
      },
      invalidates: requestInvalidates,
    }),
  },
});

export function useHousekeepingMutations(hotelId: string) {
  const boundResource = useMemo(
    () => housekeepingResource.bind({ hotelId }),
    [hotelId],
  );

  const claimTaskMutation = useMutation(boundResource.mutations.claimTask.options());
  const assignCleanerMutation = useMutation(boundResource.mutations.assignCleaner.options());
  const startTaskMutation = useMutation(boundResource.mutations.startTask.options());
  const completeTaskMutation = useMutation(boundResource.mutations.completeTask.options());
  const blockTaskMutation = useMutation(boundResource.mutations.blockTask.options());
  const reopenTaskMutation = useMutation(boundResource.mutations.reopenTask.options());
  const updateStatusMutation = useMutation(boundResource.mutations.updateRoomStatus.options());
  const legacyReadyMutation = useMutation(boundResource.mutations.confirmRoomReady.options());
  const inspectRoomMutation = useMutation(boundResource.mutations.inspectRoom.options());
  const updateRequestMutation = useMutation(boundResource.mutations.updateRequestStatus.options());

  return {
    claimTaskMutation,
    assignCleanerMutation,
    startTaskMutation,
    completeTaskMutation,
    blockTaskMutation,
    reopenTaskMutation,
    updateStatusMutation,
    legacyReadyMutation,
    inspectRoomMutation,
    updateRequestMutation,
  };
}
