import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";
import { rolePermissionsRepository } from "../repositories/role-permissions-repository";
import type { CreateRoleInput, UpdateRoleInput } from "../types/rbac-contract";

export const rolePermissionsResource = createResource<Record<string, never>>()({
  namespace: ["vietsage"],
  name: "role-permissions",
  scopeKey: () => [],
  queries: {
    permissions: defineQuery({
      inputKey: (roleId: string) => [roleId],
      queryFn: ({ input, signal }) => rolePermissionsRepository.permissions(input, signal),
      defaults: { staleTime: Infinity, retry: false },
    }),
  },
  mutations: {
    create: defineMutation({
      mutationFn: ({ variables }: { variables: CreateRoleInput }) => rolePermissionsRepository.create(variables),
      defaults: { retry: false },
    }),
    update: defineMutation({
      mutationFn: ({ variables }: { variables: { roleId: string; body: UpdateRoleInput } }) => rolePermissionsRepository.update(variables),
      defaults: { retry: false },
    }),
    remove: defineMutation({
      mutationFn: ({ variables }: { variables: string }) => rolePermissionsRepository.remove(variables),
      defaults: { retry: false },
    }),
  },
});
