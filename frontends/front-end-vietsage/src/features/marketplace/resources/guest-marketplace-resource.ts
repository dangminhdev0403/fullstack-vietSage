import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { guestMarketplaceRepository } from "../repositories/guest-marketplace-repository";
import type { CreateMarketplaceOrderInput } from "../types/marketplace-contract";

export const guestMarketplaceResource = createResource<{ sessionToken: string }>()({
  namespace: ["vietsage"], name: "guest-marketplace", scopeKey: ({ sessionToken }) => ["session", sessionToken],
  queries: {
    categories: defineQuery({ inputKey: () => [], queryFn: ({ scope }) => guestMarketplaceRepository.categories(scope.sessionToken) }),
    services: defineQuery({ inputKey: (input: { categoryId?: string }) => [input.categoryId ?? null], queryFn: ({ scope, input }) => guestMarketplaceRepository.services(scope.sessionToken, input.categoryId) }),
  },
  mutations: {
    order: defineMutation({ mutationFn: ({ scope, variables }: { scope: { sessionToken: string }; variables: CreateMarketplaceOrderInput }) => guestMarketplaceRepository.order(scope.sessionToken, variables) }),
  },
});
