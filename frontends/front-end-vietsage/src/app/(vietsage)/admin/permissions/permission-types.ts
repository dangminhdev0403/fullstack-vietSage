import type {
  RbacPermissionMethod,
  RoleType,
} from "@/features/rbac/types/rbac-contract";

export type { RoleType };

export type RolePermissionsBrowserRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  userCount: number;
  enabledCount: number | null;
  createdAt: string;
  type: RoleType;
  baseRoleId?: string | null;
};

export type RolePermissionsBrowserPermission = {
  id: string;
  method: RbacPermissionMethod | string;
  path: string;
  description: string;
};

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
