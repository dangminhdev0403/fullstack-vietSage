import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
  type ResourceQueryContext,
} from "@dangminhdev04032005/query-resource";

import { hotelFeaturesRepository } from "@/features/admin/repositories/hotel-features-repository";
import type {
  HotelFeatureItem,
  UpdateHotelFeatureStatusPayload,
} from "@/features/admin/types/admin-contract";

export type HotelFeaturesScope = {
  hotelId: string;
};

export const hotelFeaturesResource = createResource<HotelFeaturesScope>()({
  namespace: ["vietsage"],
  name: "hotel-features",
  scopeKey: ({ hotelId }) => ["admin", "hotel", hotelId, "features"],
  queries: {
    list: defineQuery({
      inputKey: () => [],
      queryFn: ({
        scope,
        signal,
      }: ResourceQueryContext<HotelFeaturesScope, void>): Promise<HotelFeatureItem[]> =>
        hotelFeaturesRepository.list(scope.hotelId, signal),
    }),
  },
  mutations: {
    updateStatus: defineMutation({
      mutationFn: ({
        scope,
        variables,
      }: ResourceMutationContext<
        HotelFeaturesScope,
        { featureKey: string; status: UpdateHotelFeatureStatusPayload["status"] }
      >) =>
        hotelFeaturesRepository.updateStatus(scope.hotelId, variables.featureKey, {
          status: variables.status,
        }),
      invalidates: [{ type: "query", operation: "list" }],
    }),
  },
});
