import { auth } from "@/auth";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import { rbacService } from "@/features/rbac/service/rbac-service-instance";
import type {
  RbacPermissionModuleSummary,
  RbacRole,
} from "@/features/rbac/types/rbac-contract";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";
import { VsIcon } from "../../_components/vs-icon";
import {
  type RolePermissionsBrowserPermission,
  type RolePermissionsBrowserRole,
  RolePermissionsBrowser,
} from "./_components/role-permissions-browser";
import { PermissionsWarningsAlert } from "./_components/permissions-warnings-alert";

type PermissionsPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toObjectArray<T extends Record<string, unknown>>(value: unknown): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is T => isRecord(item));
}

function mapRole(role: RbacRole): RolePermissionsBrowserRole {
  const userCount =
    typeof role._count?.userRoles === "number" ? role._count.userRoles : 0;
  const fallbackCode =
    typeof role.name === "string" && role.name.trim().length > 0
      ? role.name
      : role.id;

  const enabledCount =
    typeof role.enabledCount === "number" ? role.enabledCount : null;

  return {
    id: role.id,
    code:
      typeof role.code === "string" && role.code.trim().length > 0
        ? role.code
        : fallbackCode,
    name: role.name,
    description: typeof role.description === "string" ? role.description : null,
    userCount,
    enabledCount,
    createdAt: typeof role.createdAt === "string" ? role.createdAt : "",
  };
}

function extractParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

export default async function AdminPermissionsPage({
  searchParams,
}: Readonly<PermissionsPageProps>) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const selectedRoleId = extractParam(resolvedSearchParams.roleId);
  const requestedModuleKey = extractParam(resolvedSearchParams.module);

  const session = await auth();
  const workspaceContext = await loadServerWorkspaceContext("/admin/permissions");
  const executeAuthorizedApi = createAuthorizedApiExecutor({
    session,
    callbackUrl: "/admin/permissions",
  });

  const [rolesResult] = await Promise.allSettled([
    executeAuthorizedApi("GET /roles", (accessToken) =>
      rbacService.listRoles(accessToken),
    ),
  ]);

  if (rolesResult.status === "rejected") {
    unstable_rethrow(rolesResult.reason);
  }

  const apiWarnings: string[] = [];

  const roles =
    rolesResult.status === "fulfilled"
      ? toObjectArray<RbacRole>(rolesResult.value).map(mapRole)
      : [];

  if (rolesResult.status === "rejected") {
    const message =
      rolesResult.reason instanceof Error
        ? rolesResult.reason.message
        : "Lỗi API roles không xác định";
    apiWarnings.push(`GET /roles thất bại: ${message}`);
  }

  const effectiveRoleId = selectedRoleId ?? roles[0]?.id ?? null;
  let moduleSummaries: RbacPermissionModuleSummary[] = [];

  if (effectiveRoleId && roles.some((role) => role.id === effectiveRoleId)) {
    try {
      moduleSummaries = await executeAuthorizedApi(
        `GET /roles/${effectiveRoleId}/permission-modules`,
        (accessToken) =>
          rbacService.listPermissionModulesForRole(
            effectiveRoleId,
            accessToken,
          ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Lỗi API danh sách module quyền không xác định";
      apiWarnings.push(
        `GET permission modules cho ${effectiveRoleId} thất bại: ${message}`,
      );
    }
  }

  const initialPermissionsByRoleId: Record<
    string,
    RolePermissionsBrowserPermission[]
  > = {};

  let allPermissions: RolePermissionsBrowserPermission[] = [];

  if (effectiveRoleId && roles.some((role) => role.id === effectiveRoleId)) {
    try {
      const allPermissionsPages = await Promise.all(
        moduleSummaries.map(async (summary) => {
          const items = [];
          let page = 1;
          let total = 0;

          do {
            const result = await executeAuthorizedApi(
              `GET /roles/${effectiveRoleId}/permission-modules/${summary.moduleKey}/permissions?page=${page}`,
              (accessToken) =>
                rbacService.listPermissionModulePermissionsForRole(
                  effectiveRoleId,
                  summary.moduleKey,
                  { query: { page, limit: 100 }, accessToken },
                ),
            );
            items.push(...result.items);
            total = result.total;
            page += 1;
          } while (items.length < total);

          return items.map((item) => ({
            ...item,
            moduleKey: summary.moduleKey,
            moduleLabel: summary.moduleName,
          }));
        }),
      );

      const flattenedItems = allPermissionsPages.flat();

      allPermissions = flattenedItems.map((item) => ({
        id: item.permissionId,
        method: item.method,
        path: item.path,
        description: item.description,
        moduleKey: item.moduleKey,
        moduleLabel: item.moduleLabel,
      }));

      initialPermissionsByRoleId[effectiveRoleId] = flattenedItems
        .filter((item) => item.enabled)
        .map((item) => ({
          id: item.permissionId,
          method: item.method,
          path: item.path,
          description: item.description,
          moduleKey: item.moduleKey,
          moduleLabel: item.moduleLabel,
        }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Lỗi API quyền của vai trò không xác định";
      apiWarnings.push(
        `GET permissions cho ${effectiveRoleId} thất bại: ${message}`,
      );
    }
  }

  return (
    <>
      <div className="mx-auto max-w-[1600px] space-y-6">
      <section>
        <Link
          href="/admin/roles"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline-variant)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--surface-container-low)]"
        >
          <VsIcon name="arrow_back" className="text-[16px]" />
          Quay lại danh sách vai trò
        </Link>
      </section>

      <PermissionsWarningsAlert warnings={apiWarnings} />

      <RolePermissionsBrowser
        roles={roles}
        permissionModuleSummaries={moduleSummaries}
        initialRoleId={effectiveRoleId}
        initialModuleKey={requestedModuleKey}
        initialPermissionsByRoleId={initialPermissionsByRoleId}
        allPermissions={allPermissions}
      />
      </div>
    </>
  );
}
