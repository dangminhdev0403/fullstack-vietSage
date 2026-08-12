import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { guestMarketplaceRepository } from "../repositories/guest-marketplace-repository";
import type { CreateMarketplaceOrderInput } from "../types/marketplace-contract";

export const guestMarketplaceResource = createResource<{ sessionToken: string; locale?: string }>()({
  namespace: ["vietsage"], name: "guest-marketplace", scopeKey: ({ sessionToken, locale }) => ["session", sessionToken, locale ?? "vi"],
  queries: {
    categories: defineQuery({ inputKey: () => [], queryFn: ({ scope }) => guestMarketplaceRepository.categories(scope.sessionToken, scope.locale) }),
    services: defineQuery({ inputKey: (input: { categoryId?: string }) => [input.categoryId ?? null], queryFn: ({ scope, input }) => guestMarketplaceRepository.services(scope.sessionToken, input.categoryId, scope.locale) }),
    orders: defineQuery({ inputKey: () => [], queryFn: ({ scope }) => guestMarketplaceRepository.orders(scope.sessionToken, scope.locale) }),
  },
  mutations: {
    order: defineMutation({ mutationFn: ({ scope, variables }: { scope: { sessionToken: string; locale?: string }; variables: CreateMarketplaceOrderInput }) => guestMarketplaceRepository.order(scope.sessionToken, variables, scope.locale), invalidates: [{ type: "query", operation: "orders" }] }),
  },
});
