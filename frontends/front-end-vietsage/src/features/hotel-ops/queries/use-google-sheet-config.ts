"use client";

import { useMutation } from "@tanstack/react-query";

import {
  adminGoogleSheetConfigResource,
  ownerGoogleSheetSyncResource,
} from "@/features/hotel-ops/resources/google-sheet-config-resource";

export function useAdminGoogleSheetConfig(hotelId: string) {
  const resource = adminGoogleSheetConfigResource.bind({ hotelId });
  return useMutation(resource.mutations.update.options());
}

export function useOwnerGoogleSheetSync(hotelId: string) {
  const resource = ownerGoogleSheetSyncResource.bind({ hotelId });
  return useMutation(resource.mutations.sync.options());
}

export function useOwnerServiceCatalogPreview(hotelId: string) {
  const resource = ownerGoogleSheetSyncResource.bind({ hotelId });
  return useMutation(resource.mutations.preview.options());
}

export function useOwnerServiceCatalogCommit(hotelId: string) {
  const resource = ownerGoogleSheetSyncResource.bind({ hotelId });
  return useMutation(resource.mutations.commit.options());
}
