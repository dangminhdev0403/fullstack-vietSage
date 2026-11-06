import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import {
  requestQueueRepository,
  type RequestQueueScope,
  type RequestStatusInput,
  type RequestAssignmentInput,
} from "../repositories/request-queue-repository";

export const requestQueueResource = createResource<RequestQueueScope>()({
  namespace: ["vietsage"],
  name: "request-queue",
  scopeKey: ({ basePath }) => ["base", basePath],
  queries: {
    detail: defineQuery({
      inputKey: (input: { requestId: string }) => [input.requestId],
      queryFn: ({ scope, input, signal }) => requestQueueRepository.detail(scope, input, signal),
    }),
    staffOptions: defineQuery({
      inputKey: (input: { hotelId: string }) => [input.hotelId],
      queryFn: ({ input, signal }) => requestQueueRepository.staffOptions(input.hotelId, signal),
      defaults: { retry: false },
    }),
  },
  mutations: {
    status: defineMutation({
      mutationFn: ({ scope, variables }: { scope: RequestQueueScope; variables: RequestStatusInput }) => requestQueueRepository.status(scope, variables),
    }),
    assignment: defineMutation({
      mutationFn: ({ scope, variables }: { scope: RequestQueueScope; variables: RequestAssignmentInput }) => requestQueueRepository.assignment(scope, variables),
    }),
    note: defineMutation({
      mutationFn: ({ scope, variables }: { scope: RequestQueueScope; variables: { requestId: string; note: string } }) => requestQueueRepository.note(scope, variables),
    }),
  },
});
