"use client";

import { useMemo, useState } from "react";

import type { RbacPermissionMethod } from "@/features/rbac/types/rbac-contract";

import { VsIcon } from "../../../_components/vs-icon";
import type {
  PermissionApiDescriptor,
  PermissionViewModel,
  RoleViewModel,
} from "../permission-types";

type PermissionWorkbenchProps = {
  roles: RoleViewModel[];
  permissionCatalog: PermissionViewModel[];
  apiInventory: PermissionApiDescriptor[];
  apiWarnings: string[];
};

type MethodFilter = "ALL" | RbacPermissionMethod;

const METHOD_FILTERS: readonly MethodFilter[] = [
  "ALL",
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];
const MATRIX_LIMIT = 40;

const methodToneClassMap: Record<RbacPermissionMethod, string> = {
  GET: "bg-[var(--primary-fixed)] text-[var(--on-primary-fixed-variant)]",
  POST: "bg-[var(--secondary-container)] text-[var(--on-secondary-container)]",
  PUT: "bg-[var(--tertiary-fixed)] text-[var(--on-tertiary-fixed)]",
  PATCH: "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]",
  DELETE: "bg-[var(--error-container)] text-[var(--on-error-container)]",
  OPTIONS: "bg-[var(--surface-container)] text-[var(--on-surface-variant)]",
};

function toPermissionKey(permission: PermissionViewModel): string {
  return `${permission.method}:${permission.path}`;
}

function sortPermissions(
  permissions: readonly PermissionViewModel[],
): PermissionViewModel[] {
  return [...permissions].sort((first, second) => {
    const byPath = first.path.localeCompare(second.path, "en", {
      sensitivity: "base",
    });
    if (byPath !== 0) {
      return byPath;
    }

    return first.method.localeCompare(second.method, "en", {
      sensitivity: "base",
    });
  });
}

function filterPermissions(
  permissions: readonly PermissionViewModel[],
  searchTerm: string,
  methodFilter: MethodFilter,
): PermissionViewModel[] {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return permissions.filter((permission) => {
    if (methodFilter !== "ALL" && permission.method !== methodFilter) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const searchableText =
      `${permission.path} ${permission.description} ${permission.method}`.toLowerCase();
    return searchableText.includes(normalizedSearch);
  });
}

function MethodBadge({ method }: { method: RbacPermissionMethod }) {
  return (
    <span
      className={`inline-flex min-w-[76px] items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${methodToneClassMap[method]}`}
    >
      {method}
    </span>
  );
}

