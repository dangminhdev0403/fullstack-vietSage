import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { requestInternalApi } from "@/core/http/internal-api-client";
import type { HotelGuestRequest } from "@/features/hotel-ops/types/hotel-ops-contract";

type Scope = { basePath: string };
export const requestQueueResource = createResource<Scope>()({
  namespace: ["vietsage"], name: "request-queue", scopeKey: ({ basePath }) => ["base", basePath],
  queries: { detail: defineQuery({ inputKey: (input: { requestId: string }) => [input.requestId], queryFn: ({ scope, input }) => requestInternalApi<HotelGuestRequest>(`${scope.basePath}/${encodeURIComponent(input.requestId)}`, { method: "GET" }) }) },
  mutations: {
    status: defineMutation({ mutationFn: ({ scope, variables }: { scope: Scope; variables: { requestId: string; status: string; note: string; assignedToUserId?: string } }) => requestInternalApi<HotelGuestRequest>(`${scope.basePath}/${encodeURIComponent(variables.requestId)}/status`, { method: "PATCH", body: { status: variables.status, note: variables.note, assignedToUserId: variables.assignedToUserId } }) }),
    assignment: defineMutation({ mutationFn: ({ scope, variables }: { scope: Scope; variables: { requestId: string; assignedToUserId: string | null; note?: string } }) => requestInternalApi<HotelGuestRequest>(`${scope.basePath}/${encodeURIComponent(variables.requestId)}/assignment`, { method: "PATCH", body: { assignedToUserId: variables.assignedToUserId, note: variables.note } }) }),
  },
});
