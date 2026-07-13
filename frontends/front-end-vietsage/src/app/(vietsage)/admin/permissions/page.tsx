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
import type { DashboardNavItem } from "@/lib/frontend-navigation";
import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { VsDashboardSidebar } from "../../_components/vs-dashboard-sidebar";
import { VsIcon } from "../../_components/vs-icon";
import { VsTopBar } from "../../_components/vs-top-bar";
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

function buildPermissionCatalogFromModules(
  modules: readonly RbacPermissionModuleSummary[],
  pagesByModuleKey: ReadonlyMap<string, RbacPermissionModulePermissionItem[]>,
): RolePermissionsBrowserPermission[] {
  const catalog: RolePermissionsBrowserPermission[] = [];

  for (const moduleSummary of modules) {
    const moduleItems = pagesByModuleKey.get(moduleSummary.moduleKey) ?? [];
    for (const item of moduleItems) {
      catalog.push(mapModulePermission(moduleSummary, item));
    }
  }

  return dedupePermissions(catalog);
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

  const session = await auth();
  const executeAuthorizedApi = createAuthorizedApiExecutor({
    session,
    callbackUrl: "/admin/permissions",
  });

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
    await resolveDashboardNavigation({
      userRole: "admin",
      assignedRoles: [],
      permissions: [],
      accessToken: session?.accessToken ?? undefined,
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? null,
      refreshToken: session?.refreshToken ?? null,
      authError: session?.authError ?? null,
      rolesPayload: rolesResult.status === "fulfilled" ? rolesResult.value : [],
    }),
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

  if (permissionModulesResult.status === "fulfilled") {
    const moduleSummaries = permissionModulesResult.value;
    const moduleItemsByKey = new Map<
      string,
      RbacPermissionModulePermissionItem[]
    >();

    const modulePermissionsResults = await Promise.allSettled(
      moduleSummaries.map(async (moduleSummary) => {
        const operationBase = `/roles/me/permission-modules/${moduleSummary.moduleKey}/permissions`;

        const firstPage = await executeAuthorizedApi(
          `GET ${operationBase}?page=1&limit=${MODULE_PERMISSION_PAGE_LIMIT}`,
          (accessToken) =>
            selectedRoleId
              ? rbacService.listPermissionModulePermissionsForRole(
                  selectedRoleId,
                  moduleSummary.moduleKey,
                  {
                    query: { page: 1, limit: MODULE_PERMISSION_PAGE_LIMIT },
                    accessToken,
                  },
                )
              : rbacService.listMyPermissionModulePermissions(
                  moduleSummary.moduleKey,
                  {
                    query: { page: 1, limit: MODULE_PERMISSION_PAGE_LIMIT },
                    accessToken,
                  },
                ),
        );

        const safeLimit =
          firstPage.limit > 0 ? firstPage.limit : MODULE_PERMISSION_PAGE_LIMIT;
        const totalPages = Math.max(1, Math.ceil(firstPage.total / safeLimit));

        if (totalPages === 1) {
          return {
            moduleKey: moduleSummary.moduleKey,
            items: firstPage.items,
          };
        }

        const remainingPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, offset) => {
            const page = offset + 2;
            return executeAuthorizedApi(
              `GET ${operationBase}?page=${page}&limit=${safeLimit}`,
              (accessToken) =>
                selectedRoleId
                  ? rbacService.listPermissionModulePermissionsForRole(
                      selectedRoleId,
                      moduleSummary.moduleKey,
                      {
                        query: { page, limit: safeLimit },
                        accessToken,
                      },
                    )
                  : rbacService.listMyPermissionModulePermissions(
                      moduleSummary.moduleKey,
                      {
                        query: { page, limit: safeLimit },
                        accessToken,
                      },
                    ),
            );
          }),
        );

        return {
          moduleKey: moduleSummary.moduleKey,
          items: [
            ...firstPage.items,
            ...remainingPages.flatMap((pageData) => pageData.items),
          ],
        };
      }),
    );

    modulePermissionsResults.forEach((result, index) => {
      const moduleSummary = moduleSummaries[index];
      if (!moduleSummary) {
        return;
      }

      if (result.status === "fulfilled") {
        moduleItemsByKey.set(result.value.moduleKey, result.value.items);
        return;
      }

      const message =
        result.reason instanceof Error
          ? result.reason.message
          : "Lỗi API quyền theo module không xác định";
      apiWarnings.push(
        `GET /roles/me/permission-modules/${moduleSummary.moduleKey}/permissions thất bại: ${message}`,
      );
    });

    permissionCatalog = buildPermissionCatalogFromModules(
      moduleSummaries,
      moduleItemsByKey,
    );

    if (selectedRoleId) {
      initialPermissionsByRoleId[selectedRoleId] = permissionCatalog.filter(
        (permission) => permission.enabled === true,
      );
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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <VsTopBar
        title="VietSage"
        brandLockup={false}
        titleClassName="text-[32px] font-semibold leading-none tracking-tight"
        showLeftControl={false}
        rightMode="profile"
        rightLabel="Quản trị viên"
        subtitle="Chi tiết quyền theo vai trò"
      />

      <VsDashboardSidebar activePath="/admin/roles" items={sidebarItems} />

      <main className="min-h-screen px-4 pb-36 pt-24 md:ml-80 md:px-10">
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
            initialRoleId={selectedRoleId}
            initialPermissionsByRoleId={initialPermissionsByRoleId}
          />
        </div>
      </main>
    </div>
  );
}
