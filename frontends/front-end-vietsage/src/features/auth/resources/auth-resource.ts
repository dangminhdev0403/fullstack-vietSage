import {
  createResource,
  defineMutation,
  defineQuery,
  type ResourceMutationContext,
} from "@dangminhdev04032005/query-resource";

import {
  authRepository,
  type ChangePasswordInput,
  type ChangePasswordResult,
  type AuthSessionData,
} from "@/features/auth/repositories/auth-repository";

async function changePassword({
  variables,
}: ResourceMutationContext<void, ChangePasswordInput>): Promise<ChangePasswordResult> {
  return authRepository.changePassword(variables);
}

async function getSession(): Promise<AuthSessionData | null> {
  return authRepository.getSession();
}

export const authResource = createResource<void>()({
  namespace: ["vietsage"],
  name: "auth",
  scopeKey: () => [],
  queries: {
    session: defineQuery({
      inputKey: () => [],
      queryFn: getSession,
      defaults: {
        staleTime: 60_000,
      },
    }),
  },
  mutations: {
    changePassword: defineMutation({ mutationFn: changePassword }),
  },
});
