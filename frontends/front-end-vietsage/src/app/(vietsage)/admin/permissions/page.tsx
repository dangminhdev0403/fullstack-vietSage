import { auth } from "@/auth";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";

import { rbacService } from "@/features/rbac/service/rbac-service-instance";
import type { RbacRole } from "@/features/rbac/types/rbac-contract";
import { createAuthorizedApiExecutor } from "@/libs/server-api-auth";
import { VsIcon } from "../../_components/vs-icon";
import {
  type RolePermissionsBrowserRole,
  RolePermissionsBrowser,
} from "./_components/role-permissions-browser";
import type { RolePermissionsBrowserPermission } from "./permission-types";
import { PermissionsWarningsAlert } from "./_components/permissions-warnings-alert";

type PermissionsPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

const CANONICAL_ROLE_CODES = [
  "TENANT_OWNER",
  "HOTEL_FRONTDESK",
  "SERVICE_STAFF",
] as const;

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

  const roleType: RolePermissionsBrowserRole["type"] =
    role.type === "CUSTOM" ? "CUSTOM" : "SYSTEM_TEMPLATE";

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
    type: roleType,
    baseRoleId: typeof role.baseRoleId === "string" ? role.baseRoleId : null,
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
      ? toObjectArray<RbacRole>(rolesResult.value)
          .filter((role) => role.code !== "SUPER_ADMIN")
          .filter((role) => {
            if (role.type === "CUSTOM") return true;
            return (
              typeof role.code === "string" &&
              CANONICAL_ROLE_CODES.includes(
                role.code as (typeof CANONICAL_ROLE_CODES)[number],
              )
            );
          })
          .map(mapRole)
      : [];

  if (rolesResult.status === "rejected") {
    const message =
      rolesResult.reason instanceof Error
        ? rolesResult.reason.message
        : "Lỗi API roles không xác định";
    apiWarnings.push(`GET /roles thất bại: ${message}`);
  }

  const effectiveRoleId = selectedRoleId ?? roles[0]?.id ?? null;
  const initialPermissionsByRoleId: Record<
    string,
    RolePermissionsBrowserPermission[]
  > = {};

  if (effectiveRoleId && roles.some((role) => role.id === effectiveRoleId)) {
    try {
      const permissions = await executeAuthorizedApi(
        `GET /roles/${effectiveRoleId}/permissions`,
        (accessToken) =>
          rbacService.listRolePermissions(effectiveRoleId, accessToken),
      );
      initialPermissionsByRoleId[effectiveRoleId] = toObjectArray<{
        id: string;
        method: string;
        path: string;
        description?: string | null;
      }>(permissions).map((item) => ({
        id: typeof item.id === "string" ? item.id : "",
        method: typeof item.method === "string" ? item.method : "GET",
        path: typeof item.path === "string" ? item.path : "",
        description:
          typeof item.description === "string" && item.description.trim().length > 0
            ? item.description.trim()
            : `${item.method ?? "GET"} ${item.path ?? ""}`.trim(),
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Lỗi API permissions không xác định";
      apiWarnings.push(
        `GET permissions cho ${effectiveRoleId} thất bại: ${message}`,
      );
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      {/* ── Page Header matching reference design ── */}
      <header className="space-y-1">
        <Link
          href="/admin/roles"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900"
        >
          <VsIcon name="arrow_back" className="text-[14px]" />
          <span>Vai trò & Quyền</span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Vai trò & Quyền
        </h1>
        <p className="text-xs text-gray-500">
          Xem danh sách quyền hạn mặc định của các vai trò nghiệp vụ trong hệ thống.
        </p>
      </header>

      <PermissionsWarningsAlert warnings={apiWarnings} />

      <RolePermissionsBrowser
        roles={roles}
        initialRoleId={effectiveRoleId}
        initialPermissionsByRoleId={initialPermissionsByRoleId}
      />
    </div>
  );
}
