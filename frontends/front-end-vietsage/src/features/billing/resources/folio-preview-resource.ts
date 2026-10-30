import { createResource, defineQuery, type ResourceQueryContext } from "@dangminhdev04032005/query-resource";
import { folioPreviewRepository } from "../repositories/folio-preview-repository";

export const folioPreviewResource = createResource<{ hotelId: string }>()({
  namespace: ["vietsage"],
  name: "folio-preview",
  scopeKey: ({ hotelId }) => ["hotel", hotelId],
  queries: {
    detail: defineQuery({
      inputKey: (folioId: string) => [folioId],
      queryFn: ({ scope, input }: ResourceQueryContext<{ hotelId: string }, string>) =>
        folioPreviewRepository.load(scope.hotelId, input),
    }),
  },
});
