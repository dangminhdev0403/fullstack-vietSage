"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import Swal from "sweetalert2";

import { HttpError } from "@/core/http/http-error";
import { requestInternalApi, requestInternalApiEnvelope } from "@/core/http/internal-api-client";
import type { RbacPermissionMethod } from "@/features/rbac/types/rbac-contract";

import { VsIcon } from "../../../_components/vs-icon";

export type RolePermissionsBrowserRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  userCount: number;
  enabledCount: number | null;
  createdAt: string;
};

export type RolePermissionsBrowserPermission = {
  id: string;
  method: RbacPermissionMethod;
  path: string;
  description: string;
  moduleKey?: string;
  moduleLabel?: string;
  moduleIcon?: string;
  enabled?: boolean;
};

type PermissionModule = {
  moduleKey: string;
  label: string;
  icon: string;
  permissions: RolePermissionsBrowserPermission[];
};

type RolePermissionsBrowserProps = {
  roles: RolePermissionsBrowserRole[];
  permissionCatalog: RolePermissionsBrowserPermission[];
  permissionModuleSummaries: Array<{
    moduleKey: string;
    moduleName: string;
    totalPermissions: number;
    enabledCount: number;
  }>;
  selectedModuleKey: string | null;
  initialRoleId: string | null;
  initialPermissionsByRoleId?: Record<
    string,
    RolePermissionsBrowserPermission[]
  >;
};

type PermissionsByRoleId = Record<string, RolePermissionsBrowserPermission[]>;
type DraftPermissionIdsByRoleId = Record<string, string[]>;
type LoadingByRoleId = Record<string, boolean>;
type SavingByRoleId = Record<string, boolean>;
type ErrorByRoleId = Record<string, string | null>;

const BUSINESS_MODULE_LABELS: Record<
  string,
  { label: string; icon: string; tone: string }
> = {
  "platform-users": {
    label: "Người dùng nền tảng",
    icon: "group",
    tone: "bg-sky-50 text-sky-700",
  },
  "platform-roles": {
    label: "Vai trò",
    icon: "verified_user",
    tone: "bg-indigo-50 text-indigo-700",
  },
  "platform-permissions": {
    label: "Phân quyền",
    icon: "admin_panel_settings",
    tone: "bg-amber-50 text-amber-800",
  },
  "platform-hotels": {
    label: "Khách sạn nền tảng",
    icon: "apartment",
    tone: "bg-cyan-50 text-cyan-700",
  },
  "hotel-dashboard": {
    label: "Dashboard khách sạn",
    icon: "dashboard",
    tone: "bg-emerald-50 text-emerald-700",
  },
  "hotel-rooms": {
    label: "Phòng",
    icon: "bed",
    tone: "bg-lime-50 text-lime-700",
  },
  "hotel-room-qr": {
    label: "QR phòng",
    icon: "qr_code",
    tone: "bg-yellow-50 text-yellow-800",
  },
  "hotel-stays": {
    label: "Lưu trú",
    icon: "hotel",
    tone: "bg-blue-50 text-blue-700",
  },
  "hotel-reservations": {
    label: "Đặt phòng & khách đến",
    icon: "event_available",
    tone: "bg-sky-50 text-sky-700",
  },
  "hotel-staff": {
    label: "Nhân viên khách sạn",
    icon: "group",
    tone: "bg-violet-50 text-violet-700",
  },
  "hotel-requests": {
    label: "Yêu cầu khách",
    icon: "room_service",
    tone: "bg-orange-50 text-orange-700",
  },
  "hotel-billing": {
    label: "Thanh toán",
    icon: "receipt_long",
    tone: "bg-rose-50 text-rose-700",
  },
  "hotel-services": {
    label: "Dịch vụ",
    icon: "concierge",
    tone: "bg-teal-50 text-teal-700",
  },
  "guest-experience": {
    label: "GuestOS",
    icon: "phonelink",
    tone: "bg-purple-50 text-purple-700",
  },
  "system-health": {
    label: "Hệ thống",
    icon: "monitor_heart",
    tone: "bg-slate-100 text-slate-700",
  },
};

