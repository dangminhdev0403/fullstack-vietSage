"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Swal from "sweetalert2";

import { HttpError } from "@/core/http/http-error";
import {
  requestInternalApi,
  requestInternalApiEnvelope,
} from "@/core/http/internal-api-client";
import type { RbacPermissionMethod } from "@/features/rbac/types/rbac-contract";

import { VsIcon } from "../../../_components/vs-icon";

/* ────────────────────────── exported types ────────────────────────── */

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

export type ModuleSummary = {
  moduleKey: string;
  moduleName: string;
  totalPermissions: number;
  enabledCount: number;
};

/* ────────────────────────── props ────────────────────────── */

type RolePermissionsBrowserProps = {
  roles: RolePermissionsBrowserRole[];
  permissionModuleSummaries: ModuleSummary[];
  initialRoleId: string | null;
  initialModuleKey: string | null;
  initialPermissionsByRoleId?: Record<
    string,
    RolePermissionsBrowserPermission[]
  >;
  allPermissions?: RolePermissionsBrowserPermission[];
};

/* ────────────────────────── constants ────────────────────────── */

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

function moduleLabel(moduleKey: string, fallbackName?: string): string {
  return BUSINESS_MODULE_LABELS[moduleKey]?.label ?? fallbackName ?? toTitleCase(moduleKey);
}

function moduleIcon(moduleKey: string): string {
  const configured = BUSINESS_MODULE_LABELS[moduleKey];
  if (configured) return configured.icon;

  const normalized = moduleKey.toLowerCase();
  if (normalized.includes("auth")) return "verified";
  if (normalized.includes("user") || normalized.includes("staff")) return "group";
  if (normalized.includes("room")) return "bed";
  if (normalized.includes("hotel")) return "hotel";
  if (normalized.includes("booking")) return "schedule";
  if (normalized.includes("dashboard") || normalized.includes("analytic")) return "dashboard";
  if (normalized.includes("role") || normalized.includes("permission")) return "verified_user";
  return "menu";
}

function toPermissionMethodBadgeClass(method: RbacPermissionMethod): string {
  return METHOD_BADGE_CLASS_MAP[method] ?? METHOD_BADGE_CLASS_MAP.OPTIONS;
}

