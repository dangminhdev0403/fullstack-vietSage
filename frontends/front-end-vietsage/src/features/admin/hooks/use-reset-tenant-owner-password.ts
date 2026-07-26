"use client";

import { useMutation } from "@tanstack/react-query";

import { adminResource } from "@/features/admin/resources/admin-resource";

export function useResetTenantOwnerPassword() {
  const admin = adminResource.bind(undefined);
  return useMutation({
    ...admin.mutations.resetTenantOwnerPassword.options(),
    retry: false,
  });
}
