import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { servicePortalRepository } from "./repository";
import type { ServiceProfile } from "./types";
const invalidates = [{ type: "query", operation: "data" }] as const;
export const servicePortalResource = createResource<Record<string, never>>()({ namespace: ["vietsage"], name: "service-portal", scopeKey: () => [], queries: { data: defineQuery({ inputKey: () => [], queryFn: () => servicePortalRepository.data() }) }, mutations: {
  profile: defineMutation({ mutationFn: ({ variables }: { variables: Partial<ServiceProfile> }) => servicePortalRepository.profile(variables), invalidates }),
  create: defineMutation({ mutationFn: ({ variables }: { variables: unknown }) => servicePortalRepository.create(variables), invalidates }),
  update: defineMutation({ mutationFn: ({ variables }: { variables: { serviceId: string; data: unknown } }) => servicePortalRepository.update(variables), invalidates }),
  transition: defineMutation({ mutationFn: ({ variables }: { variables: { orderId: string; toStatus: string } }) => servicePortalRepository.transition(variables), invalidates }),
  importPreview: defineMutation({ mutationFn: ({ variables }: { variables: { csv: string; fileName: string } }) => servicePortalRepository.importPreview(variables) }),
  importCommit: defineMutation({ mutationFn: ({ variables }: { variables: { csv: string; fileName: string; previewToken: string } }) => servicePortalRepository.importCommit(variables), invalidates }),
} });
