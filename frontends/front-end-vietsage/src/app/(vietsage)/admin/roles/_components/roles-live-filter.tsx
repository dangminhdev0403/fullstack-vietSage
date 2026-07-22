"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { z } from "zod";

import { HttpError } from "@/core/http/http-error";
import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";

import { VsIcon } from "../../../_components/vs-icon";

type RolePermissionView = {
  method: string;
  path: string;
};

export type RolesLiveFilterRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "DISABLED";
  permissionCount: number;
  createdAt: string;
  updatedAt: string;
  permissions: RolePermissionView[];
};

type RolesLiveFilterProps = {
  initialQuery: string;
  initialModule: string;
  moduleOptions: string[];
  roles: RolesLiveFilterRole[];
};

const SEARCH_DEBOUNCE_MS = 350;
const UNAUTHORIZED_REDIRECT_THRESHOLD = 3;
const UNAUTHORIZED_COUNTER_KEY = "vietsage:roles-api-401-count";
const PROTECTED_ROLE_CODES = new Set([
  "SUPER_ADMIN",
  "VIETSAGE_OPERATION",
  "HOTEL_OWNER",
]);

type RoleFormMode = "create" | "edit";

type RoleFormState = {
  name: string;
  description: string;
};

type RoleFormErrors = Partial<Record<keyof RoleFormState, string>>;

type RoleApiData = Partial<RolesLiveFilterRole> & {
  enabledCount?: number;
};

class AuthRedirectError extends Error {
  constructor() {
    super("AUTH_REDIRECT");
  }
}

class UnauthorizedApiError extends Error {
  constructor() {
    super("UNAUTHORIZED");
  }
}

function emptyRoleForm(): RoleFormState {
  return {
    name: "",
    description: "",
  };
}

const roleCreateFormSchema = z.object({
  name: z.string().trim().min(1, "Tên vai trò là bắt buộc."),
  description: z
    .string()
    .trim()
    .max(500, "Mô tả không được vượt quá 500 ký tự."),
});

const roleEditFormSchema = roleCreateFormSchema;

function getRoleFormErrors(
  mode: RoleFormMode,
  values: RoleFormState,
): RoleFormErrors {
  const normalizedValues = {
    ...values,
  };
  const result =
    mode === "create"
      ? roleCreateFormSchema.safeParse(normalizedValues)
      : roleEditFormSchema.safeParse(normalizedValues);

  if (result.success) {
    return {};
  }

  const fieldErrors = result.error.flatten().fieldErrors;
  return {
    name: fieldErrors.name?.[0],
    description: fieldErrors.description?.[0],
  };
}

