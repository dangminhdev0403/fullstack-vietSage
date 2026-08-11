import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { marketplaceAdminRepository } from "./repository";

const invalidates = [{ type: "query", operation: "data" }] as const;
export const marketplaceAdminResource = createResource<Record<string, never>>()({
  namespace: ["vietsage"],
  name: "marketplace-admin",
  scopeKey: () => [],
  queries: { data: defineQuery({ inputKey: () => [], queryFn: () => marketplaceAdminRepository.data() }) },
  mutations: {
    mutate: defineMutation({ mutationFn: ({ variables }: { variables: Parameters<typeof marketplaceAdminRepository.mutate>[0] }) => marketplaceAdminRepository.mutate(variables), invalidates }),
    previewImport: defineMutation({
      mutationFn: ({ variables }: { variables: { spreadsheetUrl: string } }) => marketplaceAdminRepository.previewImport(variables.spreadsheetUrl),
    }),
    commitImport: defineMutation({
      mutationFn: ({ variables }: { variables: { spreadsheetUrl: string; expectedHash: string } }) =>
        marketplaceAdminRepository.commitImport(variables.spreadsheetUrl, variables.expectedHash),
      invalidates,
    }),
  },
});