const METHOD_BADGE_CLASS_MAP: Record<RbacPermissionMethod, string> = {
  GET: "bg-[var(--primary-fixed)] text-[var(--on-primary-fixed-variant)]",
  POST: "bg-[var(--secondary-container)] text-[var(--on-secondary-container)]",
  PUT: "bg-[var(--tertiary-fixed)] text-[var(--on-tertiary-fixed)]",
  PATCH:
    "bg-[color:rgba(254,214,91,0.28)] text-[var(--on-secondary-container)]",
  DELETE: "bg-[var(--error-container)] text-[var(--on-error-container)]",
  OPTIONS: "bg-[var(--surface-container)] text-[var(--on-surface-variant)]",
};

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function moduleKeyFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length >= 3 && segments[0] === "api" && segments[1] === "v1") {
    return segments[2] ?? "misc";
  }

  if (segments.length >= 2 && segments[0] === "permissions") {
    return segments[1] ?? "misc";
  }

  if (segments.length >= 1) {
    return segments[0] ?? "misc";
  }

  return "misc";
}

function moduleKeyFromPermission(
  permission: RolePermissionsBrowserPermission,
): string {
  const moduleKey = permission.moduleKey?.trim();
  if (moduleKey && moduleKey.length > 0) {
    return moduleKey;
  }

  return moduleKeyFromPath(permission.path);
}

function iconFromModuleKey(moduleKey: string): string {
  const configured = BUSINESS_MODULE_LABELS[moduleKey];
  if (configured) return configured.icon;

  const normalized = moduleKey.toLowerCase();

  if (normalized.includes("auth")) {
    return "verified";
  }

  if (normalized.includes("user") || normalized.includes("staff")) {
    return "group";
  }

  if (normalized.includes("room")) {
    return "bed";
  }

  if (normalized.includes("hotel")) {
    return "hotel";
  }

  if (normalized.includes("booking")) {
    return "schedule";
  }

  if (normalized.includes("dashboard") || normalized.includes("analytic")) {
    return "dashboard";
  }

  if (normalized.includes("role") || normalized.includes("permission")) {
    return "verified_user";
  }

  return "menu";
}

function toPermissionMethodBadgeClass(method: RbacPermissionMethod): string {
  return METHOD_BADGE_CLASS_MAP[method] ?? METHOD_BADGE_CLASS_MAP.OPTIONS;
}

function businessActionLabel(description: string): string {
  return description.replace(/^View /i, "Xem ").replace(/^Manage /i, "Quản lý ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload)) {
    const data = payload.data;
    if (
      isRecord(data) &&
      typeof data.detail === "string" &&
      data.detail.trim().length > 0
    ) {
      return data.detail;
    }

    if (
      typeof payload.message === "string" &&
      payload.message.trim().length > 0
    ) {
      return payload.message;
    }
  }

  return fallback;
}

function normalizePermissionIds(permissionIds: readonly string[]): string[] {
  const unique = new Set<string>();

  for (const permissionId of permissionIds) {
    if (typeof permissionId !== "string") {
      continue;
    }

    const normalized = permissionId.trim();
    if (normalized.length === 0) {
      continue;
    }

    unique.add(normalized);
  }

  return [...unique].sort((first, second) =>
    first.localeCompare(second, "en", { sensitivity: "base" }),
  );
}

function arePermissionIdsEqual(
  first: readonly string[],
  second: readonly string[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  const secondSet = new Set(second);
  for (const permissionId of first) {
    if (!secondSet.has(permissionId)) {
      return false;
    }
  }

  return true;
}

function countPermissionSelectionDelta(
  first: readonly string[],
  second: readonly string[],
): number {
  const firstSet = new Set(first);
  const secondSet = new Set(second);

  let delta = 0;

  for (const permissionId of firstSet) {
    if (!secondSet.has(permissionId)) {
      delta += 1;
    }
  }

  for (const permissionId of secondSet) {
    if (!firstSet.has(permissionId)) {
      delta += 1;
    }
  }

  return delta;
}

function parseRolePermissions(
  payload: unknown,
): RolePermissionsBrowserPermission[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("Phản hồi role-permissions không đúng định dạng");
  }

  const mapped: RolePermissionsBrowserPermission[] = [];
  for (const item of payload.data) {
    if (!isRecord(item)) {
      continue;
    }

    if (
      typeof item.id !== "string" ||
      typeof item.method !== "string" ||
      typeof item.path !== "string" ||
      typeof item.description !== "string"
    ) {
      continue;
    }

    const method = item.method.trim().toUpperCase() as RbacPermissionMethod;
    if (!Object.prototype.hasOwnProperty.call(METHOD_BADGE_CLASS_MAP, method)) {
      continue;
    }

    mapped.push({
      id: item.id,
      method,
      path: item.path,
      description: item.description,
    });
  }

  return mapped;
}

