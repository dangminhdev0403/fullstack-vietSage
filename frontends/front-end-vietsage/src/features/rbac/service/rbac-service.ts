import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpClient, type HttpMethod, type HttpQuery } from "@/core/http/http-client";
import { httpServer } from "@/core/http/http-server";
import type {
  PermissionsListQuery,
  PermissionsListResponseEnvelope,
  RbacPermission,
  RbacPermissionModulePermissionsPage,
  RbacPermissionModuleSummary,
  RbacRole,
  RbacStandalonePermission,
  RolePermissionModuleDisableAllResponseEnvelope,
  RolePermissionModulePermissionsListQuery,
  RolePermissionModulePermissionsListResponseEnvelope,
  RolePermissionModuleSelectAllResponseEnvelope,
  RolePermissionModulesListResponseEnvelope,
  RolePermissionsGrantResponseEnvelope,
  RolePermissionsListResponseEnvelope,
  RolePermissionsMutationBody,
  RolePermissionsReplaceResponseEnvelope,
  RolePermissionsRevokeResponseEnvelope,
  RolesListResponseEnvelope,
} from "@/features/rbac/types/rbac-contract";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

export type RbacServiceOptions = {
  baseUrl: string;
  timeoutMs?: number;
};

export type ListPermissionsOptions = {
  query?: PermissionsListQuery;
  accessToken?: string;
};

export type ListPermissionModulePermissionsOptions = {
  query?: RolePermissionModulePermissionsListQuery;
  accessToken?: string;
};

export type CreateRoleBody = {
  code?: string;
  name: string;
  description?: string;
};

export type UpdateRoleBody = {
  name?: string;
  description?: string;
};

export type DeleteRoleResult = {
  deleted: true;
};

function toRolePermissionPayload(permissionIds: string[]): RolePermissionsMutationBody {
  return { permissionIds };
}

export class RbacService {
  private readonly baseUrl: string;
  private readonly httpClient: HttpClient;

  constructor(options: RbacServiceOptions) {
    this.baseUrl = options.baseUrl;
    this.httpClient = new HttpClient({
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
    });
  }

  private async authenticatedRequest<TResponse, TBody = unknown>(options: {
    method: HttpMethod;
    path: string;
    body?: TBody;
    query?: HttpQuery;
    accessToken?: string;
  }): Promise<TResponse> {
    if (options.accessToken) {
      return this.httpClient.request<TResponse, TBody>({
        method: options.method,
        path: options.path,
        body: options.body,
        query: options.query,
        accessToken: options.accessToken,
      });
    }

    const tokens = await readServerSessionTokens();

    return httpServer.request<TResponse, TBody>(options.method, options.path, options.body, {
      baseUrl: this.baseUrl,
      query: options.query,
      accessToken: tokens.accessToken,
    });
  }

  async listRoles(accessToken?: string): Promise<RbacRole[]> {
    const rolesPayload = await this.authenticatedRequest<RolesListResponseEnvelope>({
      method: "GET",
      path: "/roles",
      accessToken,
    });

    const rolesEnvelope = unwrapApiEnvelope<RbacRole[]>(rolesPayload);
    return rolesEnvelope.data;
  }

  async getRoleByName(name: string, accessToken?: string): Promise<RbacRole> {
    const rolePayload = await this.authenticatedRequest<unknown>({
      method: "GET",
      path: `/roles/by-name/${encodeURIComponent(name)}`,
      accessToken,
    });

    const roleEnvelope = unwrapApiEnvelope<RbacRole>(rolePayload);
    return roleEnvelope.data;
  }

  async createRole(body: CreateRoleBody, accessToken?: string): Promise<RbacRole> {
    const rolePayload = await this.authenticatedRequest<unknown, CreateRoleBody>({
      method: "POST",
      path: "/roles",
      body,
      accessToken,
    });

    const roleEnvelope = unwrapApiEnvelope<RbacRole>(rolePayload);
    return roleEnvelope.data;
  }

  async updateRole(roleId: string, body: UpdateRoleBody, accessToken?: string): Promise<RbacRole> {
    const rolePayload = await this.authenticatedRequest<unknown, UpdateRoleBody>({
      method: "PATCH",
      path: `/roles/${encodeURIComponent(roleId)}`,
      body,
      accessToken,
    });

    const roleEnvelope = unwrapApiEnvelope<RbacRole>(rolePayload);
    return roleEnvelope.data;
  }

  async disableRole(roleId: string, accessToken?: string): Promise<RbacRole> {
    const rolePayload = await this.authenticatedRequest<unknown>({
      method: "POST",
      path: `/roles/${encodeURIComponent(roleId)}/disable`,
      accessToken,
    });

    const roleEnvelope = unwrapApiEnvelope<RbacRole>(rolePayload);
    return roleEnvelope.data;
  }

  async deleteRole(roleId: string, accessToken?: string): Promise<DeleteRoleResult> {
    const rolePayload = await this.authenticatedRequest<unknown>({
      method: "DELETE",
      path: `/roles/${encodeURIComponent(roleId)}`,
      accessToken,
    });

    const roleEnvelope = unwrapApiEnvelope<DeleteRoleResult>(rolePayload);
    return roleEnvelope.data;
  }

  async listPermissions(options: ListPermissionsOptions = {}): Promise<RbacStandalonePermission[]> {
    const permissionsPayload = await this.authenticatedRequest<PermissionsListResponseEnvelope>({
      method: "GET",
      path: "/permissions",
      query: options.query,
      accessToken: options.accessToken,
    });

    const permissionsEnvelope = unwrapApiEnvelope<RbacStandalonePermission[]>(permissionsPayload);
    return permissionsEnvelope.data;
  }

