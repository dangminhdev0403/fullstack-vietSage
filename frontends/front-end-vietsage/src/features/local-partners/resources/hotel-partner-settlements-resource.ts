import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { hotelPartnerSettlementsRepository as repository } from "../repositories/hotel-partner-settlements-repository";

type Scope = { hotelId: string };
const invalidates = [
  { type: "query", operation: "list" },
  { type: "query", operation: "revenue" },
] as const;
const defaults = { staleTime: 0, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false } as const;

export const hotelPartnerSettlementsResource = createResource<Scope>()({
  namespace: ["vietsage"],
  name: "hotel-partner-settlements",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    list: defineQuery({
      inputKey: (_input: undefined) => [],
      queryFn: ({ scope, signal }) => repository.list(scope.hotelId, signal),
      defaults,
    }),
    revenue: defineQuery({
      inputKey: (_input: undefined) => [],
      queryFn: ({ scope, signal }) => repository.revenue(scope.hotelId, signal),
      defaults,
    }),
  },
  mutations: {
    settle: defineMutation({
      mutationFn: ({ scope, variables }: { scope: Scope; variables: string }) => repository.settle(scope.hotelId, variables),
      defaults: { retry: false },
      invalidates,
    }),
    settleBatch: defineMutation({
      mutationFn: ({ scope, variables }: { scope: Scope; variables: string[] }) => repository.settleBatch(scope.hotelId, variables),
      defaults: { retry: false },
      invalidates,
    }),
  },
});
