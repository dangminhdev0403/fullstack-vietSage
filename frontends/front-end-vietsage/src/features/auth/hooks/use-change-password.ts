"use client";

import { useMutation } from "@tanstack/react-query";
import { signOut } from "next-auth/react";

import { authResource } from "@/features/auth/resources/auth-resource";
import type { ChangePasswordInput } from "@/features/auth/repositories/auth-repository";

export function useChangePassword() {
  const auth = authResource.bind(undefined);
  const mutation = useMutation({
    ...auth.mutations.changePassword.options(),
    retry: false,
  });

  async function changePassword(input: ChangePasswordInput) {
    await mutation.mutateAsync(input);
    mutation.reset();
    await signOut({ callbackUrl: "/login?reauth=1&passwordChanged=1" });
  }

  return { changePassword, isPending: mutation.isPending, error: mutation.error };
}
