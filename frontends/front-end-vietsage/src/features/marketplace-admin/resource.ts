import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { marketplaceAdminRepository } from "./repository";
import type { MarketplaceAdminAction } from "./types";

const invalidates = [{ type: "query", operation: "data" }] as const;
export const marketplaceAdminResource = createResource<Record<string, never>>()({
  namespace: ["vietsage"], name: "marketplace-admin", scopeKey: () => [],
  queries: { data: defineQuery({ inputKey: () => [], queryFn: () => marketplaceAdminRepository.data() }) },
  mutations: { mutate: defineMutation({ mutationFn: ({ variables }: { variables: MarketplaceAdminAction }) => marketplaceAdminRepository.mutate(variables), invalidates }) },
});
