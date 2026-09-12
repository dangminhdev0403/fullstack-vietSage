import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";
import { kbttRepository } from "../repositories/kbtt-repository";
import type { KbttCredentials } from "../types/kbtt-contract";

type HotelScope = { hotelId: string };
const invalidates = [{ type: "query", operation: "connection" }] as const;

export const kbttResource = createResource<HotelScope>()({
  namespace: ["vietsage"],
  name: "kbtt",
  scopeKey: ({ hotelId }) => ["owner", "hotel", hotelId],
  queries: {
    connection: defineQuery({
      inputKey: () => [],
      queryFn: ({ scope, signal }: ResourceQueryContext<HotelScope, void>) => kbttRepository.connection(scope.hotelId, signal),
    }),
  },
  mutations: {
    connect: defineMutation({
      defaults: { gcTime: 0, retry: false, networkMode: "always" },
      mutationFn: ({ scope, variables }: ResourceMutationContext<HotelScope, KbttCredentials>) => kbttRepository.connect(scope.hotelId, variables),
      invalidates,
    }),
    check: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({ scope }: ResourceMutationContext<HotelScope, void>) => kbttRepository.check(scope.hotelId),
      invalidates,
    }),
    disconnect: defineMutation({
      defaults: { retry: false, networkMode: "always" },
      mutationFn: ({ scope }: ResourceMutationContext<HotelScope, void>) => kbttRepository.disconnect(scope.hotelId),
      invalidates,
    }),
  },
});