function roleToFormState(role: RolesLiveFilterRole): RoleFormState {
  return {
    name: role.name,
    description: role.description ?? "",
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Không có";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
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

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFieldLabel(field: string): string {
  const fieldLabels: Record<string, string> = {
    code: "mã vai trò",
    name: "tên vai trò",
    roleId: "vai trò",
    userId: "người dùng",
  };

  return fieldLabels[field] ?? field;
}

function toDuplicateDetailMessage(detail: string): string {
  const match = detail.match(/^Duplicate value for field:\s*(.+)$/i);
  if (!match) {
    return detail;
  }

  const field = match[1]?.trim();
  return field
    ? `Giá trị của ${toFieldLabel(field)} đã tồn tại.`
    : "Giá trị đã tồn tại.";
}

function toApiErrorMessage(payload: unknown): string {
  if (isRecord(payload)) {
    const data = payload.data;
    if (isRecord(data)) {
      const detail = data.detail;
      if (Array.isArray(detail)) {
        const messages = detail
          .filter((item): item is string => typeof item === "string")
          .map(toDuplicateDetailMessage);

        if (messages.length > 0) {
          return messages.join("\n");
        }
      }

      if (typeof detail === "string" && detail.trim().length > 0) {
        return toDuplicateDetailMessage(detail.trim());
      }

      const fields = data.fields;
      if (Array.isArray(fields)) {
        const labels = fields
          .filter((item): item is string => typeof item === "string")
          .map(toFieldLabel);

        if (labels.length > 0) {
          return `Dữ liệu đã tồn tại cho: ${labels.join(", ")}.`;
        }
      }
    }

    const message = payload.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return "Yêu cầu thất bại";
}

function redirectToLogin(): never {
  Swal.close();

  const callbackUrl =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/admin/roles";

  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
    source: "roles-live-filter",
    reason: "backend_401_after_refresh_failed",
    pathname: callbackUrl,
  });

  window.location.assign(
    `/login?reauth=1&callbackUrl=${encodeURIComponent(callbackUrl)}`,
  );

  throw new AuthRedirectError();
}

function getUnauthorizedCount(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = Number(window.sessionStorage.getItem(UNAUTHORIZED_COUNTER_KEY));
  return Number.isFinite(value) ? value : 0;
}

function resetUnauthorizedCount(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(UNAUTHORIZED_COUNTER_KEY);
}

function handleUnauthorizedResponse(): never {
  if (typeof window === "undefined") {
    throw new UnauthorizedApiError();
  }

  const nextCount = getUnauthorizedCount() + 1;
  window.sessionStorage.setItem(UNAUTHORIZED_COUNTER_KEY, String(nextCount));

  if (nextCount >= UNAUTHORIZED_REDIRECT_THRESHOLD) {
    redirectToLogin();
  }

  Swal.close();
  throw new UnauthorizedApiError();
}

async function requestRole(
  path: string,
  options: { method: "POST" | "PATCH"; body?: unknown },
): Promise<RoleApiData> {
  try {
    const payload = await requestInternalApiEnvelope<RoleApiData>(path, options);
    resetUnauthorizedCount();
    return payload.data;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      handleUnauthorizedResponse();
    }

    if (error instanceof HttpError) {
      throw new Error(toApiErrorMessage(error.data));
    }

    throw error;
  }
}

async function confirmRoleAction({
  title,
  text,
  confirmButtonText,
  icon,
}: {
  title: string;
  text: string;
  confirmButtonText: string;
  icon: "question" | "warning";
}): Promise<boolean> {
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: "Hủy",
    confirmButtonColor: "#00003c",
    cancelButtonColor: "#767684",
    reverseButtons: true,
  });

  return result.isConfirmed;
}

async function showRoleWarning(message: string): Promise<void> {
  await Swal.fire({
    title: "Kiểm tra thông tin",
    text: message,
    icon: "warning",
    confirmButtonText: "Đã hiểu",
    confirmButtonColor: "#00003c",
  });
}

async function showRoleSuccess(message: string): Promise<void> {
  await Swal.fire({
    title: message,
    icon: "success",
    timer: 1400,
    showConfirmButton: false,
  });
}

async function showRoleError(error: unknown): Promise<void> {
  if (error instanceof AuthRedirectError) {
    return;
  }

  if (error instanceof UnauthorizedApiError) {
    return;
  }

  await Swal.fire({
    title: "Thao tác thất bại",
    text: error instanceof Error ? error.message : "Vui lòng thử lại.",
    icon: "error",
    confirmButtonText: "Đóng",
    confirmButtonColor: "#00003c",
  });
}

async function requestDeleteRole(roleId: string): Promise<void> {
  try {
    await requestInternalApiEnvelope<unknown>(`/api/rbac/roles/${encodeURIComponent(roleId)}`, {
      method: "DELETE",
    });
    resetUnauthorizedCount();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      handleUnauthorizedResponse();
    }

    if (error instanceof HttpError) {
      throw new Error(toApiErrorMessage(error.data));
    }

    throw error;
  }
}

