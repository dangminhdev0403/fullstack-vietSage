import type { RbacPermissionMethod } from "@/features/rbac/types/rbac-contract";

export type PermissionViewModel = {
  id: string;
  method: RbacPermissionMethod;
  path: string;
  description: string;
};

export type RoleViewModel = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  userCount: number;
  permissions: PermissionViewModel[];
};

export type PermissionApiDescriptor = {
  id: string;
  method: RbacPermissionMethod;
  path: string;
  intent: string;
};
