import { createResource, defineQuery, type ResourceQueryContext } from "@dangminhdev04032005/query-resource";
import {
  ownerSaasBillingRepository,
  type OwnerAnalyticsQuery,
} from "../repositories/owner-saas-billing-repository";

export const ownerSaasBillingResource = createResource<{ hotelId: string }>()({
  namespace: ["vietsage"],
  name: "owner-saas-billing",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    analytics: defineQuery({
      inputKey: (query?: OwnerAnalyticsQuery) => [query?.monthDate ?? "", query?.periodPage ?? 1],
      queryFn: ({
        scope,
        input,
        signal,
      }: ResourceQueryContext<{ hotelId: string }, OwnerAnalyticsQuery | undefined>) =>
        ownerSaasBillingRepository.getAnalytics(scope.hotelId, input, signal),
    }),
  },
});
