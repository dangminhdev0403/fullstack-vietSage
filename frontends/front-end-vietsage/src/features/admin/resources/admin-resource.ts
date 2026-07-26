import { createResource, defineMutation, type ResourceMutationContext } from "@dangminhdev04032005/query-resource";

import { adminRepository, type TemporaryPasswordResult } from "@/features/admin/repositories/admin-repository";

async function resetTenantOwnerPassword({ variables }: ResourceMutationContext<void, { tenantOwnerId: string }>): Promise<TemporaryPasswordResult> {
  return adminRepository.resetTenantOwnerPassword(variables.tenantOwnerId);
}

export const adminResource = createResource<void>()({
  namespace: ["vietsage"],
  name: "admin",
  scopeKey: () => [],
  mutations: {
    resetTenantOwnerPassword: defineMutation({ mutationFn: resetTenantOwnerPassword }),
  },
});
