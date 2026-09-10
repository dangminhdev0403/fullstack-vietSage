import { auth } from "@/auth";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import { rbacService } from "@/features/rbac/service/rbac-service-instance";
import type { RbacRole } from "@/features/rbac/types/rbac-contract";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { VsIcon } from "../../_components/vs-icon";
import {
  type ModuleSummary,
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
    type: role.type,
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
  const initialPermissionsByRoleId: Record<string, RolePermissionsBrowserPermission[]> = {};
  let allPermissions: RolePermissionsBrowserPermission[] = [];

  if (effectiveRoleId && roles.some((role) => role.id === effectiveRoleId)) {
    try {
      const capabilities = await executeAuthorizedApi(
        `GET /roles/${effectiveRoleId}/capabilities`,
        (accessToken) => rbacService.listRoleCapabilities(effectiveRoleId, accessToken),
      );
      allPermissions = capabilities.map((item) => ({
        id: item.id,
        key: item.key,
        description: item.description,
        moduleKey: item.domain,
        moduleLabel: item.domain,
        risk: item.risk,
        enabled: item.enabled,
      }));
      initialPermissionsByRoleId[effectiveRoleId] = allPermissions.filter((item) => item.enabled);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lỗi API capability không xác định";
      apiWarnings.push(`GET capabilities cho ${effectiveRoleId} thất bại: ${message}`);
    }
  }

  const moduleSummaries = Object.values(
    allPermissions.reduce<Record<string, ModuleSummary>>((summaries, permission) => {
      const moduleKey = permission.moduleKey ?? "misc";
      const summary = summaries[moduleKey] ?? {
        moduleKey,
        moduleName: permission.moduleLabel ?? moduleKey,
        totalPermissions: 0,
        enabledCount: 0,
      };
      summary.totalPermissions += 1;
      if (permission.enabled) summary.enabledCount += 1;
      summaries[moduleKey] = summary;
      return summaries;
    }, {}),
  );

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
