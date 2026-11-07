import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { servicePortalRepository } from "./repository";
import type { ServiceProfile } from "./types";
const invalidates = [
  { type: "query", operation: "data" },
  { type: "query", operation: "financialSummary" },
  { type: "query", operation: "settlements" },
] as const;
export const servicePortalResource = createResource<Record<string, never>>()({ namespace: ["vietsage"], name: "service-portal", scopeKey: () => [], queries: {
  data: defineQuery({ inputKey: () => [], queryFn: ({ signal }) => servicePortalRepository.data(signal) }),
  financialSummary: defineQuery({ inputKey: () => [], queryFn: ({ signal }) => servicePortalRepository.financialSummary(signal) }),
  settlements: defineQuery({ inputKey: (status?: string) => [status], queryFn: ({ input, signal }) => servicePortalRepository.settlements(input, signal) }),
}, mutations: {
  verifyVoucher: defineMutation({ mutationFn: ({ variables }: { variables: { code: string } }) => servicePortalRepository.verifyVoucher(variables), defaults: { retry: false } }),
  profile: defineMutation({ mutationFn: ({ variables }: { variables: Partial<ServiceProfile> }) => servicePortalRepository.profile(variables), invalidates }),
  update: defineMutation({ mutationFn: ({ variables }: { variables: { serviceId: string; data: unknown } }) => servicePortalRepository.update(variables), invalidates }),
  transition: defineMutation({ mutationFn: ({ variables }: { variables: { orderId: string; toStatus: string } }) => servicePortalRepository.transition(variables), invalidates }),
  importPreview: defineMutation({ mutationFn: ({ variables }: { variables: { csv: string; fileName: string } }) => servicePortalRepository.importPreview(variables) }),
  importCommit: defineMutation({ mutationFn: ({ variables }: { variables: { csv: string; fileName: string; previewToken: string } }) => servicePortalRepository.importCommit(variables), invalidates }),
} });