export function PermissionWorkbench({
  roles,
  permissionCatalog,
  apiInventory,
  apiWarnings,
}: PermissionWorkbenchProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>(
    roles[0]?.id ?? "",
  );
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("ALL");

  const roleById = useMemo(() => {
    return new Map(roles.map((role) => [role.id, role]));
  }, [roles]);

  const selectedRole = roleById.get(selectedRoleId) ?? roles[0] ?? null;

  const totalRolePermissionLinks = useMemo(() => {
    return roles.reduce((sum, role) => sum + role.permissions.length, 0);
  }, [roles]);

  const catalogPermissions = useMemo(
    () => sortPermissions(permissionCatalog),
    [permissionCatalog],
  );

  const filteredCatalogPermissions = useMemo(() => {
    return filterPermissions(catalogPermissions, searchTerm, methodFilter);
  }, [catalogPermissions, methodFilter, searchTerm]);

  const filteredSelectedRolePermissions = useMemo(() => {
    if (!selectedRole) {
      return [];
    }

    const sorted = sortPermissions(selectedRole.permissions);
    return filterPermissions(sorted, searchTerm, methodFilter);
  }, [methodFilter, searchTerm, selectedRole]);

  const permissionKeysByRole = useMemo(() => {
    const dictionary = new Map<string, Set<string>>();

    for (const role of roles) {
      dictionary.set(
        role.id,
        new Set(
          role.permissions.map((permission) => toPermissionKey(permission)),
        ),
      );
    }

    return dictionary;
  }, [roles]);

  const matrixPermissions = useMemo(() => {
    return filteredCatalogPermissions.slice(0, MATRIX_LIMIT);
  }, [filteredCatalogPermissions]);

  const uncoveredPermissions = useMemo(() => {
    if (permissionCatalog.length === 0) {
      return 0;
    }

    const coveredKeys = new Set<string>();
    for (const role of roles) {
      for (const permission of role.permissions) {
        coveredKeys.add(toPermissionKey(permission));
      }
    }

    return permissionCatalog.filter(
      (permission) => !coveredKeys.has(toPermissionKey(permission)),
    ).length;
  }, [permissionCatalog, roles]);

  return (
    <div className="space-y-6">
      {apiWarnings.length > 0 ? (
        <section className="rounded-2xl border border-[color:rgba(186,26,26,0.2)] bg-[var(--error-container)]/65 p-4 text-[var(--on-error-container)]">
          <div className="flex items-start gap-3">
            <VsIcon name="question_answer" className="mt-1 text-[20px]" />
            <div>
              <p className="text-sm font-semibold">
                Canh bao ket noi API permission
              </p>
              <ul className="mt-1 space-y-1 text-sm opacity-95">
                {apiWarnings.map((warning) => (
                  <li key={warning}>- {warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.2)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
              Vai tro
            </p>
            <VsIcon
              name="group"
              className="text-[20px] text-[var(--primary)]"
            />
          </div>
          <p className="vs-display mt-3 text-[36px] font-bold leading-none text-[var(--primary)]">
            {roles.length}
          </p>
          <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
            Tổng số vai trò trong hệ thống
          </p>
        </article>

        <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.2)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
              Quyền
            </p>
            <VsIcon
              name="verified_user"
              className="text-[20px] text-[var(--primary)]"
            />
          </div>
          <p className="vs-display mt-3 text-[36px] font-bold leading-none text-[var(--primary)]">
            {permissionCatalog.length}
          </p>
          <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
            Danh sách endpoit có thể cấp quyền
          </p>
        </article>

        <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.2)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
              Lien ket
            </p>
            <VsIcon
              name="task_alt"
              className="text-[20px] text-[var(--primary)]"
            />
          </div>
          <p className="vs-display mt-3 text-[36px] font-bold leading-none text-[var(--primary)]">
            {totalRolePermissionLinks}
          </p>
          <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
            Tổng liên kết role-permission
          </p>
        </article>

        <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.2)] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
              Chua gan
            </p>
            <VsIcon
              name="more_horiz"
              className="text-[20px] text-[var(--primary)]"
            />
          </div>
          <p className="vs-display mt-3 text-[36px] font-bold leading-none text-[var(--primary)]">
            {uncoveredPermissions}
          </p>
          <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
            Permission chưa được gán role nào
          </p>
        </article>
      </section>

      <section className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.2)] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative flex w-full max-w-xl items-center">
            <VsIcon
              name="search"
              className="pointer-events-none absolute left-3 text-[18px] text-[var(--on-surface-variant)]"
            />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tim theo path, method hoac description"
              className="w-full rounded-xl border border-[color:rgba(198,197,213,0.55)] bg-[var(--surface-container-lowest)] py-3 pl-10 pr-3 text-sm text-[var(--on-surface)] outline-none transition-colors focus:border-[var(--primary)]"
            />
          </label>

          <div className="vs-scroll-x flex items-center gap-2 overflow-x-auto pb-1">
            {METHOD_FILTERS.map((method) => {
              const isActive = methodFilter === method;

              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setMethodFilter(method)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.05em] transition-colors ${
                    isActive
                      ? "bg-[var(--primary)] text-[var(--on-primary)]"
                      : "bg-[var(--surface-container)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]"
                  }`}
                >
                  {method}
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-3 text-sm text-[var(--on-surface-variant)]">
          Đang hiển thị{" "}
          <span className="font-semibold text-[var(--primary)]">
            {filteredCatalogPermissions.length}
          </span>{" "}
          quyền phù hợp bộ lọc
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.2)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="vs-display text-[28px] font-semibold text-[var(--primary)]">
              Danh sách Role
            </h2>
            <VsIcon
              name="group"
              className="text-[20px] text-[var(--primary)]"
            />
          </div>

          {roles.length === 0 ? (
            <p className="rounded-xl bg-[var(--surface-container)] px-4 py-3 text-sm text-[var(--on-surface-variant)]">
              Không tìm thấy role nào từ API.
            </p>
          ) : (
            <ul className="space-y-2">
              {roles.map((role) => {
                const isActive = (selectedRole?.id ?? "") === role.id;

                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        isActive
                          ? "border-[var(--primary)] bg-[var(--primary-fixed)]"
                          : "border-[color:rgba(198,197,213,0.45)] bg-[var(--surface-container-lowest)] hover:bg-[var(--surface-container-low)]"
                      }`}
                    >
                      <p className="text-sm font-semibold uppercase tracking-[0.04em] text-[var(--on-surface-variant)]">
                        {role.code}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-[var(--primary)]">
                        {role.name}
                      </p>
                      <p className="mt-2 text-xs text-[var(--on-surface-variant)]">
                        {role.permissions.length} quyền | {role.userCount} người
                        dung
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        <article className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.2)] p-6">
          {selectedRole ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">
                    Chi tiết vai trò
                  </p>
                  <h2 className="vs-display mt-1 text-[32px] font-semibold leading-none text-[var(--primary)]">
                    {selectedRole.name}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
                    Mã: {selectedRole.code}
                  </p>
                  {selectedRole.description ? (
                    <p className="mt-2 max-w-2xl text-sm text-[var(--on-surface-variant)]">
                      {selectedRole.description}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-[color:rgba(198,197,213,0.4)] bg-[var(--surface-container-low)] px-4 py-3 text-sm">
                  <p className="text-[var(--on-surface-variant)]">
                    Quyền sau bộ lọc
                  </p>
                  <p className="mt-1 text-2xl font-bold text-[var(--primary)]">
                    {filteredSelectedRolePermissions.length}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {filteredSelectedRolePermissions.length === 0 ? (
                  <p className="rounded-xl bg-[var(--surface-container)] px-4 py-3 text-sm text-[var(--on-surface-variant)]">
                    Vai trò này không có quyền nào trong bộ lọc.
                  </p>
                ) : (
                  filteredSelectedRolePermissions.map((permission) => (
                    <div
                      key={`${selectedRole.id}:${toPermissionKey(permission)}`}
                      className="flex flex-col gap-3 rounded-xl border border-[color:rgba(198,197,213,0.35)] bg-[var(--surface-container-lowest)] p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-[var(--primary)]">
                          {permission.path}
                        </p>
                        <p className="text-sm text-[var(--on-surface-variant)]">
                          {permission.description}
                        </p>
                      </div>
                      <MethodBadge method={permission.method} />
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="rounded-xl bg-[var(--surface-container)] px-4 py-3 text-sm text-[var(--on-surface-variant)]">
              Chưa có role để hiển thị.
            </p>
          )}
        </article>
      </section>

      <section className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.2)] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="vs-display text-[30px] font-semibold text-[var(--primary)]">
            Ma trận phân quyền
          </h2>
          <p className="text-sm text-[var(--on-surface-variant)]">
            {matrixPermissions.length} / {filteredCatalogPermissions.length}{" "}
            quyền được hiển thị trong ma trận theo bộ lọc.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[color:rgba(198,197,213,0.35)]">
          <table className="min-w-[960px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--surface-container-low)] text-left text-[var(--on-surface-variant)]">
                <th className="sticky left-0 z-10 min-w-[360px] border-b border-[color:rgba(198,197,213,0.35)] bg-[var(--surface-container-low)] px-4 py-3 font-semibold">
                  Permission
                </th>
                {roles.map((role) => {
                  const isSelected = role.id === selectedRole?.id;

                  return (
                    <th
                      key={`matrix-header-${role.id}`}
                      className={`min-w-[130px] border-b border-l border-[color:rgba(198,197,213,0.35)] px-3 py-3 text-center font-semibold ${
                        isSelected
                          ? "bg-[var(--primary-fixed)] text-[var(--primary)]"
                          : ""
                      }`}
                    >
                      {role.code}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {matrixPermissions.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(roles.length + 1, 1)}
                    className="px-4 py-5 text-[var(--on-surface-variant)]"
                  >
                    Không có permission nào phù hợp bộ lọc để hiển thị trong ma
                    trận.
                  </td>
                </tr>
              ) : (
                matrixPermissions.map((permission) => (
                  <tr
                    key={`matrix-row-${toPermissionKey(permission)}`}
                    className="odd:bg-white even:bg-[var(--surface-container-lowest)]"
                  >
                    <td className="sticky left-0 z-10 border-b border-[color:rgba(198,197,213,0.25)] bg-inherit px-4 py-3">
                      <div className="flex items-start gap-3">
                        <MethodBadge method={permission.method} />
                        <div>
                          <p className="font-semibold text-[var(--primary)]">
                            {permission.path}
                          </p>
                          <p className="text-xs text-[var(--on-surface-variant)]">
                            {permission.description}
                          </p>
                        </div>
                      </div>
                    </td>

                    {roles.map((role) => {
                      const key = toPermissionKey(permission);
                      const hasPermission =
                        permissionKeysByRole.get(role.id)?.has(key) ?? false;
                      const isSelected = role.id === selectedRole?.id;

                      return (
                        <td
                          key={`matrix-cell-${role.id}-${key}`}
                          className={`border-b border-l border-[color:rgba(198,197,213,0.25)] px-3 py-3 text-center ${
                            isSelected ? "bg-[var(--primary-fixed)]/45" : ""
                          }`}
                        >
                          {hasPermission ? (
                            <span className="inline-flex items-center justify-center rounded-full bg-[var(--success-bg)] p-1 text-[var(--success)]">
                              <VsIcon name="check" className="text-[14px]" />
                            </span>
                          ) : (
                            <span className="inline-block text-[var(--on-surface-variant)]/45">
                              -
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredCatalogPermissions.length > MATRIX_LIMIT ? (
          <p className="mt-3 text-xs text-[var(--on-surface-variant)]">
            Bản lọc nây chiềm {MATRIX_LIMIT}quền đầu để theo dõi trên dao diện
          </p>
        ) : null}
      </section>

      <section className="vs-card rounded-2xl border border-[color:rgba(198,197,213,0.2)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="vs-display text-[30px] font-semibold text-[var(--primary)]">
            API module quyền
          </h2>
          <span className="rounded-full bg-[var(--primary-fixed)] px-3 py-1 text-xs font-semibold text-[var(--on-primary-fixed-variant)]">
            Đã đồng bộ OpenAPI
          </span>
        </div>

        <ul className="space-y-2">
          {apiInventory.map((endpoint) => (
            <li
              key={endpoint.id}
              className="flex flex-col gap-2 rounded-xl border border-[color:rgba(198,197,213,0.35)] bg-[var(--surface-container-lowest)] px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-center gap-3">
                <MethodBadge method={endpoint.method} />
                <code className="text-sm font-semibold text-[var(--primary)]">
                  {endpoint.path}
                </code>
              </div>
              <p className="text-sm text-[var(--on-surface-variant)]">
                {endpoint.intent}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