async function fetchRolePermissions(
  roleId: string,
): Promise<RolePermissionsBrowserPermission[]> {
  try {
    const permissions = await requestInternalApi<RolePermissionsBrowserPermission[]>(
    `/api/rbac/roles/${encodeURIComponent(roleId)}/permissions`,
    {
      method: "GET",
    },
    );

    return parseRolePermissions({ data: permissions });
  } catch (error) {
    if (error instanceof HttpError) {
    throw new Error(
        getErrorMessage(error.data, `Yêu cầu thất bại với mã ${error.status}`),
    );
  }

    throw error;
  }
}

async function replaceRolePermissions(
  roleId: string,
  permissionIds: readonly string[],
): Promise<RolePermissionsBrowserPermission[]> {
  try {
    const payload = await requestInternalApiEnvelope<RolePermissionsBrowserPermission[]>(
    `/api/rbac/roles/${encodeURIComponent(roleId)}/permissions`,
    {
      method: "PUT",
      body: { permissionIds },
    },
    );

    return parseRolePermissions(payload);
  } catch (error) {
    if (error instanceof HttpError) {
    throw new Error(
        getErrorMessage(error.data, `Yêu cầu thất bại với mã ${error.status}`),
    );
  }

    throw error;
  }
}
function showLoadingBox(title: string, text: string): void {
  void Swal.fire({
    title,
    text,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

function closeLoadingBox(): void {
  if (Swal.isVisible()) {
    Swal.close();
  }
}

function buildPermissionModules(
  permissions: readonly RolePermissionsBrowserPermission[],
): PermissionModule[] {
  const map = new Map<string, RolePermissionsBrowserPermission[]>();

  for (const permission of permissions) {
    const moduleKey = moduleKeyFromPermission(permission);
    const list = map.get(moduleKey) ?? [];
    list.push(permission);
    map.set(moduleKey, list);
  }

  return [...map.entries()]
    .map(([moduleKey, items]) => {
      const sortedPermissions = [...items].sort((first, second) => {
        const pathCompare = first.path.localeCompare(second.path, "en", {
          sensitivity: "base",
        });
        if (pathCompare !== 0) {
          return pathCompare;
        }

        return first.method.localeCompare(second.method, "en", {
          sensitivity: "base",
        });
      });

      return {
        moduleKey,
        label: BUSINESS_MODULE_LABELS[moduleKey]?.label ?? items[0]?.moduleLabel ?? toTitleCase(moduleKey),
        icon: BUSINESS_MODULE_LABELS[moduleKey]?.icon ?? items[0]?.moduleIcon ?? iconFromModuleKey(moduleKey),
        permissions: sortedPermissions,
      } satisfies PermissionModule;
    })
    .sort((first, second) =>
      first.label.localeCompare(second.label, "en", { sensitivity: "base" }),
    );
}

function normalizeInitialRoleId(
  roles: readonly RolePermissionsBrowserRole[],
  initialRoleId: string | null,
): string | null {
  if (initialRoleId && roles.some((role) => role.id === initialRoleId)) {
    return initialRoleId;
  }

  return roles[0]?.id ?? null;
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

function toInitialDraftMap(
  initialPermissionsByRoleId: Record<
    string,
    RolePermissionsBrowserPermission[]
  >,
): DraftPermissionIdsByRoleId {
  const initialDraft: DraftPermissionIdsByRoleId = {};

  for (const [roleId, permissions] of Object.entries(
    initialPermissionsByRoleId,
  )) {
    initialDraft[roleId] = normalizePermissionIds(
      permissions.map((permission) => permission.id),
    );
  }

  return initialDraft;
}

export function RolePermissionsBrowser(props: RolePermissionsBrowserProps) {
  const {
    roles,
    permissionCatalog,
    permissionModuleSummaries,
    selectedModuleKey,
    initialRoleId,
    initialPermissionsByRoleId = {},
  } = props;

  const initialSelectedRoleId = normalizeInitialRoleId(roles, initialRoleId);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    initialSelectedRoleId,
  );
  const [permissionsByRoleId, setPermissionsByRoleId] =
    useState<PermissionsByRoleId>(initialPermissionsByRoleId);
  const [draftPermissionIdsByRoleId, setDraftPermissionIdsByRoleId] =
    useState<DraftPermissionIdsByRoleId>(() =>
      toInitialDraftMap(initialPermissionsByRoleId),
    );
  const [loadingByRoleId, setLoadingByRoleId] = useState<LoadingByRoleId>({});
  const [savingByRoleId, setSavingByRoleId] = useState<SavingByRoleId>({});
  const [errorByRoleId, setErrorByRoleId] = useState<ErrorByRoleId>({});

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? null;

  const selectedRoleHasCache = selectedRoleId
    ? Object.prototype.hasOwnProperty.call(permissionsByRoleId, selectedRoleId)
    : false;

  const selectedRolePermissions = useMemo(
    () => (selectedRoleId ? (permissionsByRoleId[selectedRoleId] ?? []) : []),
    [permissionsByRoleId, selectedRoleId],
  );

  const selectedRoleLoading = selectedRoleId
    ? loadingByRoleId[selectedRoleId] === true
    : false;
  const selectedRoleSaving = selectedRoleId
    ? savingByRoleId[selectedRoleId] === true
    : false;
  const selectedRoleError = selectedRoleId
    ? (errorByRoleId[selectedRoleId] ?? null)
    : null;

  const selectedRoleAssignedPermissionIds = useMemo(
    () =>
      normalizePermissionIds(
        selectedRolePermissions.map((permission) => permission.id),
      ),
    [selectedRolePermissions],
  );

  const selectedRoleAssignedPermissionIdSet = useMemo(
    () => new Set(selectedRoleAssignedPermissionIds),
    [selectedRoleAssignedPermissionIds],
  );

  const selectedRoleDraftPermissionIds = useMemo(() => {
    if (!selectedRoleId) {
      return [];
    }

    return (
      draftPermissionIdsByRoleId[selectedRoleId] ??
      selectedRoleAssignedPermissionIds
    );
  }, [
    draftPermissionIdsByRoleId,
    selectedRoleAssignedPermissionIds,
    selectedRoleId,
  ]);

  const selectedRoleDraftPermissionIdSet = useMemo(
    () => new Set(selectedRoleDraftPermissionIds),
    [selectedRoleDraftPermissionIds],
  );

  const selectedRoleHasUnsavedChanges = selectedRoleHasCache
    ? !arePermissionIdsEqual(
        selectedRoleAssignedPermissionIds,
        selectedRoleDraftPermissionIds,
      )
    : false;

  const selectedRoleUnsavedChangesCount = selectedRoleHasCache
    ? countPermissionSelectionDelta(
        selectedRoleAssignedPermissionIds,
        selectedRoleDraftPermissionIds,
      )
    : 0;

  const loadRolePermissions = useCallback(
    async (roleId: string) => {
      if (permissionsByRoleId[roleId] || loadingByRoleId[roleId]) {
        return;
      }

      setLoadingByRoleId((previous) => ({ ...previous, [roleId]: true }));
      setErrorByRoleId((previous) => ({ ...previous, [roleId]: null }));

      try {
        const permissions = await fetchRolePermissions(roleId);
        const assignedPermissionIds = normalizePermissionIds(
          permissions.map((permission) => permission.id),
        );

        setPermissionsByRoleId((previous) => ({
          ...previous,
          [roleId]: permissions,
        }));
        setDraftPermissionIdsByRoleId((previous) => ({
          ...previous,
          [roleId]: assignedPermissionIds,
        }));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Không tải được quyền của vai trò";
        setErrorByRoleId((previous) => ({ ...previous, [roleId]: message }));
      } finally {
        setLoadingByRoleId((previous) => ({ ...previous, [roleId]: false }));
      }
    },
    [loadingByRoleId, permissionsByRoleId],
  );

  const permissionModules = useMemo(
    () => buildPermissionModules(permissionCatalog),
    [permissionCatalog],
  );

  const selectedRoleTotalPermissions = selectedRoleHasCache
    ? selectedRoleDraftPermissionIdSet.size
    : (selectedRole?.enabledCount ?? 0);

  const mutateSelectedRoleDraft = useCallback(
    (mutator: (draft: Set<string>) => void) => {
      if (!selectedRoleId) {
        return;
      }

      setDraftPermissionIdsByRoleId((previous) => {
        const fallbackAssignedIds =
          permissionsByRoleId[selectedRoleId]?.map(
            (permission) => permission.id,
          ) ?? [];
        const currentDraftSet = new Set(
          previous[selectedRoleId] ?? fallbackAssignedIds,
        );

        mutator(currentDraftSet);

        return {
          ...previous,
          [selectedRoleId]: normalizePermissionIds([...currentDraftSet]),
        };
      });
    },
    [permissionsByRoleId, selectedRoleId],
  );

  const handlePermissionToggle = useCallback(
    (permissionId: string, nextChecked: boolean) => {
      mutateSelectedRoleDraft((draftSet) => {
        if (nextChecked) {
          draftSet.add(permissionId);
          return;
        }

        draftSet.delete(permissionId);
      });
    },
    [mutateSelectedRoleDraft],
  );

  const handleResetPermission = useCallback(
    (permissionId: string) => {
      const shouldBeAssigned =
        selectedRoleAssignedPermissionIdSet.has(permissionId);

      mutateSelectedRoleDraft((draftSet) => {
        if (shouldBeAssigned) {
          draftSet.add(permissionId);
          return;
        }

        draftSet.delete(permissionId);
      });
    },
    [mutateSelectedRoleDraft, selectedRoleAssignedPermissionIdSet],
  );

  const handleModuleSelectAll = useCallback(
    (permissions: readonly RolePermissionsBrowserPermission[]) => {
      mutateSelectedRoleDraft((draftSet) => {
        for (const permission of permissions) {
          draftSet.add(permission.id);
        }
      });
    },
    [mutateSelectedRoleDraft],
  );

  const handleModuleDisableAll = useCallback(
    (permissions: readonly RolePermissionsBrowserPermission[]) => {
      mutateSelectedRoleDraft((draftSet) => {
        for (const permission of permissions) {
          draftSet.delete(permission.id);
        }
      });
    },
    [mutateSelectedRoleDraft],
  );

  async function handleResetChanges() {
    if (!selectedRoleId || !selectedRoleHasCache || selectedRoleSaving) {
      return;
    }

    if (!selectedRoleHasUnsavedChanges) {
      await Swal.fire({
        icon: "info",
        title: "Không có thay đổi để đặt lại",
        text: "Dữ liệu nhập đã trùng với máy chủ?",
        confirmButtonText: "Đồng ý",
        timer: 2200,
        timerProgressBar: true,
      });
      return;
    }

    const resetConfirmation = await Swal.fire({
      icon: "warning",
      title: "Đặt lại tất cả thay đổi?",
      text: "Hành động này sẽ khôi phục dữ liệu về ban đầu.",
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: "Đồng ý ",
      cancelButtonText: "Huỷ",
    });

    if (!resetConfirmation.isConfirmed) {
      return;
    }

    showLoadingBox("Đang xử lí..", "Xin chờ.");

    setDraftPermissionIdsByRoleId((previous) => ({
      ...previous,
      [selectedRoleId]: selectedRoleAssignedPermissionIds,
    }));

    closeLoadingBox();

    await Swal.fire({
      icon: "success",
      title: "Đã đặt lại thay đổi",
      text: "Dữ liệu về ban đầu sẽ khôi phục.",
      confirmButtonText: "Đồng ý",
      timer: 2200,
      timerProgressBar: true,
    });
  }

  const selectedRoleName =
    selectedRole?.name ?? selectedRoleId ?? "vài trò đã chọn";

  async function handleSaveChanges() {
    if (!selectedRoleId || !selectedRoleHasCache || selectedRoleSaving) {
      return;
    }

    if (!selectedRoleHasUnsavedChanges) {
      await Swal.fire({
        icon: "info",
        title: "Không có quyền nào thay đổi để lưu",
        text: "Không có thay đổi nào cho vai trò này.",
        confirmButtonText: "Đồng ý",
        timer: 2200,
        timerProgressBar: true,
      });
      return;
    }

    const saveConfirmation = await Swal.fire({
      icon: "question",
      title: "Lưu thay đổi quyền?",
      text: "Hành động này sẽ thay thế dữ liệu hiện tại.",
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: "Đồng ý lưu",
      cancelButtonText: "Huỷ",
    });

    if (!saveConfirmation.isConfirmed) {
      return;
    }

    const nextPermissionIds = normalizePermissionIds(
      selectedRoleDraftPermissionIds,
    );

    showLoadingBox("Đang lưu...", "Vui lòng chờ.");

    setSavingByRoleId((previous) => ({ ...previous, [selectedRoleId]: true }));
    setErrorByRoleId((previous) => ({ ...previous, [selectedRoleId]: null }));

    try {
      const updatedPermissions = await replaceRolePermissions(
        selectedRoleId,
        nextPermissionIds,
      );
      const confirmedPermissionIds = normalizePermissionIds(
        updatedPermissions.map((permission) => permission.id),
      );

      setPermissionsByRoleId((previous) => ({
        ...previous,
        [selectedRoleId]: updatedPermissions,
      }));

      setDraftPermissionIdsByRoleId((previous) => ({
        ...previous,
        [selectedRoleId]: confirmedPermissionIds,
      }));

      closeLoadingBox();

      await Swal.fire({
        icon: "success",
        title: "Đã lưu thay đổi",
        text: `${selectedRoleName} có ${confirmedPermissionIds.length} Quyền đang hoạt động.`,
        confirmButtonText: "Đồng ý",
        timer: 2200,
        timerProgressBar: true,
      });
    } catch (error) {
      closeLoadingBox();

      const message =
        error instanceof Error
          ? error.message
          : "Không lưu được thay đổi do lỗi không xác định.";
      setErrorByRoleId((previous) => ({
        ...previous,
        [selectedRoleId]: message,
      }));

      await Swal.fire({
        icon: "error",
        title: "Lưu thất bại",
        text: message,
        confirmButtonText: "Đồng ý",
        timer: 3200,
        timerProgressBar: true,
      });
    } finally {
      closeLoadingBox();
      setSavingByRoleId((previous) => ({
        ...previous,
        [selectedRoleId]: false,
      }));
    }
  }

  return (
    <>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {roles.map((role) => {
            const isActive = role.id === selectedRole?.id;
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => {
                  setSelectedRoleId(role.id);
                  void loadRolePermissions(role.id);
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.05em] transition-colors ${
                  isActive
                    ? "bg-[var(--primary)] text-[var(--on-primary)]"
                    : "bg-[var(--surface-container)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]"
                }`}
              >
                {role.code}
              </button>
            );
          })}
        </div>

        <nav className="flex gap-2 overflow-x-auto rounded-xl border border-[var(--outline-variant)] bg-white p-3" aria-label="Nhóm quyền">
          {permissionModuleSummaries.map((moduleSummary) => {
            const active = moduleSummary.moduleKey === selectedModuleKey;
            const params = new URLSearchParams();
            if (selectedRoleId) params.set("roleId", selectedRoleId);
            params.set("module", moduleSummary.moduleKey);
            return (
              <Link
                key={moduleSummary.moduleKey}
                href={`/admin/permissions?${params.toString()}`}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${active ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-container-low)] text-[var(--primary)]"}`}
              >
                {BUSINESS_MODULE_LABELS[moduleSummary.moduleKey]?.label ?? moduleSummary.moduleName}
                <span className="ml-2 opacity-70">{moduleSummary.enabledCount}/{moduleSummary.totalPermissions}</span>
              </Link>
            );
          })}
        </nav>

        <article className="vs-card rounded-2xl border-l-4 border-l-[var(--primary)] p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h1 className="vs-display text-[34px] font-semibold leading-none text-[var(--primary)]">
                  Cấu hình truy cập: {selectedRole?.name ?? "Chưa chọn vai trò"}
                </h1>
                {selectedRole ? (
                  <span className="rounded-full bg-[var(--primary-fixed)] px-3 py-1 text-xs font-bold uppercase tracking-[0.06em] text-[var(--on-primary-fixed)]">
                    {selectedRole.code}
                  </span>
                ) : null}
              </div>

              <p className="max-w-4xl text-sm text-[var(--on-surface-variant)]">
                {selectedRole?.description ??
                  "Chọn vai trò để bật/tắt các quyền nghiệp vụ theo nhóm chức năng."}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--outline)]">
                <span>
                  Ngày tạo:{" "}
                  {selectedRole
                    ? formatDate(selectedRole.createdAt)
                    : "Không có"}
                </span>
              </div>
            </div>

            <div className="min-w-[140px] rounded-xl border border-[color:rgba(198,197,213,0.3)] bg-[var(--surface-container-low)] px-4 py-3 text-center">
              <p className="vs-display text-[42px] font-bold leading-none text-[var(--primary)]">
                {selectedRoleTotalPermissions}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--outline)]">
                Quyền nghiệp vụ
              </p>
            </div>
          </div>
        </article>

        {selectedRoleError ? (
          <section className="rounded-xl border border-[color:rgba(186,26,26,0.2)] bg-[var(--error-container)]/60 px-4 py-3 text-sm text-[var(--on-error-container)]">
            <p>{selectedRoleError}</p>
            {selectedRoleId ? (
              <button
                type="button"
                onClick={() => {
                  setPermissionsByRoleId((previous) => {
                    const next = { ...previous };
                    delete next[selectedRoleId];
                    return next;
                  });

                  setDraftPermissionIdsByRoleId((previous) => {
                    const next = { ...previous };
                    delete next[selectedRoleId];
                    return next;
                  });

                  setErrorByRoleId((previous) => ({
                    ...previous,
                    [selectedRoleId]: null,
                  }));
                  void loadRolePermissions(selectedRoleId);
                }}
                className="mt-2 inline-flex items-center rounded-md border border-[var(--outline)] px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]"
              >
                Thu lai
              </button>
            ) : null}
          </section>
        ) : null}

        {selectedRoleLoading ? (
          <section className="rounded-xl bg-[var(--surface-container-low)] px-4 py-4 text-sm text-[var(--on-surface-variant)]">
            Đang tải quyền ...
          </section>
        ) : null}

        {!selectedRoleLoading && !selectedRoleError && !selectedRoleHasCache ? (
          <section className="vs-card rounded-2xl p-6 text-sm text-[var(--on-surface-variant)]">
            Hãy chọn vai trò để xem quyền
          </section>
        ) : null}

        {!selectedRoleLoading &&
        !selectedRoleError &&
        selectedRoleHasCache &&
        permissionModules.length === 0 ? (
          <section className="vs-card rounded-2xl p-6 text-sm text-[var(--on-surface-variant)]">
            Không có danh mục quyền để hiển thị cho vai trò này.
          </section>
        ) : null}

        {!selectedRoleLoading &&
        !selectedRoleError &&
        selectedRoleHasCache &&
        permissionModules.length > 0 ? (
          <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {permissionModules.map((permissionModule) => {
              const moduleAssignedCount = permissionModule.permissions.reduce(
                (count, permission) => {
                  return (
                    count +
                    (selectedRoleDraftPermissionIdSet.has(permission.id)
                      ? 1
                      : 0)
                  );
                },
                0,
              );

              const moduleAllSelected =
                permissionModule.permissions.length > 0 &&
                moduleAssignedCount === permissionModule.permissions.length;
              const moduleAllDisabled = moduleAssignedCount === 0;

              return (
                <details
                  key={permissionModule.moduleKey}
                  className="group/module self-start overflow-hidden rounded-2xl border border-[var(--outline-variant)] bg-white shadow-[0px_12px_36px_rgba(0,0,0,0.06)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[color:rgba(198,197,213,0.3)] bg-[var(--surface-container-low)] p-6 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-center gap-2">
                      <VsIcon
                        name={permissionModule.icon}
                        className="text-[18px] text-[var(--secondary)]"
                      />
                      <div className="min-w-0">
                        <h2 className="vs-display text-[24px] font-semibold text-[var(--primary)]">
                          {permissionModule.label}
                        </h2>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--outline)]">
                          {moduleAssignedCount}/{permissionModule.permissions.length} quyền đang bật
                        </p>
                      </div>
                    </div>

                    <span
                      aria-hidden="true"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:rgba(198,197,213,0.65)] text-[var(--primary)]"
                    >
                      <VsIcon
                        name="arrow_forward"
                        className="text-[13px] rotate-90 transition-transform duration-200 group-open/module:-rotate-90"
                      />
                    </span>
                  </summary>

                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg bg-[var(--surface-container-low)] px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          handleModuleSelectAll(permissionModule.permissions);
                        }}
                        disabled={
                          selectedRoleSaving ||
                          permissionModule.permissions.length === 0
                        }
                        className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                          moduleAllSelected
                            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
                            : "border-[var(--outline-variant)] text-[var(--outline)] hover:bg-[var(--surface-container-high)]"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                        aria-label={`Chọn tất cả quyền trong ${permissionModule.label}`}
                      >
                        <VsIcon name="done_all" className="text-[12px]" />
                        Chọn tất cả
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleModuleDisableAll(permissionModule.permissions);
                        }}
                        disabled={
                          selectedRoleSaving ||
                          permissionModule.permissions.length === 0
                        }
                        className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                          moduleAllDisabled
                            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
                            : "border-[var(--outline-variant)] text-[var(--outline)] hover:bg-[var(--surface-container-high)]"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                        aria-label={`Bỏ chọn tất cả quyền trong ${permissionModule.label}`}
                      >
                        <VsIcon name="block" className="text-[12px]" />
                        Bỏ chọn tất cả
                      </button>
                    </div>

                    {permissionModule.permissions.map((permission) => {
                      const badgeClass = toPermissionMethodBadgeClass(permission.method);
                      const isAssigned = selectedRoleDraftPermissionIdSet.has(
                        permission.id,
                      );
                      const isAssignedFromApi =
                        selectedRoleAssignedPermissionIdSet.has(permission.id);
                      const isPermissionDirty =
                        isAssigned !== isAssignedFromApi;

                      return (
                        <div
                          key={permission.id}
                          className={`group flex items-center justify-between rounded-xl border p-3 transition-colors ${
                            isAssigned
                              ? "border-[var(--primary)]/20 bg-[var(--primary-fixed)]/35"
                              : "border-transparent bg-[var(--surface-container-low)]"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <span
                              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                                BUSINESS_MODULE_LABELS[permissionModule.moduleKey]?.tone ?? "bg-[var(--surface-container)] text-[var(--primary)]"
                              }`}
                            >
                              <VsIcon name={permissionModule.icon} className="text-[18px]" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[var(--on-surface)]">
                                {businessActionLabel(permission.description)}
                              </p>
                              <p className="mt-1 break-all text-[11px] font-mono text-[var(--outline)]">
                                <span className={`mr-2 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] ${badgeClass}`}>
                                  {permission.method}
                                </span>
                                {permission.path}
                              </p>
                            </div>
                          </div>

                          <div className="ml-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                handleResetPermission(permission.id);
                              }}
                              disabled={
                                selectedRoleSaving || !isPermissionDirty
                              }
                              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[var(--outline-variant)] text-[var(--outline)] transition-colors hover:bg-[var(--surface-container-low)] disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Đặt lại quyền ${permission.description}theo giá trị ban đầu`}
                              title={
                                isPermissionDirty
                                  ? "Đặt lại quyền này"
                                  : "Đã đồng bộ"
                              }
                            >
                              <VsIcon
                                name="restart_alt"
                                className="text-[14px]"
                              />
                            </button>

                            <label className="relative inline-flex h-5 w-10 cursor-pointer items-center">
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                onChange={(event) => {
                                  handlePermissionToggle(
                                    permission.id,
                                    event.currentTarget.checked,
                                  );
                                }}
                                disabled={selectedRoleSaving}
                                className="peer sr-only"
                                aria-label={`Quyền ${permission.description}`}
                              />
                              <span
                                className={`h-5 w-10 rounded-full transition-colors ${
                                  isAssigned
                                    ? "bg-[var(--primary)]"
                                    : "bg-[var(--surface-container-high)]"
                                }`}
                              />
                              <span
                                className={`pointer-events-none absolute h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                  isAssigned ? "left-5" : "left-1"
                                }`}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </section>
        ) : null}
      </section>

      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-[color:rgba(198,197,213,0.25)] bg-[color:rgba(255,255,255,0.9)] px-4 py-3 backdrop-blur md:left-80 md:px-10">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-[var(--primary)]">
              {selectedRoleHasCache
                ? `${selectedRoleUnsavedChangesCount} thay đổi chưa lưu`
                : "Chưa chọn vai trò"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleResetChanges}
              disabled={!selectedRoleHasCache || selectedRoleSaving}
              className="cursor-pointer rounded-lg border border-[var(--primary)] px-5 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Đặt lại
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSaveChanges();
              }}
              disabled={!selectedRoleHasUnsavedChanges || selectedRoleSaving}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--primary)] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--on-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <VsIcon
                name={selectedRoleSaving ? "hourglass_top" : "task_alt"}
                className="text-[14px]"
              />
              {selectedRoleSaving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}
