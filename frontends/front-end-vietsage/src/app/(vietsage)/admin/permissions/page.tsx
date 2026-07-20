import { auth } from "@/auth";
import Link from "next/link";

import { unstable_rethrow } from "next/navigation";

import { rbacService } from "@/features/rbac/service/rbac-service-instance";
import type {
  RbacPermission,
  RbacPermissionModulePermissionItem,
  RbacPermissionModuleSummary,
  RbacRole,
} from "@/features/rbac/types/rbac-contract";
import { buildWorkspaceNavigationForContext } from "@/features/workspace/config/workspace-registry";
import type { DashboardNavItem } from "@/features/workspace/types/workspace-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";
import { loadServerWorkspaceContext } from "@/lib/server-workspace-context";

import { VsIcon } from "../../_components/vs-icon";
import { AdminShell } from "../_components/admin-shell";
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

const MODULE_PERMISSION_PAGE_LIMIT = 100;

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

function mapRolePermission(
  permission: RbacPermission,
): RolePermissionsBrowserPermission {
  return {
    id: permission.id,
    method: permission.method,
    path: permission.path,
    description: permission.description,
  };
}

type ModulePermissionItemWithPath = RbacPermissionModulePermissionItem & {
  path?: string;
};

function mapModulePermission(
  moduleSummary: RbacPermissionModuleSummary,
  item: ModulePermissionItemWithPath,
): RolePermissionsBrowserPermission {
  return {
    id: item.permissionId,
    method: item.method,
    path: item.path ?? item.permissionId,
    description: item.description,
    moduleKey: moduleSummary.moduleKey,
    moduleLabel: moduleSummary.moduleName,
    enabled: item.enabled,
  };
}

function dedupePermissions(
  permissions: readonly RolePermissionsBrowserPermission[],
): RolePermissionsBrowserPermission[] {
  const byId = new Map<string, RolePermissionsBrowserPermission>();

  for (const permission of permissions) {
    if (!byId.has(permission.id)) {
      byId.set(permission.id, permission);
    }
  }

  return [...byId.values()];
}

function normalizeSidebarItems(
  items: readonly DashboardNavItem[],
): DashboardNavItem[] {
  const canonicalItems = items.map((item) => {
    const normalizedHref =
      item.href === "/admin/dashboard?tab=permissions" ||
      item.href === "/admin/dashboard?tab=roles" ||
      item.href === "/admin/permissions"
        ? "/admin/roles"
        : item.href;

    return {
      ...item,
      key: normalizedHref,
      href: normalizedHref,
      label: normalizedHref === "/admin/roles" ? "Phân quyền" : item.label,
      icon: normalizedHref === "/admin/roles" ? "verified_user" : item.icon,
    } satisfies DashboardNavItem;
  });

  const byHref = new Map<string, DashboardNavItem>();
  for (const item of canonicalItems) {
    if (!byHref.has(item.href)) {
      byHref.set(item.href, item);
    }
  }

  if (!byHref.has("/admin/roles")) {
    byHref.set("/admin/roles", {
      key: "/admin/roles",
      href: "/admin/roles",
      label: "Phân quyền",
      icon: "verified_user",
    });
  }

  return [...byHref.values()];
}