function businessActionLabel(description: string): string {
  return description
    .replace(/^View /i, "Xem ")
    .replace(/^Manage /i, "Quản lý ")
    .trim();
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
  for (const id of permissionIds) {
    if (typeof id !== "string") continue;
    const normalized = id.trim();
    if (normalized.length === 0) continue;
    unique.add(normalized);
  }
  return [...unique].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function arePermissionIdsEqual(
  first: readonly string[],
  second: readonly string[],
): boolean {
  if (first.length !== second.length) return false;
  const secondSet = new Set(second);
  for (const id of first) {
    if (!secondSet.has(id)) return false;
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
  for (const id of firstSet) {
    if (!secondSet.has(id)) delta += 1;
  }
  for (const id of secondSet) {
    if (!firstSet.has(id)) delta += 1;
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
    if (!isRecord(item)) continue;
    if (
      typeof item.id !== "string" ||
      typeof item.method !== "string" ||
      typeof item.path !== "string" ||
      typeof item.description !== "string"
    )
      continue;
    const method = item.method.trim().toUpperCase() as RbacPermissionMethod;
    if (!Object.hasOwn(METHOD_BADGE_CLASS_MAP, method)) continue;
    mapped.push({
      id: item.id,
      method,
      path: item.path,
      description: item.description,
    });
  }
  return mapped;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/* ────────────── BFF fetch helpers ────────────── */

async function fetchRolePermissions(
  roleId: string,
): Promise<RolePermissionsBrowserPermission[]> {
  try {
    const permissions = await requestInternalApi<
      RolePermissionsBrowserPermission[]
    >(`/api/rbac/roles/${encodeURIComponent(roleId)}/permissions`, {
      method: "GET",
    });
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
    const payload = await requestInternalApiEnvelope<
      RolePermissionsBrowserPermission[]
    >(`/api/rbac/roles/${encodeURIComponent(roleId)}/permissions`, {
      method: "PUT",
      body: { permissionIds },
    });
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

/* ────────────── URL sync helper ────────────── */

function replaceUrlParams(
  roleId: string | null,
  moduleKey: string | null,
): void {
  const params = new URLSearchParams();
  if (roleId) params.set("roleId", roleId);
  if (moduleKey) params.set("module", moduleKey);
  const url = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", url);
}

/* ────────────── state types ────────────── */

/** Cache key = `${roleId}` — permissions for the entire role */
type PermissionsByRoleId = Record<string, RolePermissionsBrowserPermission[]>;

/** Draft per role — full set of toggled permission IDs */
type DraftPermissionIdsByRoleId = Record<string, string[]>;
type LoadingByRoleId = Record<string, boolean>;
type SavingByRoleId = Record<string, boolean>;
type ErrorByRoleId = Record<string, string | null>;

/* ────────────────────── internal helpers ────────────────────── */

function normalizeInitialRoleId(
  roles: readonly RolePermissionsBrowserRole[],
  initialRoleId: string | null,
): string | null {
  if (initialRoleId && roles.some((r) => r.id === initialRoleId))
    return initialRoleId;
  return roles[0]?.id ?? null;
}

function toInitialDraftMap(
  initialPermissionsByRoleId: Record<
    string,
    RolePermissionsBrowserPermission[]
  >,
): DraftPermissionIdsByRoleId {
  const draft: DraftPermissionIdsByRoleId = {};
  for (const [roleId, permissions] of Object.entries(
    initialPermissionsByRoleId,
  )) {
    draft[roleId] = normalizePermissionIds(permissions.map((p) => p.id));
  }
  return draft;
}

/* ────────────── group permissions by module ────────────── */

type PermissionModule = {
  moduleKey: string;
  label: string;
  icon: string;
  permissions: RolePermissionsBrowserPermission[];
};

function moduleKeyFromPermission(
  permission: RolePermissionsBrowserPermission,
): string {
  const key = permission.moduleKey?.trim();
  if (key && key.length > 0) return key;
  // Fallback: derive from path
  const segments = permission.path.split("/").filter(Boolean);
  if (segments.length >= 3 && segments[0] === "api" && segments[1] === "v1")
    return segments[2] ?? "misc";
  if (segments.length >= 2 && segments[0] === "permissions")
    return segments[1] ?? "misc";
  if (segments.length >= 1) return segments[0] ?? "misc";
  return "misc";
}

function buildPermissionModules(
  permissions: readonly RolePermissionsBrowserPermission[],
): PermissionModule[] {
  const map = new Map<string, RolePermissionsBrowserPermission[]>();
  for (const perm of permissions) {
    const key = moduleKeyFromPermission(perm);
    const list = map.get(key) ?? [];
    list.push(perm);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([key, items]) => ({
      moduleKey: key,
      label:
        BUSINESS_MODULE_LABELS[key]?.label ??
        items[0]?.moduleLabel ??
        toTitleCase(key),
      icon:
        BUSINESS_MODULE_LABELS[key]?.icon ??
        items[0]?.moduleIcon ??
        moduleIcon(key),
      permissions: [...items].sort((a, b) => {
        const pathCmp = a.path.localeCompare(b.path, "en", {
          sensitivity: "base",
        });
        if (pathCmp !== 0) return pathCmp;
        return a.method.localeCompare(b.method, "en", { sensitivity: "base" });
      }),
    }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, "en", { sensitivity: "base" }),
    );
}

/* ════════════════════════════════════════════════════════════════
   ██  MAIN COMPONENT
   ════════════════════════════════════════════════════════════════ */

export function RolePermissionsBrowser(props: RolePermissionsBrowserProps) {
  const {
    roles,
    permissionModuleSummaries,
    initialRoleId,
    initialModuleKey,
    initialPermissionsByRoleId = {},
    allPermissions = [],
  } = props;

  /* ── role selection ── */
  const resolvedInitialRoleId = normalizeInitialRoleId(roles, initialRoleId);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    resolvedInitialRoleId,
  );

  /* ── module selection (client-side, no Next.js Link) ── */
  const [selectedModuleKey, setSelectedModuleKey] = useState<string | null>(
    () => {
      if (
        initialModuleKey &&
        permissionModuleSummaries.some((m) => m.moduleKey === initialModuleKey)
      ) {
        return initialModuleKey;
      }
      return permissionModuleSummaries[0]?.moduleKey ?? null;
    },
  );

  /* ── mobile role panel toggle ── */
  const [mobileRolePanelOpen, setMobileRolePanelOpen] = useState(false);

  /* ── permission state ── */
  const [permissionsByRoleId, setPermissionsByRoleId] =
    useState<PermissionsByRoleId>(initialPermissionsByRoleId);
  const [draftPermissionIdsByRoleId, setDraftPermissionIdsByRoleId] =
    useState<DraftPermissionIdsByRoleId>(() =>
      toInitialDraftMap(initialPermissionsByRoleId),
    );
  const [loadingByRoleId, setLoadingByRoleId] = useState<LoadingByRoleId>({});
  const [savingByRoleId, setSavingByRoleId] = useState<SavingByRoleId>({});
  const [errorByRoleId, setErrorByRoleId] = useState<ErrorByRoleId>({});

  /* ── derived ── */
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;
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
    () => normalizePermissionIds(selectedRolePermissions.map((p) => p.id)),
    [selectedRolePermissions],
  );

  const selectedRoleAssignedPermissionIdSet = useMemo(
    () => new Set(selectedRoleAssignedPermissionIds),
    [selectedRoleAssignedPermissionIds],
  );

  const selectedRoleDraftPermissionIds = useMemo(() => {
    if (!selectedRoleId) return [];
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

  const selectedRoleTotalPermissions = selectedRoleHasCache
    ? selectedRoleDraftPermissionIdSet.size
    : (selectedRole?.enabledCount ?? 0);

  /* ── group permissions by module for the currently-loaded role ── */
  const permissionModules = useMemo(
    () => buildPermissionModules(allPermissions.length > 0 ? allPermissions : selectedRolePermissions),
    [allPermissions, selectedRolePermissions],
  );

  /** The module's permissions for the currently selected moduleKey */
  const activeModulePermissions = useMemo(() => {
    if (!selectedModuleKey) return [];
    const mod = permissionModules.find(
      (m) => m.moduleKey === selectedModuleKey,
    );
    return mod?.permissions ?? [];
  }, [permissionModules, selectedModuleKey]);

  /* ── load role permissions ── */
  const loadingRef = useRef<Set<string>>(new Set());

  const loadRolePermissions = useCallback(
    async (roleId: string) => {
      if (permissionsByRoleId[roleId] || loadingRef.current.has(roleId)) return;
      loadingRef.current.add(roleId);
      setLoadingByRoleId((prev) => ({ ...prev, [roleId]: true }));
      setErrorByRoleId((prev) => ({ ...prev, [roleId]: null }));
      try {
        const permissions = await fetchRolePermissions(roleId);
        const assignedIds = normalizePermissionIds(
          permissions.map((p) => p.id),
        );
        setPermissionsByRoleId((prev) => ({ ...prev, [roleId]: permissions }));
        setDraftPermissionIdsByRoleId((prev) => ({
          ...prev,
          [roleId]: assignedIds,
        }));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Không tải được quyền của vai trò";
        setErrorByRoleId((prev) => ({ ...prev, [roleId]: message }));
      } finally {
        loadingRef.current.delete(roleId);
        setLoadingByRoleId((prev) => ({ ...prev, [roleId]: false }));
      }
    },
    [permissionsByRoleId],
  );

  /* ── auto-load on initial mount ── */
  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    if (selectedRoleId && !permissionsByRoleId[selectedRoleId]) {
      queueMicrotask(() => {
        void loadRolePermissions(selectedRoleId);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── draft mutation helpers ── */
  const mutateSelectedRoleDraft = useCallback(
    (mutator: (draft: Set<string>) => void) => {
      if (!selectedRoleId) return;
      setDraftPermissionIdsByRoleId((prev) => {
        const fallbackIds =
          permissionsByRoleId[selectedRoleId]?.map((p) => p.id) ?? [];
        const currentSet = new Set(prev[selectedRoleId] ?? fallbackIds);
        mutator(currentSet);
        return {
          ...prev,
          [selectedRoleId]: normalizePermissionIds([...currentSet]),
        };
      });
    },
    [permissionsByRoleId, selectedRoleId],
  );

  const handlePermissionToggle = useCallback(
    (permissionId: string, nextChecked: boolean) => {
      mutateSelectedRoleDraft((draft) => {
        if (nextChecked) {
          draft.add(permissionId);
        } else {
          draft.delete(permissionId);
        }
      });
    },
    [mutateSelectedRoleDraft],
  );

  const handleResetPermission = useCallback(
    (permissionId: string) => {
      const shouldBeAssigned =
        selectedRoleAssignedPermissionIdSet.has(permissionId);
      mutateSelectedRoleDraft((draft) => {
        if (shouldBeAssigned) {
          draft.add(permissionId);
        } else {
          draft.delete(permissionId);
        }
      });
    },
    [mutateSelectedRoleDraft, selectedRoleAssignedPermissionIdSet],
  );

  const handleModuleSelectAll = useCallback(
    (permissions: readonly RolePermissionsBrowserPermission[]) => {
      mutateSelectedRoleDraft((draft) => {
        for (const p of permissions) draft.add(p.id);
      });
    },
    [mutateSelectedRoleDraft],
  );

  const handleModuleDisableAll = useCallback(
    (permissions: readonly RolePermissionsBrowserPermission[]) => {
      mutateSelectedRoleDraft((draft) => {
        for (const p of permissions) draft.delete(p.id);
      });
    },
    [mutateSelectedRoleDraft],
  );

  /* ── role selection handler ── */
  const handleSelectRole = useCallback(
    (roleId: string) => {
      setSelectedRoleId(roleId);
      setMobileRolePanelOpen(false);
      replaceUrlParams(roleId, selectedModuleKey);
      void loadRolePermissions(roleId);
    },
    [loadRolePermissions, selectedModuleKey],
  );

  /* ── module selection handler (client-side only) ── */
  const handleSelectModule = useCallback(
    (moduleKey: string) => {
      setSelectedModuleKey(moduleKey);
      replaceUrlParams(selectedRoleId, moduleKey);
    },
    [selectedRoleId],
  );

  /* ── reset ── */
  const selectedRoleName =
    selectedRole?.name ?? selectedRoleId ?? "vai trò đã chọn";

  async function handleResetChanges() {
    if (!selectedRoleId || !selectedRoleHasCache || selectedRoleSaving) return;

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
      confirmButtonText: "Đồng ý",
      cancelButtonText: "Huỷ",
    });

    if (!resetConfirmation.isConfirmed) return;

    showLoadingBox("Đang xử lí..", "Xin chờ.");
    setDraftPermissionIdsByRoleId((prev) => ({
      ...prev,
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

  /* ── save ── */
  async function handleSaveChanges() {
    if (!selectedRoleId || !selectedRoleHasCache || selectedRoleSaving) return;

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

    if (!saveConfirmation.isConfirmed) return;

    const nextPermissionIds = normalizePermissionIds(
      selectedRoleDraftPermissionIds,
    );

    showLoadingBox("Đang lưu...", "Vui lòng chờ.");
    setSavingByRoleId((prev) => ({ ...prev, [selectedRoleId]: true }));
    setErrorByRoleId((prev) => ({ ...prev, [selectedRoleId]: null }));

    try {
      const updatedPermissions = await replaceRolePermissions(
        selectedRoleId,
        nextPermissionIds,
      );
      const confirmedIds = normalizePermissionIds(
        updatedPermissions.map((p) => p.id),
      );

      setPermissionsByRoleId((prev) => ({
        ...prev,
        [selectedRoleId]: updatedPermissions,
      }));
      setDraftPermissionIdsByRoleId((prev) => ({
        ...prev,
        [selectedRoleId]: confirmedIds,
      }));

      closeLoadingBox();

      await Swal.fire({
        icon: "success",
        title: "Đã lưu thay đổi",
        text: `${selectedRoleName} có ${confirmedIds.length} Quyền đang hoạt động.`,
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
      setErrorByRoleId((prev) => ({ ...prev, [selectedRoleId]: message }));

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
      setSavingByRoleId((prev) => ({ ...prev, [selectedRoleId]: false }));
    }
  }

  /* ── module stats for the active module ── */
  const activeModuleAssignedCount = activeModulePermissions.reduce(
    (count, p) => count + (selectedRoleDraftPermissionIdSet.has(p.id) ? 1 : 0),
    0,
  );
  const activeModuleAllSelected =
    activeModulePermissions.length > 0 &&
    activeModuleAssignedCount === activeModulePermissions.length;
  const activeModuleAllDisabled = activeModuleAssignedCount === 0;

  /* ════════════════════════════════════════════════════════════════
     ██  RENDER
     ════════════════════════════════════════════════════════════════ */

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      {/* ─── LEFT SIDEBAR: Role List (desktop) ─── */}
      <aside className="hidden w-[280px] shrink-0 lg:block">
        <div className="sticky top-6 space-y-3">
          <h2 className="vs-display text-lg font-semibold text-[var(--primary)]">
            Vai trò
          </h2>
          <ul className="space-y-2">
            {roles.map((role) => {
              const isActive = role.id === selectedRoleId;
              return (
                <li key={role.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectRole(role.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? "border-[var(--primary)] bg-[var(--primary-fixed)]"
                        : "border-[color:rgba(198,197,213,0.45)] bg-[var(--surface-container-lowest)] hover:bg-[var(--surface-container-low)]"
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--on-surface-variant)]">
                      {role.code}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--primary)]">
                      {role.name}
                    </p>
                    <p className="mt-1.5 text-[11px] text-[var(--outline)]">
                      {role.userCount} người dùng
                      {role.enabledCount != null
                        ? ` · ${role.enabledCount} quyền`
                        : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* ─── MOBILE: Role Selector Toggle ─── */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileRolePanelOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-3 text-sm font-semibold text-[var(--primary)]"
        >
          <span>
            <VsIcon name="verified_user" className="mr-2 inline text-[16px]" />
            {selectedRole?.name ?? "Chọn vai trò"}
          </span>
          <VsIcon
            name={mobileRolePanelOpen ? "expand_less" : "expand_more"}
            className="text-[20px]"
          />
        </button>

        {mobileRolePanelOpen ? (
          <ul className="mt-2 space-y-1.5 rounded-xl border border-[var(--outline-variant)] bg-white p-3">
            {roles.map((role) => {
              const isActive = role.id === selectedRoleId;
              return (
                <li key={role.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectRole(role.id)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      isActive
                        ? "bg-[var(--primary-fixed)] font-semibold text-[var(--primary)]"
                        : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
                    }`}
                  >
                    <span className="mr-2 text-[10px] font-bold uppercase tracking-[0.05em] opacity-70">
                      {role.code}
                    </span>
                    {role.name}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* ─── RIGHT CONTENT AREA ─── */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* ── Role Header Card ── */}
        <article className="vs-card rounded-2xl border-l-4 border-l-[var(--primary)] p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-3">
                <h1 className="vs-display text-2xl font-semibold leading-tight text-[var(--primary)] md:text-[28px]">
                  Cấu hình truy cập: {selectedRole?.name ?? "Chưa chọn vai trò"}
                </h1>
                {selectedRole ? (
                  <span className="rounded-full bg-[var(--primary-fixed)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--on-primary-fixed)]">
                    {selectedRole.code}
                  </span>
                ) : null}
              </div>
              <p className="max-w-3xl text-sm text-[var(--on-surface-variant)]">
                {selectedRole?.description ??
                  "Chọn vai trò để bật/tắt các quyền nghiệp vụ theo nhóm chức năng."}
              </p>
              <p className="mt-2 text-xs text-[var(--outline)]">
                Ngày tạo:{" "}
                {selectedRole ? formatDate(selectedRole.createdAt) : "Không có"}
              </p>
            </div>

            <div className="min-w-[120px] rounded-xl border border-[color:rgba(198,197,213,0.3)] bg-[var(--surface-container-low)] px-4 py-3 text-center">
              <p className="vs-display text-3xl font-bold leading-none text-[var(--primary)]">
                {selectedRoleTotalPermissions}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--outline)]">
                Quyền nghiệp vụ
              </p>
            </div>
          </div>
        </article>

        {/* ── Error state ── */}
        {selectedRoleError ? (
          <section className="rounded-xl border border-[color:rgba(186,26,26,0.2)] bg-[var(--error-container)]/60 px-4 py-3 text-sm text-[var(--on-error-container)]">
            <p>{selectedRoleError}</p>
            {selectedRoleId ? (
              <button
                type="button"
                onClick={() => {
                  setPermissionsByRoleId((prev) => {
                    const next = { ...prev };
                    delete next[selectedRoleId];
                    return next;
                  });
                  setDraftPermissionIdsByRoleId((prev) => {
                    const next = { ...prev };
                    delete next[selectedRoleId];
                    return next;
                  });
                  setErrorByRoleId((prev) => ({
                    ...prev,
                    [selectedRoleId]: null,
                  }));
                  void loadRolePermissions(selectedRoleId);
                }}
                className="mt-2 inline-flex items-center rounded-md border border-[var(--outline)] px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em]"
              >
                Thử lại
              </button>
            ) : null}
          </section>
        ) : null}

        {/* ── Loading state ── */}
        {selectedRoleLoading ? (
          <section className="rounded-xl bg-[var(--surface-container-low)] px-4 py-4 text-sm text-[var(--on-surface-variant)]">
            <div className="flex items-center gap-3">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
              Đang tải quyền ...
            </div>
          </section>
        ) : null}

        {/* ── Empty / no cache state ── */}
        {!selectedRoleLoading && !selectedRoleError && !selectedRoleHasCache ? (
          <section className="vs-card rounded-2xl p-6 text-sm text-[var(--on-surface-variant)]">
            Hãy chọn vai trò để xem quyền
          </section>
        ) : null}

        {/* ── Module Tabs + Permission Content ── */}
        {!selectedRoleLoading && !selectedRoleError && selectedRoleHasCache ? (
          <>
            {/* Module tabs — vertical on mobile, horizontal tabs on desktop */}
            <nav
              className="flex flex-col gap-1.5 rounded-xl border border-[var(--outline-variant)] bg-white p-3 md:flex-row md:flex-wrap md:gap-2"
              aria-label="Nhóm quyền"
            >
              {permissionModuleSummaries.map((mod) => {
                const isActive = mod.moduleKey === selectedModuleKey;
                const icon = moduleIcon(mod.moduleKey);

                // Use the draft count from the current role if available
                const modulePerms = permissionModules.find(
                  (m) => m.moduleKey === mod.moduleKey,
                );
                const draftEnabledCount = modulePerms
                  ? modulePerms.permissions.reduce(
                      (c, p) =>
                        c +
                        (selectedRoleDraftPermissionIdSet.has(p.id) ? 1 : 0),
                      0,
                    )
                  : mod.enabledCount;

                return (
                  <button
                    key={mod.moduleKey}
                    type="button"
                    onClick={() => handleSelectModule(mod.moduleKey)}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-[var(--primary)] text-white"
                        : "bg-[var(--surface-container-low)] text-[var(--primary)] hover:bg-[var(--surface-container)]"
                    }`}
                  >
                    <VsIcon name={icon} className="text-[16px] shrink-0" />
                    <span className="min-w-0 truncate">
                      {moduleLabel(mod.moduleKey, mod.moduleName)}
                    </span>
                    <span
                      className={`ml-auto shrink-0 tabular-nums ${isActive ? "opacity-80" : "opacity-60"}`}
                    >
                      {draftEnabledCount}/{mod.totalPermissions}
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* ── Active Module Permissions ── */}
            {activeModulePermissions.length === 0 ? (
              <section className="vs-card rounded-2xl p-6 text-sm text-[var(--on-surface-variant)]">
                {selectedModuleKey
                  ? "Không có quyền nào trong module này cho vai trò đã chọn."
                  : "Chọn một module để xem quyền."}
              </section>
            ) : (
              <section className="space-y-3">
                {/* Module header with select all / disable all */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-container-low)] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <VsIcon
                      name={moduleIcon(selectedModuleKey ?? "")}
                      className="text-[18px] text-[var(--secondary)]"
                    />
                    <h2 className="text-sm font-semibold text-[var(--primary)]">
                      {moduleLabel(
                        selectedModuleKey ?? "",
                        permissionModuleSummaries.find(
                          (m) => m.moduleKey === selectedModuleKey,
                        )?.moduleName,
                      )}
                    </h2>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--outline)]">
                      {activeModuleAssignedCount}/
                      {activeModulePermissions.length} quyền đang bật
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleModuleSelectAll(activeModulePermissions)
                      }
                      disabled={
                        selectedRoleSaving ||
                        activeModulePermissions.length === 0
                      }
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                        activeModuleAllSelected
                          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
                          : "border-[var(--outline-variant)] text-[var(--outline)] hover:bg-[var(--surface-container-high)]"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                      aria-label="Chọn tất cả quyền trong module"
                    >
                      <VsIcon name="done_all" className="text-[12px]" />
                      Chọn tất cả
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleModuleDisableAll(activeModulePermissions)
                      }
                      disabled={
                        selectedRoleSaving ||
                        activeModulePermissions.length === 0
                      }
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                        activeModuleAllDisabled
                          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
                          : "border-[var(--outline-variant)] text-[var(--outline)] hover:bg-[var(--surface-container-high)]"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                      aria-label="Bỏ chọn tất cả quyền trong module"
                    >
                      <VsIcon name="block" className="text-[12px]" />
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                {/* ── Permission list — single column ── */}
                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {activeModulePermissions.map((permission) => {
                    const badgeClass = toPermissionMethodBadgeClass(
                      permission.method,
                    );
                    const isAssigned = selectedRoleDraftPermissionIdSet.has(
                      permission.id,
                    );
                    const isAssignedFromApi =
                      selectedRoleAssignedPermissionIdSet.has(permission.id);
                    const isDirty = isAssigned !== isAssignedFromApi;

                    return (
                      <div
                        key={permission.id}
                        className={`group flex items-center justify-between rounded-xl border p-3 transition-colors ${
                          isAssigned
                            ? "border-[var(--primary)]/20 bg-[var(--primary-fixed)]/35"
                            : "border-transparent bg-[var(--surface-container-low)]"
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                              BUSINESS_MODULE_LABELS[selectedModuleKey ?? ""]
                                ?.tone ??
                              "bg-[var(--surface-container)] text-[var(--primary)]"
                            }`}
                          >
                            <VsIcon
                              name={moduleIcon(selectedModuleKey ?? "")}
                              className="text-[16px]"
                            />
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--on-surface)]">
                              {businessActionLabel(permission.description)}
                            </p>
                            {/* Method/path in collapsible details */}
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[11px] text-[var(--outline)] hover:text-[var(--on-surface-variant)]">
                                Chi tiết endpoint
                              </summary>
                              <p className="mt-1 break-all font-mono text-[11px] text-[var(--outline)]">
                                <span
                                  className={`mr-2 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] ${badgeClass}`}
                                >
                                  {permission.method}
                                </span>
                                {permission.path}
                              </p>
                            </details>
                          </div>
                        </div>

                        <div className="ml-3 flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleResetPermission(permission.id)}
                            disabled={selectedRoleSaving || !isDirty}
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[var(--outline-variant)] text-[var(--outline)] transition-colors hover:bg-[var(--surface-container-low)] disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Đặt lại quyền ${permission.description} theo giá trị ban đầu`}
                            title={isDirty ? "Đặt lại quyền này" : "Đã đồng bộ"}
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
                              onChange={(e) =>
                                handlePermissionToggle(
                                  permission.id,
                                  e.currentTarget.checked,
                                )
                              }
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
              </section>
            )}
          </>
        ) : null}

        {/* ── Sticky Save Footer ── */}
        <footer className="sticky bottom-0 z-40 -mx-4 rounded-t-xl border-t border-[color:rgba(198,197,213,0.25)] bg-[color:rgba(255,255,255,0.92)] px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--primary)]">
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
                className="cursor-pointer rounded-lg border border-[var(--primary)] px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Đặt lại
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveChanges();
                }}
                disabled={!selectedRoleHasUnsavedChanges || selectedRoleSaving}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--primary)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--on-primary)] disabled:cursor-not-allowed disabled:opacity-60"
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
      </div>
    </div>
  );
}
