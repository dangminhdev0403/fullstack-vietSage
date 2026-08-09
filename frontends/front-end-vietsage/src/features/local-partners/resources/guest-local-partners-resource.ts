import { createResource, defineQuery } from "@dangminhdev04032005/query-resource";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import type { LocalPartner, LocalPartnerCategory } from "../types/local-partners-contract";

export const guestLocalPartnersResource = createResource<{ sessionToken: string }>()({
  namespace: ["vietsage"],
  name: "guest-local-partners",
  scopeKey: ({ sessionToken }) => ["session", sessionToken],
  queries: {
    categories: defineQuery({
      inputKey: () => [],
      queryFn: ({ scope }) => guestOsService.listNearbyCategories<LocalPartnerCategory[]>(scope.sessionToken),
    }),
    list: defineQuery({
      inputKey: (input: { categoryId?: string }) => [input.categoryId ?? null],
      queryFn: ({ scope, input }) => guestOsService.listNearbyPartners<LocalPartner[]>(scope.sessionToken, input.categoryId),
    }),
  },
});
