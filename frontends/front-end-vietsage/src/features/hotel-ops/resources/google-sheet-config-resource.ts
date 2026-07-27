import {
  createResource,
  defineMutation,
} from "@dangminhdev04032005/query-resource";

import {
  googleSheetConfigRepository,
  type GoogleSheetConfigScope,
} from "@/features/hotel-ops/repositories/google-sheet-config-repository";

export const googleSheetConfigResource =
  createResource<GoogleSheetConfigScope>()({
    namespace: ["vietsage"],
    name: "hotel-google-sheet-config",
    scopeKey: ({ hotelId, surface }) => [surface, "hotel", hotelId],
    mutations: {
      update: defineMutation({
        mutationFn: ({
          scope,
          variables,
        }: {
          scope: GoogleSheetConfigScope;
          variables: Parameters<typeof googleSheetConfigRepository.update>[1];
        }) =>
          googleSheetConfigRepository.update(scope, variables),
      }),
      sync: defineMutation({
        mutationFn: ({
          scope,
        }: {
          scope: GoogleSheetConfigScope;
          variables: void;
        }) => googleSheetConfigRepository.sync(scope),
      }),
    },
  });