function extractRoleIdParam(
  value: string | string[] | undefined,
): string | null {
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
}: PermissionsPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const selectedRoleId = extractRoleIdParam(resolvedSearchParams.roleId);
  const requestedModuleKey = extractRoleIdParam(resolvedSearchParams.module);

  const session = await auth();
  const executeAuthorizedApi = createAuthorizedApiExecutor({
    session,
    callbackUrl: "/admin/permissions",
  });
  const workspaceContext = await loadServerWorkspaceContext("/admin/permissions");

  const [rolesResult, permissionModulesResult] = await Promise.allSettled([
    executeAuthorizedApi("GET /roles", (accessToken) =>
      rbacService.listRoles(accessToken),
    ),
    selectedRoleId
      ? executeAuthorizedApi(
          `GET /roles/${selectedRoleId}/permission-modules`,
          (accessToken) =>
            rbacService.listPermissionModulesForRole(selectedRoleId, accessToken),
        )
      : executeAuthorizedApi("GET /roles/me/permission-modules", (accessToken) =>
          rbacService.listMyPermissionModules(accessToken),
        ),
  ]);

  if (rolesResult.status === "rejected") {
    unstable_rethrow(rolesResult.reason);
  }

  const sidebarItems = normalizeSidebarItems(
    buildWorkspaceNavigationForContext(workspaceContext),
  );

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

  const initialPermissionsByRoleId: Record<
    string,
    RolePermissionsBrowserPermission[]
  > = {};

  if (selectedRoleId && roles.some((role) => role.id === selectedRoleId)) {
    try {
      const initialPermissionsPayload = await executeAuthorizedApi(
        `GET /roles/${selectedRoleId}/permissions`,
        (accessToken) =>
          rbacService.listRolePermissions(selectedRoleId, accessToken),
      );

      initialPermissionsByRoleId[selectedRoleId] =
        initialPermissionsPayload.map(mapRolePermission);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Lỗi API quyền của vai trò không xác định";
      apiWarnings.push(
        `GET /roles/${selectedRoleId}/permissions thất bại: ${message}`,
      );
    }
  }

  let permissionCatalog: RolePermissionsBrowserPermission[] = [];
  let moduleSummaries: RbacPermissionModuleSummary[] = [];
  let selectedModuleKey: string | null = null;

  if (permissionModulesResult.status === "fulfilled") {
    moduleSummaries = permissionModulesResult.value;
    selectedModuleKey = moduleSummaries.some(
      (moduleSummary) => moduleSummary.moduleKey === requestedModuleKey,
    )
      ? requestedModuleKey
      : (moduleSummaries[0]?.moduleKey ?? null);

    const selectedModule = moduleSummaries.find(
      (moduleSummary) => moduleSummary.moduleKey === selectedModuleKey,
    );
    if (selectedModule) {
      try {
        const loadPage = (page: number, limit: number) =>
          executeAuthorizedApi(
            `GET /roles/${selectedRoleId ?? "me"}/permission-modules/${selectedModule.moduleKey}/permissions?page=${page}&limit=${limit}`,
            (accessToken) =>
              selectedRoleId
                ? rbacService.listPermissionModulePermissionsForRole(
                    selectedRoleId,
                    selectedModule.moduleKey,
                    { query: { page, limit }, accessToken },
                  )
                : rbacService.listMyPermissionModulePermissions(
                    selectedModule.moduleKey,
                    { query: { page, limit }, accessToken },
                  ),
          );
        const firstPage = await loadPage(1, MODULE_PERMISSION_PAGE_LIMIT);
        const safeLimit = firstPage.limit > 0 ? firstPage.limit : MODULE_PERMISSION_PAGE_LIMIT;
        const totalPages = Math.max(1, Math.ceil(firstPage.total / safeLimit));
        const remainingPages = totalPages > 1
          ? await Promise.all(
              Array.from({ length: totalPages - 1 }, (_, index) => loadPage(index + 2, safeLimit)),
            )
          : [];
        permissionCatalog = dedupePermissions(
          [...firstPage.items, ...remainingPages.flatMap((page) => page.items)].map((item) =>
            mapModulePermission(selectedModule, item),
          ),
        );
      } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Lỗi API quyền theo module không xác định";
      apiWarnings.push(
          `GET permission module ${selectedModule.moduleKey} thất bại: ${message}`,
      );
      }
    }
  } else {
    const message =
      permissionModulesResult.reason instanceof Error
        ? permissionModulesResult.reason.message
        : "Lỗi API danh sách module quyền không xác định";
    apiWarnings.push(`GET /roles/me/permission-modules thất bại: ${message}`);
  }

  if (permissionCatalog.length === 0 && selectedRoleId) {
    const fallbackRolePermissions =
      initialPermissionsByRoleId[selectedRoleId] ?? [];
    if (fallbackRolePermissions.length > 0) {
      permissionCatalog = dedupePermissions(fallbackRolePermissions);
    }
  }

  const warningsForAlert =
    permissionCatalog.length > 0
      ? apiWarnings.filter(
          (warning) => !warning.startsWith("GET /roles/me/permission-modules"),
        )
      : apiWarnings;
  return (
    <AdminShell
      activePath="/admin/roles"
      navItems={sidebarItems}
      subtitle="Chi tiết quyền theo vai trò"
    >
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

          <PermissionsWarningsAlert warnings={warningsForAlert} />

          <RolePermissionsBrowser
            roles={roles}
            permissionCatalog={permissionCatalog}
            permissionModuleSummaries={moduleSummaries}
            selectedModuleKey={selectedModuleKey}
            initialRoleId={selectedRoleId}
            initialPermissionsByRoleId={initialPermissionsByRoleId}
          />
        </div>
    </AdminShell>
  );
}