function normalizeApiRole(
  role: RoleApiData,
  fallback?: RolesLiveFilterRole,
): RolesLiveFilterRole {
  const permissions = role.permissions ?? fallback?.permissions ?? [];
  const permissionCount =
    typeof role.permissionCount === "number"
      ? role.permissionCount
      : typeof role.enabledCount === "number"
        ? role.enabledCount
        : fallback?.permissionCount ?? permissions.length;

  return {
    id: role.id ?? fallback?.id ?? "",
    code: role.code ?? fallback?.code ?? "",
    name: role.name ?? fallback?.name ?? "",
    description:
      typeof role.description === "string"
        ? role.description
        : fallback?.description ?? null,
    status:
      role.status === "DISABLED"
        ? "DISABLED"
        : role.status === "ACTIVE"
          ? "ACTIVE"
          : fallback?.status ?? "ACTIVE",
    permissionCount,
    createdAt: role.createdAt ?? fallback?.createdAt ?? "",
    updatedAt: role.updatedAt ?? fallback?.updatedAt ?? "",
    permissions,
  };
}

export function RolesLiveFilter({
  initialQuery,
  initialModule,
  moduleOptions,
  roles,
}: RolesLiveFilterProps) {
  const router = useRouter();
  const [roleRows, setRoleRows] = useState(roles);
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [moduleFilter, setModuleFilter] = useState(
    initialModule.length > 0 ? initialModule : "all",
  );
  const [formMode, setFormMode] = useState<RoleFormMode>("create");
  const [editingRole, setEditingRole] = useState<RolesLiveFilterRole | null>(
    null,
  );
  const [formState, setFormState] = useState<RoleFormState>(emptyRoleForm);
  const [formErrors, setFormErrors] = useState<RoleFormErrors>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const normalizedModuleOptions = useMemo(
    () =>
      [
        ...new Set(moduleOptions.map((item) => item.trim()).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    [moduleOptions],
  );

  const filteredRoles = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase();

    return roleRows.filter((role) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        role.name.toLowerCase().includes(normalizedQuery) ||
        (role.description ?? "").toLowerCase().includes(normalizedQuery);

      if (!matchesQuery) {
        return false;
      }

      if (moduleFilter.length === 0 || moduleFilter === "all") {
        return true;
      }

      const roleModules = new Set(
        role.permissions.map((permission) =>
          moduleFromPath(permission.path).toLowerCase(),
        ),
      );
      return roleModules.has(moduleFilter);
    });
  }, [debouncedQuery, moduleFilter, roleRows]);

  const isDebouncing = query !== debouncedQuery;
  const isSubmitting = submittingAction !== null;

  function openCreateDialog() {
    setFormMode("create");
    setEditingRole(null);
    setFormState(emptyRoleForm());
    setFormErrors({});
    setIsDialogOpen(true);
  }

  function openEditDialog(role: RolesLiveFilterRole) {
    setFormMode("edit");
    setEditingRole(role);
    setFormState(roleToFormState(role));
    setFormErrors({});
    setIsDialogOpen(true);
  }

  function closeDialog() {
    if (isSubmitting) {
      return;
    }

    setIsDialogOpen(false);
    setEditingRole(null);
    setFormState(emptyRoleForm());
    setFormErrors({});
  }

  function resetRoleForm() {
    setFormState(editingRole ? roleToFormState(editingRole) : emptyRoleForm());
    setFormErrors({});
  }

  async function submitRoleForm() {
    const name = formState.name.trim();
    const description = formState.description.trim();
    const nextErrors = getRoleFormErrors(formMode, {
      name,
      description,
    });

    setFormErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      await showRoleWarning("Vui lòng kiểm tra lại thông tin vai trò.");
      return;
    }

    if (!name) {
      await showRoleWarning("Tên vai trò là bắt buộc.");
      return;
    }

    const confirmed = await confirmRoleAction({
      title: formMode === "create" ? "Tạo vai trò?" : "Lưu thay đổi vai trò?",
      text:
        formMode === "create"
          ? `Tạo vai trò ${name}.`
          : `Cập nhật thông tin vai trò ${editingRole?.name ?? name}.`,
      confirmButtonText: formMode === "create" ? "Đồng ý tạo" : "Đồng ý lưu",
      icon: "question",
    });
    if (!confirmed) {
      return;
    }

    try {
      setSubmittingAction("form");
      const rolePayload =
        formMode === "create"
          ? await requestRole("/api/rbac/roles", {
              method: "POST",
              body: {
                name,
                ...(description ? { description } : {}),
              },
            })
          : await requestRole(
              `/api/rbac/roles/${encodeURIComponent(editingRole?.id ?? "")}`,
              {
                method: "PATCH",
                body: {
                  name,
                  ...(description ? { description } : {}),
                },
              },
            );
      const role = normalizeApiRole(rolePayload, editingRole ?? undefined);

      setRoleRows((previous) => {
        if (formMode === "create") {
          return [role, ...previous];
        }

        return previous.map((item) => (item.id === role.id ? role : item));
      });
      setIsDialogOpen(false);
      setEditingRole(null);
      setFormState(emptyRoleForm());
      setFormErrors({});
      await showRoleSuccess(
        formMode === "create"
          ? "Đã tạo vai trò."
          : "Đã cập nhật vai trò.",
      );
      router.refresh();
    } catch (error) {
      await showRoleError(error);
    } finally {
      setSubmittingAction(null);
    }
  }

  async function disableRole(role: RolesLiveFilterRole) {
    if (role.status === "DISABLED") {
      return;
    }

    const confirmed = await confirmRoleAction({
      title: "Tắt vai trò?",
      text: `Vai trò "${role.name}" sẽ không còn cấp quyền cho người dùng.`,
      confirmButtonText: "Đồng ý tắt",
      icon: "warning",
    });
    if (!confirmed) {
      return;
    }

    try {
      setSubmittingAction(`disable:${role.id}`);
      const updatedRole = normalizeApiRole(await requestRole(
        `/api/rbac/roles/${encodeURIComponent(role.id)}/disable`,
        { method: "POST" },
      ), role);
      setRoleRows((previous) =>
        previous.map((item) => (item.id === updatedRole.id ? updatedRole : item)),
      );
      await showRoleSuccess("Đã disable vai trò.");
      router.refresh();
    } catch (error) {
      await showRoleError(error);
    } finally {
      setSubmittingAction(null);
    }
  }

  async function deleteRole(role: RolesLiveFilterRole) {
    const confirmed = await confirmRoleAction({
      title: "Xóa vai trò?",
      text: `Vai trò "${role.name}" sẽ bị xóa khỏi hệ thống.`,
      confirmButtonText: "Đồng ý xóa",
      icon: "warning",
    });
    if (!confirmed) {
      return;
    }

    try {
      setSubmittingAction(`delete:${role.id}`);
      await requestDeleteRole(role.id);
      setRoleRows((previous) => previous.filter((item) => item.id !== role.id));
      await showRoleSuccess("Đã xóa vai trò.");
      router.refresh();
    } catch (error) {
      await showRoleError(error);
    } finally {
      setSubmittingAction(null);
    }
  }

  return (
    <>
      <section className="grid grid-cols-12 gap-6">
        <div className="col-span-12 rounded-xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)] md:col-span-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--secondary)]">
                Tìm Kiếm
              </p>
              <div className="flex items-center gap-3">
                {isDebouncing ? (
                  <span className="text-sm font-medium text-[var(--outline)]">
                    Đang lọc...
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={openCreateDialog}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-[var(--on-primary)]"
                >
                  <VsIcon name="verified_user" className="text-[16px]" />
                  Tạo vai trò
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <VsIcon
                  name="search"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--outline)]"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm theo tên vai trò (Role)..."
                  className="w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-11 py-3 text-sm text-[var(--on-surface)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>

              <div className="relative w-full lg:w-56">
                <VsIcon
                  name="settings"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--outline)]"
                />
                <select
                  value={moduleFilter}
                  onChange={(event) => setModuleFilter(event.target.value)}
                  className="w-full appearance-none rounded-lg border-0 bg-[var(--surface-container-low)] px-11 py-3 text-sm text-[var(--on-surface)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <option value="all">Tất cả module</option>
                  {normalizedModuleOptions.map((moduleName) => (
                    <option key={moduleName} value={moduleName.toLowerCase()}>
                      {toTitleCase(moduleName)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <article className="col-span-12 rounded-xl border border-[color:rgba(254,214,91,0.4)] bg-[color:rgba(254,214,91,0.18)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.05)] md:col-span-4">
          <p className="text-sm text-[var(--on-secondary-container)]">
            Hiện đang có
          </p>
          <div className="mt-2 flex items-end justify-between">
            <p className="vs-display text-[42px] font-bold leading-none text-[var(--secondary)]">
              {filteredRoles.length}
            </p>
            <p className="pb-2 text-sm text-[var(--on-surface-variant)]">
              Vai trò phù hợp
            </p>
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-[color:rgba(198,197,213,0.2)] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="bg-[var(--surface-container-low)] text-sm font-semibold uppercase tracking-[0.08em] text-[var(--outline)]">
                <th className="px-6 py-4">Tên vai trò</th>
                <th className="px-6 py-4">Mã</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Mô tả</th>
                <th className="px-6 py-4">Quyền sở hữu</th>
                <th className="px-6 py-4">Ngày tạo</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:rgba(198,197,213,0.25)]">
              {filteredRoles.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-sm text-[var(--on-surface-variant)]"
                  >
                    Không có vai trò phù hợp bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                filteredRoles.map((role) => (
                  (() => {
                    const isDisabled = role.status === "DISABLED";
                    const isProtected = PROTECTED_ROLE_CODES.has(role.code);
                    const isRoleBusy =
                      submittingAction === `disable:${role.id}` ||
                      submittingAction === `delete:${role.id}`;

                    return (
                  <tr
                    key={role.id}
                    className={`transition-colors hover:bg-[var(--surface-container-lowest)] ${
                      isDisabled ? "opacity-70" : ""
                    }`}
                  >
                    <td className="px-6 py-5 font-semibold text-[var(--primary)]">
                      <Link
                        href={`/admin/permissions?roleId=${encodeURIComponent(role.id)}`}
                        className="rounded-sm underline-offset-2 hover:underline"
                        title={`Xem quyền của ${role.name}`}
                      >
                        {role.name}
                      </Link>
                    </td>
                    <td className="px-6 py-5 text-sm font-semibold text-[var(--outline)]">
                      {role.code}
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-sm font-bold ${
                          isDisabled
                            ? "bg-[var(--surface-container-high)] text-[var(--outline)]"
                            : "bg-[var(--primary-fixed)] text-[var(--on-primary-fixed)]"
                        }`}
                      >
                        {isDisabled ? "Disabled" : "Active"}
                      </span>
                    </td>
                    <td className="max-w-[360px] px-6 py-5 text-sm text-[var(--on-surface-variant)]">
                      {role.description ?? "Không có mô tả"}
                    </td>
                    <td className="px-6 py-5">
                      <Link
                        href={`/admin/permissions?roleId=${encodeURIComponent(role.id)}`}
                        className="inline-flex rounded-full bg-[var(--surface-container-high)] px-2.5 py-1 text-sm font-bold text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container)]"
                        title={`Xem quyền của ${role.name}`}
                      >
                        {role.permissionCount} mục
                      </Link>
                    </td>
                    <td className="px-6 py-5 text-sm text-[var(--outline)]">
                      {formatDate(role.createdAt)}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/permissions?roleId=${encodeURIComponent(role.id)}`}
                          className="rounded-lg p-2 text-[var(--outline)] transition-colors hover:bg-[var(--surface-container)] hover:text-[var(--primary)]"
                          title="Xem quyền"
                        >
                          <VsIcon name="key" className="text-[18px]" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEditDialog(role)}
                          className="rounded-lg p-2 text-[var(--outline)] transition-colors hover:bg-[var(--surface-container)] hover:text-[var(--primary)]"
                          title="Sửa vai trò"
                          disabled={isRoleBusy}
                        >
                          <VsIcon name="edit" className="text-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void disableRole(role)}
                          className="rounded-lg p-2 text-[var(--outline)] transition-colors hover:bg-[var(--surface-container)] hover:text-[var(--primary)] disabled:opacity-30"
                          title={
                            isProtected
                              ? "Vai trò được bảo vệ"
                              : "Disable vai trò"
                          }
                          disabled={isDisabled || isProtected || isRoleBusy}
                        >
                          <VsIcon name="block" className="text-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteRole(role)}
                          className="rounded-lg p-2 text-[var(--outline)] transition-colors hover:bg-[var(--surface-container)] hover:text-[var(--primary)] disabled:opacity-30"
                          title={
                            isProtected ? "Vai trò được bảo vệ" : "Xóa vai trò"
                          }
                          disabled={isProtected || isRoleBusy}
                        >
                          <VsIcon name="delete" className="text-[18px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                    );
                  })()
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:rgba(198,197,213,0.2)] bg-[var(--surface-container-low)] px-6 py-4 text-xs text-[var(--outline)]">
          <p>
            Đang hiển thị{" "}
            <span className="font-semibold text-[var(--on-surface)]">
              {filteredRoles.length === 0 ? 0 : 1}
            </span>
            {" - "}
            <span className="font-semibold text-[var(--on-surface)]">
              {filteredRoles.length}
            </span>{" "}
            trên tổng
            <span className="font-semibold text-[var(--on-surface)]">
              {" "}
              {roleRows.length}
            </span>{" "}
            vai trò
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              className="rounded border border-transparent p-2 opacity-30"
            >
              <VsIcon name="arrow_back" className="text-[16px]" />
            </button>
            <span className="rounded bg-[var(--primary)] px-3 py-1.5 text-[var(--on-primary)]">
              1
            </span>
            <button
              type="button"
              disabled
              className="rounded border border-transparent p-2 opacity-30"
            >
              <VsIcon name="arrow_forward" className="text-[16px]" />
            </button>
          </div>
        </div>
      </section>

      {isDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--secondary)]">
                  {formMode === "create" ? "Tạo vai trò" : "Sửa vai trò"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--primary)]">
                  {formMode === "create"
                    ? "Vai trò mới"
                    : editingRole?.name ?? "Vai trò"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-lg p-2 text-[var(--outline)] transition-colors hover:bg-[var(--surface-container)]"
                disabled={isSubmitting}
              >
                <VsIcon name="close" className="text-[18px]" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--outline)]">
                  Tên vai trò
                </span>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) =>
                    setFormState((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  onInput={() =>
                    setFormErrors((previous) => ({
                      ...previous,
                      name: undefined,
                    }))
                  }
                  disabled={isSubmitting}
                  className="w-full rounded-lg border-0 bg-[var(--surface-container-low)] px-4 py-3 text-sm text-[var(--on-surface)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
                {formErrors.name ? (
                  <span className="mt-1 block text-sm font-medium text-[var(--error)]">
                    {formErrors.name}
                  </span>
                ) : null}
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--outline)]">
                  Mô tả
                </span>
                <textarea
                  value={formState.description}
                  onChange={(event) =>
                    setFormState((previous) => ({
                      ...previous,
                      description: event.target.value,
                    }))
                  }
                  onInput={() =>
                    setFormErrors((previous) => ({
                      ...previous,
                      description: undefined,
                    }))
                  }
                  disabled={isSubmitting}
                  rows={4}
                  className="w-full resize-none rounded-lg border-0 bg-[var(--surface-container-low)] px-4 py-3 text-sm text-[var(--on-surface)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
                {formErrors.description ? (
                  <span className="mt-1 block text-sm font-medium text-[var(--error)]">
                    {formErrors.description}
                  </span>
                ) : null}
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={resetRoleForm}
                disabled={isSubmitting}
                className="rounded-lg border border-[var(--outline-variant)] px-4 py-2 text-sm font-semibold text-[var(--primary)] disabled:opacity-50"
              >
                Đặt lại
              </button>
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmitting}
                className="rounded-lg border border-[var(--outline-variant)] px-4 py-2 text-sm font-semibold text-[var(--primary)] disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void submitRoleForm()}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50"
              >
                <VsIcon
                  name={isSubmitting ? "schedule" : "task_alt"}
                  className="text-[16px]"
                />
                {isSubmitting ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
