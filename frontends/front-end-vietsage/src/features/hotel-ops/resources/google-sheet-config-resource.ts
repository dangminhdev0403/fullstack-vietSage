import {
  createResource,
  defineMutation,
} from "@dangminhdev04032005/query-resource";

import {
  googleSheetConfigRepository,
} from "@/features/hotel-ops/repositories/google-sheet-config-repository";

type HotelScope = { hotelId: string };

export const adminGoogleSheetConfigResource =
  createResource<HotelScope>()({
    namespace: ["vietsage"],
    name: "hotel-google-sheet-config",
    scopeKey: ({ hotelId }) => ["admin", "hotel", hotelId],
    mutations: {
      update: defineMutation({
        mutationFn: ({
          scope,
          variables,
        }: {
          scope: HotelScope;
          variables: Parameters<typeof googleSheetConfigRepository.update>[1];
        }) =>
          googleSheetConfigRepository.update(scope.hotelId, variables),
      }),
    },
  });

export const ownerGoogleSheetSyncResource =
  createResource<HotelScope>()({
    namespace: ["vietsage"],
    name: "hotel-google-sheet-sync",
    scopeKey: ({ hotelId }) => ["owner", "hotel", hotelId],
    mutations: {
      sync: defineMutation({
        mutationFn: ({ scope }: { scope: HotelScope; variables: void }) =>
          googleSheetConfigRepository.sync(scope.hotelId),
      }),
      preview: defineMutation({
        mutationFn: ({
          scope,
          variables,
        }: {
          scope: HotelScope;
          variables: { spreadsheetUrl: string; mode?: string };
        }) =>
          googleSheetConfigRepository.preview(scope.hotelId, variables),
      }),
      commit: defineMutation({
        mutationFn: ({
          scope,
          variables,
        }: {
          scope: HotelScope;
          variables: { spreadsheetUrl: string; expectedHash: string; mode?: string };
        }) =>
          googleSheetConfigRepository.commit(scope.hotelId, variables),
      }),
    },
  });