  async listRolePermissions(roleId: string, accessToken?: string): Promise<RbacPermission[]> {
    const rolePermissionsPayload = await this.authenticatedRequest<RolePermissionsListResponseEnvelope>({
      method: "GET",
      path: `/roles/${encodeURIComponent(roleId)}/permissions`,
      accessToken,
    });

    const rolePermissionsEnvelope = unwrapApiEnvelope<RbacPermission[]>(rolePermissionsPayload);
    return rolePermissionsEnvelope.data;
  }

  async listMyPermissionModules(accessToken?: string): Promise<RbacPermissionModuleSummary[]> {
    const modulesPayload = await this.authenticatedRequest<RolePermissionModulesListResponseEnvelope>({
      method: "GET",
      path: "/roles/me/permission-modules",
      accessToken,
    });

    const modulesEnvelope = unwrapApiEnvelope<RbacPermissionModuleSummary[]>(modulesPayload);
    return modulesEnvelope.data;
  }

  async listMyPermissionModulePermissions(
    moduleKey: string,
    options: ListPermissionModulePermissionsOptions = {},
  ): Promise<RbacPermissionModulePermissionsPage> {
    const permissionsPayload = await this.authenticatedRequest<RolePermissionModulePermissionsListResponseEnvelope>({
      method: "GET",
      path: `/roles/me/permission-modules/${encodeURIComponent(moduleKey)}/permissions`,
      query: options.query,
      accessToken: options.accessToken,
    });

    const permissionsEnvelope = unwrapApiEnvelope<RbacPermissionModulePermissionsPage>(permissionsPayload);
    return permissionsEnvelope.data;
  }

  async listPermissionModulesForRole(
    roleId: string,
    accessToken?: string,
  ): Promise<RbacPermissionModuleSummary[]> {
    const modulesPayload = await this.authenticatedRequest<RolePermissionModulesListResponseEnvelope>({
      method: "GET",
      path: `/roles/${encodeURIComponent(roleId)}/permission-modules`,
      accessToken,
    });

    const modulesEnvelope = unwrapApiEnvelope<RbacPermissionModuleSummary[]>(modulesPayload);
    return modulesEnvelope.data;
  }

  async listPermissionModulePermissionsForRole(
    roleId: string,
    moduleKey: string,
    options: ListPermissionModulePermissionsOptions = {},
  ): Promise<RbacPermissionModulePermissionsPage> {
    const permissionsPayload = await this.authenticatedRequest<RolePermissionModulePermissionsListResponseEnvelope>({
      method: "GET",
      path: `/roles/${encodeURIComponent(roleId)}/permission-modules/${encodeURIComponent(moduleKey)}/permissions`,
      query: options.query,
      accessToken: options.accessToken,
    });

    const permissionsEnvelope = unwrapApiEnvelope<RbacPermissionModulePermissionsPage>(permissionsPayload);
    return permissionsEnvelope.data;
  }

  async selectAllMyPermissionModule(moduleKey: string, accessToken?: string): Promise<RbacPermissionModuleSummary> {
    const selectAllPayload = await this.authenticatedRequest<RolePermissionModuleSelectAllResponseEnvelope>({
      method: "POST",
      path: `/roles/me/permission-modules/${encodeURIComponent(moduleKey)}/select-all`,
      accessToken,
    });

    const selectAllEnvelope = unwrapApiEnvelope<RbacPermissionModuleSummary>(selectAllPayload);
    return selectAllEnvelope.data;
  }

  async disableAllMyPermissionModule(moduleKey: string, accessToken?: string): Promise<RbacPermissionModuleSummary> {
    const disableAllPayload = await this.authenticatedRequest<RolePermissionModuleDisableAllResponseEnvelope>({
      method: "POST",
      path: `/roles/me/permission-modules/${encodeURIComponent(moduleKey)}/disable-all`,
      accessToken,
    });

    const disableAllEnvelope = unwrapApiEnvelope<RbacPermissionModuleSummary>(disableAllPayload);
    return disableAllEnvelope.data;
  }

  async replaceRolePermissions(roleId: string, permissionIds: string[], accessToken?: string): Promise<RbacPermission[]> {
    const replacePayload = await this.authenticatedRequest<RolePermissionsReplaceResponseEnvelope, RolePermissionsMutationBody>({
      method: "PUT",
      path: `/roles/${encodeURIComponent(roleId)}/permissions`,
      body: toRolePermissionPayload(permissionIds),
      accessToken,
    });

    const replaceEnvelope = unwrapApiEnvelope<RbacPermission[]>(replacePayload);
    return replaceEnvelope.data;
  }

  async grantRolePermissions(roleId: string, permissionIds: string[], accessToken?: string): Promise<RbacPermission[]> {
    const grantPayload = await this.authenticatedRequest<RolePermissionsGrantResponseEnvelope, RolePermissionsMutationBody>({
      method: "POST",
      path: `/roles/${encodeURIComponent(roleId)}/permissions/grant`,
      body: toRolePermissionPayload(permissionIds),
      accessToken,
    });

    const grantEnvelope = unwrapApiEnvelope<RbacPermission[]>(grantPayload);
    return grantEnvelope.data;
  }

  async revokeRolePermissions(roleId: string, permissionIds: string[], accessToken?: string): Promise<RbacPermission[]> {
    const revokePayload = await this.authenticatedRequest<RolePermissionsRevokeResponseEnvelope, RolePermissionsMutationBody>({
      method: "POST",
      path: `/roles/${encodeURIComponent(roleId)}/permissions/revoke`,
      body: toRolePermissionPayload(permissionIds),
      accessToken,
    });

    const revokeEnvelope = unwrapApiEnvelope<RbacPermission[]>(revokePayload);
    return revokeEnvelope.data;
  }
}

export function createRbacService(options: RbacServiceOptions): RbacService {
  return new RbacService(options);
}


