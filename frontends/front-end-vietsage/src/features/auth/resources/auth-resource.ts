import { createResource, defineMutation, type ResourceMutationContext } from "@dangminhdev04032005/query-resource";

import { authRepository, type ChangePasswordInput, type ChangePasswordResult } from "@/features/auth/repositories/auth-repository";

async function changePassword({ variables }: ResourceMutationContext<void, ChangePasswordInput>): Promise<ChangePasswordResult> {
  return authRepository.changePassword(variables);
}

export const authResource = createResource<void>()({
  namespace: ["vietsage"],
  name: "auth",
  scopeKey: () => [],
  mutations: {
    changePassword: defineMutation({ mutationFn: changePassword }),
  },
});
