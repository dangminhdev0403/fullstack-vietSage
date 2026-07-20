import type { operations } from "@/generated/openapi/v1";

export type RolesListResponseEnvelope =
  operations["RolesController_listRoles"]["responses"][200]["content"]["application/json"];

export type RolePermissionsListResponseEnvelope =
  operations["RolesController_listRolePermissions"]["responses"][200]["content"]["application/json"];

export type RolePermissionModulesListResponseEnvelope =
  operations["RolesController_listRolePermissionModules"]["responses"][200]["content"]["application/json"];

export type RolePermissionModulePermissionsListResponseEnvelope =
  operations["RolesController_listRolePermissionModulePermissions"]["responses"][200]["content"]["application/json"];

export type RolePermissionModulePermissionsListQuery =
  operations["RolesController_listRolePermissionModulePermissions"]["parameters"]["query"];

export type RolePermissionModuleSelectAllResponseEnvelope =
  operations["RolesController_grantRolePermissionModulePermissions"]["responses"][201]["content"]["application/json"];

export type RolePermissionModuleDisableAllResponseEnvelope =
  operations["RolesController_revokeRolePermissionModulePermissions"]["responses"][201]["content"]["application/json"];

export type PermissionsListResponseEnvelope =
  operations["PermissionsController_listPermissions"]["responses"][200]["content"]["application/json"];

export type PermissionsListQuery =
  operations["PermissionsController_listPermissions"]["parameters"]["query"];

export type RolePermissionsMutationBody =
  operations["RolesController_replacePermissions"]["requestBody"]["content"]["application/json"];

export type RolePermissionsReplaceResponseEnvelope =
  operations["RolesController_replacePermissions"]["responses"][200]["content"]["application/json"];

export type RolePermissionsGrantResponseEnvelope =
  RolePermissionsReplaceResponseEnvelope;

export type RolePermissionsRevokeResponseEnvelope =
  RolePermissionsReplaceResponseEnvelope;

export type RbacPermission = RolePermissionsListResponseEnvelope["data"][number];
export type RbacPermissionMethod = RbacPermission["method"];

export type RbacRolePermission = {
  id?: string;
  roleId?: string;
  permissionId?: string;
  permission?: Partial<RbacPermission>;
};

export type RbacRole = RolesListResponseEnvelope["data"][number] & {
  code?: string;
  description?: string | null;
  status?: "ACTIVE" | "DISABLED";
  createdAt?: string;
  updatedAt?: string;
  rolePermissions?: RbacRolePermission[];
  enabledCount?: number;
  _count?: {
    userRoles?: number;
    rolePermissions?: number;
  };
};

export type RbacStandalonePermission = PermissionsListResponseEnvelope["data"][number];

export type RbacPermissionModuleSummary = RolePermissionModulesListResponseEnvelope["data"][number];
export type RbacPermissionModulePermissionsPage = RolePermissionModulePermissionsListResponseEnvelope["data"];
export type RbacPermissionModulePermissionItem = RbacPermissionModulePermissionsPage["items"][number];
