import { auth } from "@/auth";
import { unstable_rethrow } from "next/navigation";

import { rbacService } from "@/features/rbac/service/rbac-service-instance";
import type { RbacRole } from "@/features/rbac/types/rbac-contract";
import type { DashboardNavItem } from "@/lib/frontend-navigation";
import { resolveDashboardNavigation } from "@/lib/frontend-navigation";
import { createAuthorizedApiExecutor } from "@/lib/server-api-auth";

import { VsDashboardSidebar } from "../../_components/vs-dashboard-sidebar";
import { VsIcon } from "../../_components/vs-icon";
import { VsTopBar } from "../../_components/vs-top-bar";
import {
  RolesLiveFilter,
  type RolesLiveFilterRole,
} from "./_components/roles-live-filter";

type RolePermissionView = {
  method: string;
  path: string;
};

type RolesPageProps = {
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

function moduleFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);

  if (segments.length >= 3 && segments[0] === "api" && segments[1] === "v1") {
    return segments[2] ?? "misc";
  }

  if (segments.length >= 2 && segments[0] === "permissions") {
    return segments[1] ?? "misc";
  }

  return segments[0] ?? "misc";
}

function mapRole(role: RbacRole): RolesLiveFilterRole {
  const rolePermissions = Array.isArray(role.rolePermissions)
    ? role.rolePermissions
    : [];

  const permissions = rolePermissions.flatMap((entry) => {
    if (!isRecord(entry) || !isRecord(entry.permission)) {
      return [];
    }

    const permission = entry.permission;
    if (
      typeof permission.method !== "string" ||
      typeof permission.path !== "string"
    ) {
      return [];
    }

    return [
      {
        method: permission.method,
        path: permission.path,
      } satisfies RolePermissionView,
    ];
  });

  const enabledCount =
    typeof role.enabledCount === "number" ? role.enabledCount : null;
  const permissionCount =
    permissions.length > 0 ? permissions.length : (enabledCount ?? 0);

  return {
    id: role.id,
    code: typeof role.code === "string" ? role.code : role.id,
    name: role.name,

    description: typeof role.description === "string" ? role.description : null,
    permissionCount,
    createdAt: typeof role.createdAt === "string" ? role.createdAt : "",
    updatedAt: typeof role.updatedAt === "string" ? role.updatedAt : "",
    status: role.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    permissions,
  };
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

function toQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return typeof value === "string" ? value : "";
}

export default async function AdminRolesPage({ searchParams }: RolesPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const moduleFilter = toQueryValue(resolvedSearchParams.module)
    .trim()
    .toLowerCase();

  const session = await auth();
  const executeAuthorizedApi = createAuthorizedApiExecutor({
    session,
    callbackUrl: "/admin/roles",
  });

  const rolesResults = await Promise.allSettled([
    executeAuthorizedApi("GET /roles", (accessToken) =>
      rbacService.listRoles(accessToken),
    ),
  ]);

  const rolesApiPayload = rolesResults[0];
  if (rolesApiPayload.status === "rejected") {
    unstable_rethrow(rolesApiPayload.reason);
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
      rolesPayload:
        rolesApiPayload.status === "fulfilled" ? rolesApiPayload.value : [],
    }),
  );

  const apiWarnings: string[] = [];

  const roles =
    rolesApiPayload.status === "fulfilled"
      ? toObjectArray<RbacRole>(rolesApiPayload.value).map(mapRole)
      : [];

  if (rolesApiPayload.status === "rejected") {
    const message =
      rolesApiPayload.reason instanceof Error
        ? rolesApiPayload.reason.message
        : "Lỗi API roles không xác định";
    apiWarnings.push(`GET /roles thất bại: ${message}`);
  }

  const allModules = [
    ...new Set(
      roles.flatMap((role) =>
        role.permissions.map((permission) => moduleFromPath(permission.path)),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <VsTopBar
        title="VietSage"
        brandLockup={false}
        titleClassName="text-[32px] font-semibold leading-none tracking-tight"
        showLeftControl={false}
        rightMode="profile"
        rightLabel="Quản trị viên"
        subtitle="Quản lý vai trò"
      />

      <VsDashboardSidebar activePath="/admin/roles" items={sidebarItems} />

      <main className="min-h-screen px-4 pb-24 pt-24 md:ml-80 md:px-10">
        <div className="mx-auto max-w-[1600px] space-y-8">
          {apiWarnings.length > 0 ? (
            <section className="rounded-xl border border-[color:rgba(186,26,26,0.2)] bg-[var(--error-container)]/60 px-4 py-3 text-sm text-[var(--on-error-container)]">
              {apiWarnings.map((warning) => (
                <p key={warning}>- {warning}</p>
              ))}
            </section>
          ) : null}

          <RolesLiveFilter
            initialQuery={toQueryValue(resolvedSearchParams.q)}
            initialModule={moduleFilter}
            moduleOptions={allModules}
            roles={roles}
          />

          <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <article className="rounded-xl border border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-6">
              <div className="mb-3 inline-flex rounded-full bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
                <VsIcon
                  name="verified_user"
                  className="text-[22px] text-[var(--secondary)]"
                />
              </div>
              <h3 className="text-lg font-semibold text-[var(--primary)]">
                Thực hành bảo mật tốt
              </h3>
              <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
                Kiểm tra quyền vai trò hằng tháng và thu hồi quyền không còn sử
                dụng để vận hành quản trị an toàn.
              </p>
            </article>

            <article className="rounded-xl border border-dashed border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-6">
              <div className="mb-3 inline-flex rounded-full bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
                <VsIcon
                  name="question_answer"
                  className="text-[22px] text-[var(--secondary)]"
                />
              </div>
              <h3 className="text-lg font-semibold text-[var(--primary)]">
                Cần hỗ trợ?
              </h3>
              <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
                Tham khảo sổ tay quản trị để nắm rõ cấp bậc vai trò và tiêu
                chuẩn quyền liên module.
              </p>
            </article>
          </section>
        </div>
      </main>
    </div>
  );
}
