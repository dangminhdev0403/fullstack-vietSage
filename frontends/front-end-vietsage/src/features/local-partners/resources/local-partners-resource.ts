import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { localPartnersRepository } from "../repositories/local-partners-repository";
import type { LocalPartnerInput, LocalPartnerStatus } from "../types/local-partners-contract";

const invalidates = [{ type: "query", operation: "list" }] as const;
export const localPartnersResource = createResource<{ hotelId: string }>()({
  namespace: ["vietsage"], name: "local-partners", scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    providers: defineQuery({ inputKey: () => [], queryFn: ({ scope, signal }) => localPartnersRepository.providers(scope.hotelId, signal) }),
    marketplaceOrders: defineQuery({ inputKey: () => [], queryFn: ({ scope, signal }) => localPartnersRepository.marketplaceOrders(scope.hotelId, signal) }),
    list: defineQuery({ inputKey: () => [], queryFn: ({ scope, signal }) => localPartnersRepository.list(scope.hotelId, signal) }),
    categories: defineQuery({ inputKey: () => [], queryFn: ({ scope, signal }) => localPartnersRepository.categories(scope.hotelId, signal) }),
  },
  mutations: {
    setProviderLink: defineMutation({ mutationFn: ({ scope, variables }: { scope: { hotelId: string }; variables: { providerId: string; linked: boolean } }) => localPartnersRepository.setProviderLink(scope.hotelId, variables.providerId, variables.linked), invalidates: [{ type: "query", operation: "providers" }] }),
    create: defineMutation({ mutationFn: ({ scope, variables }: { scope: { hotelId: string }; variables: LocalPartnerInput }) => localPartnersRepository.create(scope.hotelId, variables), invalidates }),
    update: defineMutation({ mutationFn: ({ scope, variables }: { scope: { hotelId: string }; variables: { partnerId: string; input: Partial<LocalPartnerInput> } }) => localPartnersRepository.update(scope.hotelId, variables.partnerId, variables.input), invalidates }),
    status: defineMutation({ mutationFn: ({ scope, variables }: { scope: { hotelId: string }; variables: { partnerId: string; status: LocalPartnerStatus } }) => localPartnersRepository.status(scope.hotelId, variables.partnerId, variables.status), invalidates }),
  },
});
