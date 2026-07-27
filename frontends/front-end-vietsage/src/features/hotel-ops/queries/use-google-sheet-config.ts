"use client";

import { useMutation } from "@tanstack/react-query";

import type { GoogleSheetConfigScope } from "@/features/hotel-ops/repositories/google-sheet-config-repository";
import { googleSheetConfigResource } from "@/features/hotel-ops/resources/google-sheet-config-resource";

export function useGoogleSheetConfig(scope: GoogleSheetConfigScope) {
  const resource = googleSheetConfigResource.bind(scope);
  return {
    update: useMutation(resource.mutations.update.options()),
    sync: useMutation(resource.mutations.sync.options()),
  };
}
