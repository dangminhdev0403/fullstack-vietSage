import { createResource, defineInfiniteQuery, defineMutation } from "@dangminhdev04032005/query-resource";
import { requestInternalApi } from "@/core/http/internal-api-client";
import type { HotelMessageThreadList, HotelMessageThreadPage } from "@/features/hotel-ops/types/hotel-messages-contract";

type Scope = { hotelId: string };
export const hotelMessagesResource = createResource<Scope>()({
  namespace: ["vietsage"], name: "hotel-messages", scopeKey: ({ hotelId }) => ["hotel", hotelId],
  infiniteQueries: {
    threads: defineInfiniteQuery({ inputKey: (input: { q: string }) => [input], initialPageParam: undefined as string | undefined,
      getNextPageParam: (page: HotelMessageThreadList) => page.hasMore ? (page.nextCursor ?? undefined) : undefined,
      queryFn: ({ scope, input, pageParam }) => { const p = new URLSearchParams({ limit: "30", ...(input.q ? { q: input.q } : {}), ...(pageParam ? { cursor: pageParam } : {}) }); return requestInternalApi<HotelMessageThreadList>(`/api/hotel-ops/hotels/${encodeURIComponent(scope.hotelId)}/messages?${p}`, { method: "GET" }); }, }),
    detail: defineInfiniteQuery({ inputKey: (input: { threadId: string }) => [input.threadId], initialPageParam: undefined as string | undefined,
      getNextPageParam: (page: HotelMessageThreadPage) => page.hasMore ? (page.nextCursor ?? undefined) : undefined,
      queryFn: ({ scope, input, pageParam }) => { const p = new URLSearchParams({ limit: "20", ...(pageParam ? { before: pageParam } : {}) }); return requestInternalApi<HotelMessageThreadPage>(`/api/hotel-ops/hotels/${encodeURIComponent(scope.hotelId)}/messages/${encodeURIComponent(input.threadId)}?${p}`, { method: "GET" }); }, }),
  },
  mutations: { reply: defineMutation({ mutationFn: ({ scope, variables }: { scope: Scope; variables: { threadId: string; body: string } }) => requestInternalApi<{ thread: HotelMessageThreadList["items"][number]; message: HotelMessageThreadPage["items"][number] }>(`/api/hotel-ops/hotels/${encodeURIComponent(scope.hotelId)}/messages/${encodeURIComponent(variables.threadId)}/reply`, { method: "POST", body: { body: variables.body } }) }) },
});
