"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HttpError } from "@/core/http/http-error";
import { requestInternalApi } from "@/core/http/internal-api-client";
import type { RbacRole } from "@/features/rbac/types/rbac-contract";
import { showConfirmDialog, showErrorAlert, showSuccessAlert } from "@/libs/swal";
import { VsIcon } from "../../../_components/vs-icon";
import type {
  RolePermissionsBrowserPermission,
  RolePermissionsBrowserRole,
} from "../permission-types";
import { RbacRoleListPanel } from "./rbac-role-list-panel";
import { type DetailTab, RbacRoleDetailHeader } from "./rbac-role-detail-header";
import { RbacPermissionGroups } from "./rbac-capability-groups";

export type {
  RolePermissionsBrowserPermission,
  RolePermissionsBrowserRole,
};

type RolePermissionsBrowserProps = {
  roles: RolePermissionsBrowserRole[];
  initialRoleId: string | null;
  initialPermissionsByRoleId?: Record<
    string,
    RolePermissionsBrowserPermission[]
  >;
};

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

function parseRolePermissions(
  payload: unknown,
): RolePermissionsBrowserPermission[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("Phản hồi danh sách quyền không đúng định dạng");
  }
  const mapped: RolePermissionsBrowserPermission[] = [];
  for (const item of payload.data) {
    if (!isRecord(item)) continue;
    if (
      typeof item.id !== "string" ||
      typeof item.method !== "string" ||
      typeof item.path !== "string"
    ) {
      continue;
    }
    const description =
      typeof item.description === "string" && item.description.trim().length > 0
        ? item.description.trim()
        : `${item.method} ${item.path}`;
    mapped.push({
      id: item.id,
      method: item.method,
      path: item.path,
      description,
    });
  }
  return mapped;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không có";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/* ────────────── BFF fetch helper (GET only) ────────────── */

async function fetchRolePermissions(
  roleId: string,
): Promise<RolePermissionsBrowserPermission[]> {
  try {
    const permissions = await requestInternalApi<
      RolePermissionsBrowserPermission[]
    >(`/api/rbac/roles/${encodeURIComponent(roleId)}/capabilities`, {
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

async function createCustomRoleApi(body: {
  code: string;
  name: string;
  description?: string | null;
  baseRoleId: string;
  permissionIds: string[];
}): Promise<RbacRole> {
  return requestInternalApi<RbacRole>("/api/rbac/roles", {
    method: "POST",
    body,
  });
}

async function updateCustomRoleApi(
  roleId: string,
  body: {
    name?: string;
    description?: string | null;
    baseRoleId?: string;
    permissionIds?: string[];
  },
): Promise<RbacRole> {
  return requestInternalApi<RbacRole>(`/api/rbac/roles/${encodeURIComponent(roleId)}`, {
    method: "PATCH",
    body,
  });
}

async function deleteCustomRoleApi(roleId: string): Promise<{ deleted: boolean }> {
  return requestInternalApi<{ deleted: boolean }>(`/api/rbac/roles/${encodeURIComponent(roleId)}`, {
    method: "DELETE",
  });
}

/* ────────────── URL sync helper ────────────── */

function replaceUrlParams(roleId: string | null): void {
  const params = new URLSearchParams();
  if (roleId) params.set("roleId", roleId);
  const url = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", url);
}

type PermissionsByRoleId = Record<string, RolePermissionsBrowserPermission[]>;
type LoadingByRoleId = Record<string, boolean>;
type ErrorByRoleId = Record<string, string | null>;

type RoleTab = "DEFAULT" | "CUSTOM";

type ModalFormState = {
  isOpen: boolean;
  mode: "create" | "edit";
  roleId?: string;
  code: string;
  name: string;
  description: string;
  baseRoleId: string;
  selectedPermissionIds: Set<string>;
  loadingBasePermissions: boolean;
  baseRolePermissions: RolePermissionsBrowserPermission[];
  submitting: boolean;
  error: string | null;
  permissionFilterQuery: string;
};

export function RolePermissionsBrowser({
  roles,
  initialRoleId,
  initialPermissionsByRoleId = {},
}: RolePermissionsBrowserProps) {
  const [currentRoles, setCurrentRoles] = useState<RolePermissionsBrowserRole[]>(roles);
  const [prevRoles, setPrevRoles] = useState(roles);

  if (prevRoles !== roles) {
    setPrevRoles(roles);
    setCurrentRoles(roles);
  }

  const defaultRoles = useMemo(
    () => currentRoles.filter((r) => r.type === "SYSTEM_TEMPLATE"),
    [currentRoles],
  );

  const customRoles = useMemo(
    () => currentRoles.filter((r) => r.type === "CUSTOM"),
    [currentRoles],
  );

  const initialRole = roles.find((r) => r.id === initialRoleId);
  const initialTab: RoleTab = initialRole?.type === "CUSTOM" ? "CUSTOM" : "DEFAULT";
  const [activeRoleTab, setActiveRoleTab] = useState<RoleTab>(initialTab);

  const activeTabRoles = activeRoleTab === "DEFAULT" ? defaultRoles : customRoles;

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(() => {
    if (initialRoleId && roles.some((r) => r.id === initialRoleId)) {
      return initialRoleId;
    }
    return (initialTab === "DEFAULT" ? defaultRoles[0]?.id : customRoles[0]?.id) ?? defaultRoles[0]?.id ?? null;
  });

  const [detailTab, setDetailTab] = useState<DetailTab>("PERMISSIONS");

  const [permissionsByRoleId, setPermissionsByRoleId] =
    useState<PermissionsByRoleId>(initialPermissionsByRoleId);
  const [loadingByRoleId, setLoadingByRoleId] = useState<LoadingByRoleId>({});
  const [errorByRoleId, setErrorByRoleId] = useState<ErrorByRoleId>({});

  const selectedRole = currentRoles.find((r) => r.id === selectedRoleId) ?? null;

  const selectedRolePermissions = useMemo(
    () => (selectedRoleId ? (permissionsByRoleId[selectedRoleId] ?? []) : []),
    [permissionsByRoleId, selectedRoleId],
  );

  const selectedRoleLoading = selectedRoleId
    ? loadingByRoleId[selectedRoleId] === true
    : false;
  const selectedRoleError = selectedRoleId
    ? (errorByRoleId[selectedRoleId] ?? null)
    : null;

  const selectedRoleTotalPermissions =
    selectedRoleId && permissionsByRoleId[selectedRoleId]
      ? selectedRolePermissions.length
      : (selectedRole?.enabledCount ?? 0);

  const loadingRef = useRef<Set<string>>(new Set());

  const loadRolePermissions = useCallback(
    async (roleId: string): Promise<RolePermissionsBrowserPermission[]> => {
      if (permissionsByRoleId[roleId]) {
        return permissionsByRoleId[roleId];
      }
      if (loadingRef.current.has(roleId)) {
        return [];
      }
      loadingRef.current.add(roleId);
      setLoadingByRoleId((prev) => ({ ...prev, [roleId]: true }));
      setErrorByRoleId((prev) => ({ ...prev, [roleId]: null }));
      try {
        const permissions = await fetchRolePermissions(roleId);
        setPermissionsByRoleId((prev) => ({ ...prev, [roleId]: permissions }));
        return permissions;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Không tải được quyền của vai trò";
        setErrorByRoleId((prev) => ({ ...prev, [roleId]: message }));
        return [];
      } finally {
        loadingRef.current.delete(roleId);
        setLoadingByRoleId((prev) => ({ ...prev, [roleId]: false }));
      }
    },
    [permissionsByRoleId],
  );

  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    if (selectedRoleId && !permissionsByRoleId[selectedRoleId]) {
      queueMicrotask(() => {
        void loadRolePermissions(selectedRoleId);
      });
    }
  }, [loadRolePermissions, permissionsByRoleId, selectedRoleId]);

  const handleSelectRole = useCallback(
    (roleId: string) => {
      setSelectedRoleId(roleId);
      replaceUrlParams(roleId);
      void loadRolePermissions(roleId);
    },
    [loadRolePermissions],
  );

  const handleRoleTabChange = (nextTab: RoleTab) => {
    setActiveRoleTab(nextTab);
    const targetRoles = nextTab === "DEFAULT" ? defaultRoles : customRoles;
    const isCurrentInTarget = targetRoles.some((r) => r.id === selectedRoleId);
    if (!isCurrentInTarget) {
      const nextSelectedId = targetRoles[0]?.id ?? null;
      setSelectedRoleId(nextSelectedId);
      replaceUrlParams(nextSelectedId);
      if (nextSelectedId) {
        void loadRolePermissions(nextSelectedId);
      }
    }
  };

  /* ────────────── Create / Edit Modal State ────────────── */

  const [modalState, setModalState] = useState<ModalFormState>({
    isOpen: false,
    mode: "create",
    code: "",
    name: "",
    description: "",
    baseRoleId: "",
    selectedPermissionIds: new Set<string>(),
    loadingBasePermissions: false,
    baseRolePermissions: [],
    submitting: false,
    error: null,
    permissionFilterQuery: "",
  });

  const handleOpenCreateModal = useCallback(async () => {
    const initialBaseRoleId = defaultRoles[0]?.id ?? "";
    setModalState({
      isOpen: true,
      mode: "create",
      code: "",
      name: "",
      description: "",
      baseRoleId: initialBaseRoleId,
      selectedPermissionIds: new Set<string>(),
      loadingBasePermissions: initialBaseRoleId.length > 0,
      baseRolePermissions: [],
      submitting: false,
      error: null,
      permissionFilterQuery: "",
    });

    if (initialBaseRoleId) {
      const perms = await loadRolePermissions(initialBaseRoleId);
      setModalState((prev) => ({
        ...prev,
        baseRolePermissions: perms,
        loadingBasePermissions: false,
      }));
    }
  }, [defaultRoles, loadRolePermissions]);

  const handleOpenEditModal = useCallback(
    async (role: RolePermissionsBrowserRole) => {
      const targetBaseRoleId = role.baseRoleId ?? defaultRoles[0]?.id ?? "";
      setModalState({
        isOpen: true,
        mode: "edit",
        roleId: role.id,
        code: role.code,
        name: role.name,
        description: role.description ?? "",
        baseRoleId: targetBaseRoleId,
        selectedPermissionIds: new Set<string>(),
        loadingBasePermissions: true,
        baseRolePermissions: [],
        submitting: false,
        error: null,
        permissionFilterQuery: "",
      });

      const [customPerms, basePerms] = await Promise.all([
        loadRolePermissions(role.id),
        targetBaseRoleId ? loadRolePermissions(targetBaseRoleId) : Promise.resolve([]),
      ]);

      const initialSelected = new Set(customPerms.map((p) => p.id));
      setModalState((prev) => ({
        ...prev,
        selectedPermissionIds: initialSelected,
        baseRolePermissions: basePerms,
        loadingBasePermissions: false,
      }));
    },
    [defaultRoles, loadRolePermissions],
  );

  const handleModalBaseChange = useCallback(
    async (newBaseRoleId: string) => {
      setModalState((prev) => ({
        ...prev,
        baseRoleId: newBaseRoleId,
        loadingBasePermissions: true,
        error: null,
      }));

      const newBasePerms = await loadRolePermissions(newBaseRoleId);
      const newBasePermSet = new Set(newBasePerms.map((p) => p.id));

      setModalState((prev) => {
        // "changing base drops selections not present in the new base."
        const nextSelected = new Set<string>();
        for (const id of prev.selectedPermissionIds) {
          if (newBasePermSet.has(id)) {
            nextSelected.add(id);
          }
        }
        return {
          ...prev,
          baseRoleId: newBaseRoleId,
          baseRolePermissions: newBasePerms,
          selectedPermissionIds: nextSelected,
          loadingBasePermissions: false,
        };
      });
    },
    [loadRolePermissions],
  );

  const handleTogglePermission = useCallback((permissionId: string) => {
    setModalState((prev) => {
      const next = new Set(prev.selectedPermissionIds);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return { ...prev, selectedPermissionIds: next };
    });
  }, []);

  const handleSelectAllPermissions = useCallback(
    (select: boolean, items: RolePermissionsBrowserPermission[]) => {
      setModalState((prev) => {
        const next = new Set(prev.selectedPermissionIds);
        if (select) {
          for (const item of items) {
            next.add(item.id);
          }
        } else {
          for (const item of items) {
            next.delete(item.id);
          }
        }
        return { ...prev, selectedPermissionIds: next };
      });
    },
    [],
  );

  const handleCloseModal = useCallback(() => {
    if (modalState.submitting) return;
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, [modalState.submitting]);

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalState((prev) => ({ ...prev, error: null }));

    const trimmedCode = modalState.code.trim().toUpperCase();
    const trimmedName = modalState.name.trim();
    const trimmedDesc = modalState.description.trim();

    if (modalState.mode === "create") {
      if (!trimmedCode) {
        setModalState((prev) => ({ ...prev, error: "Mã vai trò không được để trống" }));
        return;
      }
      if (!/^[A-Z0-9_]{2,80}$/.test(trimmedCode)) {
        setModalState((prev) => ({
          ...prev,
          error: "Mã vai trò chỉ bao gồm 2-80 ký tự chữ hoa, số và dấu gạch dưới (VD: STAFF_SERVICE)",
        }));
        return;
      }
    }

    if (!trimmedName || trimmedName.length < 2) {
      setModalState((prev) => ({ ...prev, error: "Tên vai trò phải có ít nhất 2 ký tự" }));
      return;
    }

    if (!modalState.baseRoleId) {
      setModalState((prev) => ({ ...prev, error: "Vui lòng chọn vai trò cơ sở" }));
      return;
    }

    setModalState((prev) => ({ ...prev, submitting: true }));

    const selectedIds = Array.from(modalState.selectedPermissionIds);

    try {
      if (modalState.mode === "create") {
        const created = await createCustomRoleApi({
          code: trimmedCode,
          name: trimmedName,
          description: trimmedDesc.length > 0 ? trimmedDesc : null,
          baseRoleId: modalState.baseRoleId,
          permissionIds: selectedIds,
        });

        const newBrowserRole: RolePermissionsBrowserRole = {
          id: created.id,
          code: created.code ?? trimmedCode,
          name: created.name,
          description: created.description ?? null,
          userCount: 0,
          enabledCount: selectedIds.length,
          createdAt: created.createdAt ?? new Date().toISOString(),
          type: "CUSTOM",
          baseRoleId: modalState.baseRoleId,
        };

        const chosenPermissions = modalState.baseRolePermissions.filter((p) =>
          modalState.selectedPermissionIds.has(p.id),
        );

        setCurrentRoles((prev) => [...prev, newBrowserRole]);
        setPermissionsByRoleId((prev) => ({
          ...prev,
          [newBrowserRole.id]: chosenPermissions,
        }));

        setActiveRoleTab("CUSTOM");
        setSelectedRoleId(newBrowserRole.id);
        replaceUrlParams(newBrowserRole.id);

        setModalState((prev) => ({ ...prev, isOpen: false, submitting: false }));
        void showSuccessAlert("Thành công", "Tạo vai trò tùy chỉnh thành công");
      } else {
        const roleId = modalState.roleId!;
        const updated = await updateCustomRoleApi(roleId, {
          name: trimmedName,
          description: trimmedDesc.length > 0 ? trimmedDesc : null,
          baseRoleId: modalState.baseRoleId,
          permissionIds: selectedIds,
        });

        setCurrentRoles((prev) =>
          prev.map((r) =>
            r.id === roleId
              ? {
                  ...r,
                  name: updated.name,
                  description: updated.description ?? null,
                  baseRoleId: modalState.baseRoleId,
                  enabledCount: selectedIds.length,
                }
              : r,
          ),
        );

        const chosenPermissions = modalState.baseRolePermissions.filter((p) =>
          modalState.selectedPermissionIds.has(p.id),
        );

        setPermissionsByRoleId((prev) => ({
          ...prev,
          [roleId]: chosenPermissions,
        }));

        setModalState((prev) => ({ ...prev, isOpen: false, submitting: false }));
        void showSuccessAlert("Thành công", "Cập nhật vai trò tùy chỉnh thành công");
      }
    } catch (error) {
      let errorMessage = "Không thể lưu vai trò";
      if (error instanceof HttpError) {
        errorMessage = getErrorMessage(error.data, errorMessage);
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      setModalState((prev) => ({
        ...prev,
        submitting: false,
        error: errorMessage,
      }));
    }
  };

  /* ────────────── Delete Custom Role ────────────── */

  const handleDeleteRole = async (role: RolePermissionsBrowserRole) => {
    const result = await showConfirmDialog({
      title: "Xóa vai trò tùy chỉnh",
      text: `Bạn có chắc chắn muốn xóa vai trò "${role.name}" (${role.code})? Hành động này không thể hoàn tác.`,
      confirmText: "Xóa vai trò",
      cancelText: "Hủy bỏ",
      icon: "warning",
    });

    if (!result.isConfirmed) return;

    try {
      await deleteCustomRoleApi(role.id);

      setCurrentRoles((prev) => prev.filter((r) => r.id !== role.id));
      setPermissionsByRoleId((prev) => {
        const next = { ...prev };
        delete next[role.id];
        return next;
      });

      const remainingCustom = customRoles.filter((r) => r.id !== role.id);
      const nextSelectedId = remainingCustom[0]?.id ?? null;
      setSelectedRoleId(nextSelectedId);
      replaceUrlParams(nextSelectedId);
      if (nextSelectedId) {
        void loadRolePermissions(nextSelectedId);
      }

      void showSuccessAlert("Đã xóa", "Xóa vai trò tùy chỉnh thành công");
    } catch (error) {
      let message = "Không thể xóa vai trò";
      if (error instanceof HttpError) {
        message = getErrorMessage(error.data, message);
      } else if (error instanceof Error) {
        message = error.message;
      }
      void showErrorAlert("Không thể xóa vai trò", message);
    }
  };

  const baseRoleOfSelected = useMemo(() => {
    if (!selectedRole || selectedRole.type !== "CUSTOM" || !selectedRole.baseRoleId) {
      return null;
    }
    return defaultRoles.find((r) => r.id === selectedRole.baseRoleId) ?? null;
  }, [defaultRoles, selectedRole]);

  const modalFilteredPermissions = useMemo(() => {
    const q = modalState.permissionFilterQuery.trim().toLowerCase();
    if (!q) return modalState.baseRolePermissions;
    return modalState.baseRolePermissions.filter((p) =>
      p.description.toLowerCase().includes(q),
    );
  }, [modalState.baseRolePermissions, modalState.permissionFilterQuery]);

  return (
    <div className="space-y-4">
      {/* ── Top Horizontal Navigation: Vai trò mặc định / Vai trò tùy chỉnh ── */}
      <div
        className="flex items-center gap-2 border-b border-[color:rgba(198,197,213,0.35)] pb-3"
        role="tablist"
        aria-label="Phân loại vai trò"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeRoleTab === "DEFAULT"}
          onClick={() => handleRoleTabChange("DEFAULT")}
          className={`flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
            activeRoleTab === "DEFAULT"
              ? "bg-[#25483f] text-white shadow-sm"
              : "bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900"
          }`}
        >
          <VsIcon name="shield" className="text-[18px]" />
          <span>Vai trò mặc định</span>
          <span
            className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${
              activeRoleTab === "DEFAULT"
                ? "bg-white/20 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {defaultRoles.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeRoleTab === "CUSTOM"}
          onClick={() => handleRoleTabChange("CUSTOM")}
          className={`flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
            activeRoleTab === "CUSTOM"
              ? "bg-[#25483f] text-white shadow-sm"
              : "bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900"
          }`}
        >
          <VsIcon name="tune" className="text-[18px]" />
          <span>Vai trò tùy chỉnh</span>
          <span
            className={`ml-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${
              activeRoleTab === "CUSTOM"
                ? "bg-white/20 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {customRoles.length}
          </span>
        </button>
      </div>

      {/* ── Main Grid Layout ── */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* ── Left Pane: Role List ── */}
        <div className="lg:col-span-4 xl:col-span-3">
          <RbacRoleListPanel
            roles={activeTabRoles}
            selectedRoleId={selectedRoleId}
            onSelectRole={handleSelectRole}
            className="sticky top-6 max-h-[calc(100vh-48px)] overflow-hidden"
            isCustomTab={activeRoleTab === "CUSTOM"}
            onCreateRole={handleOpenCreateModal}
          />
        </div>

        {/* ── Right Pane: Detail & Permissions ── */}
        <div className="space-y-6 lg:col-span-8 xl:col-span-9">
          {/* Default Role Header (Read-only) */}
          {selectedRole && selectedRole.type === "SYSTEM_TEMPLATE" && (
            <RbacRoleDetailHeader
              role={selectedRole}
              totalPermissions={selectedRoleTotalPermissions}
              activeTab={detailTab}
              onTabChange={setDetailTab}
            />
          )}

          {/* Custom Role Header with Edit / Delete Actions */}
          {selectedRole && selectedRole.type === "CUSTOM" && (
            <div className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 shadow-2xs">
                    <VsIcon name="tune" className="text-[32px]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-900">
                        Vai trò tùy chỉnh
                      </span>
                      {baseRoleOfSelected && (
                        <span className="text-xs text-gray-500">
                          Kế thừa: <strong className="text-gray-700">{baseRoleOfSelected.name}</strong>
                        </span>
                      )}
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                      {selectedRole.code}
                    </h1>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {selectedRole.name !== selectedRole.code
                        ? selectedRole.name
                        : selectedRole.description ?? "Vai trò tùy chỉnh"}
                      {" • "}
                      <span className="font-semibold text-gray-700">
                        {selectedRoleTotalPermissions} quyền
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(selectedRole)}
                    className="flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-xs transition hover:bg-gray-50 hover:text-gray-900"
                  >
                    <VsIcon name="edit" className="text-[18px]" />
                    <span>Chỉnh sửa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRole(selectedRole)}
                    className="flex min-h-11 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 shadow-xs transition hover:bg-red-100 hover:text-red-700"
                  >
                    <VsIcon name="delete" className="text-[18px]" />
                    <span>Xóa vai trò</span>
                  </button>
                </div>
              </div>

              {/* Sub Navigation Tabs */}
              <div className="mt-6 flex border-b border-gray-200" role="tablist" aria-label="Chi tiết vai trò">
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === "PERMISSIONS"}
                  onClick={() => setDetailTab("PERMISSIONS")}
                  className={`flex min-h-11 h-11 items-center gap-2 border-b-2 px-4 text-xs font-semibold transition-colors ${
                    detailTab === "PERMISSIONS"
                      ? "border-emerald-700 text-emerald-900"
                      : "border-transparent text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <VsIcon name="key" className="text-[16px]" />
                  <span>Quyền hạn ({selectedRoleTotalPermissions})</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === "INFO"}
                  onClick={() => setDetailTab("INFO")}
                  className={`flex min-h-11 h-11 items-center gap-2 border-b-2 px-4 text-xs font-semibold transition-colors ${
                    detailTab === "INFO"
                      ? "border-emerald-700 text-emerald-900"
                      : "border-transparent text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <VsIcon name="info" className="text-[16px]" />
                  <span>Thông tin</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === "USERS"}
                  onClick={() => setDetailTab("USERS")}
                  className={`flex min-h-11 h-11 items-center gap-2 border-b-2 px-4 text-xs font-semibold transition-colors ${
                    detailTab === "USERS"
                      ? "border-emerald-700 text-emerald-900"
                      : "border-transparent text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <VsIcon name="groups" className="text-[16px]" />
                  <span>Người dùng ({selectedRole.userCount})</span>
                </button>
              </div>
            </div>
          )}

          {/* Truthful Empty State when Custom Tab has no custom roles */}
          {activeRoleTab === "CUSTOM" && customRoles.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-xs">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-800 mb-4">
                <VsIcon name="tune" className="text-[32px]" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                Chưa có vai trò tùy chỉnh nào
              </h3>
              <p className="mt-1 max-w-md text-sm text-gray-500">
                Tạo vai trò tùy chỉnh kế thừa từ vai trò cơ sở để phân bổ quyền hạn phù hợp với mô hình vận hành của bạn.
              </p>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="mt-5 flex min-h-11 items-center gap-2 rounded-xl bg-[#25483f] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1a352d]"
              >
                <VsIcon name="add" className="text-[18px]" />
                <span>Tạo vai trò mới</span>
              </button>
            </div>
          )}

          {/* Error Notification */}
          {selectedRoleError && (
            <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <span>{selectedRoleError}</span>
              {selectedRoleId && (
                <button
                  type="button"
                  onClick={() => {
                    setPermissionsByRoleId((prev) => {
                      const next = { ...prev };
                      delete next[selectedRoleId];
                      return next;
                    });
                    void loadRolePermissions(selectedRoleId);
                  }}
                  className="flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 font-semibold text-white transition hover:bg-red-700"
                >
                  Thử lại
                </button>
              )}
            </div>
          )}

          {/* Loading Spinner */}
          {selectedRoleLoading && (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-12 text-sm text-gray-500 shadow-sm">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <span>Đang tải danh sách quyền...</span>
            </div>
          )}

          {/* Detail Content */}
          {!selectedRoleLoading && selectedRole && (
            <>
              {detailTab === "PERMISSIONS" && (
                <RbacPermissionGroups permissions={selectedRolePermissions} />
              )}

              {detailTab === "INFO" && (
                <div className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900">
                    Thông tin vai trò
                  </h3>
                  <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-gray-50 p-3">
                      <dt className="text-xs font-semibold text-gray-500">Mã vai trò</dt>
                      <dd className="mt-1 font-mono text-sm font-bold text-gray-900">{selectedRole.code}</dd>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <dt className="text-xs font-semibold text-gray-500">Tên hiển thị</dt>
                      <dd className="mt-1 text-sm font-bold text-gray-900">{selectedRole.name}</dd>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <dt className="text-xs font-semibold text-gray-500">Loại cấu hình</dt>
                      <dd className="mt-1 text-sm text-gray-700">
                        {selectedRole.type === "CUSTOM"
                          ? "Vai trò tùy chỉnh"
                          : "Vai trò hệ thống mặc định"}
                      </dd>
                    </div>
                    {selectedRole.type === "CUSTOM" && baseRoleOfSelected && (
                      <div className="rounded-xl bg-gray-50 p-3">
                        <dt className="text-xs font-semibold text-gray-500">Vai trò cơ sở</dt>
                        <dd className="mt-1 text-sm font-bold text-gray-900">
                          {baseRoleOfSelected.name} ({baseRoleOfSelected.code})
                        </dd>
                      </div>
                    )}
                    <div className="rounded-xl bg-gray-50 p-3">
                      <dt className="text-xs font-semibold text-gray-500">Ngày tạo</dt>
                      <dd className="mt-1 text-sm text-gray-700">{formatDate(selectedRole.createdAt)}</dd>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3 sm:col-span-2">
                      <dt className="text-xs font-semibold text-gray-500">Mô tả nghiệp vụ</dt>
                      <dd className="mt-1 text-sm text-gray-700">
                        {selectedRole.description || "Không có mô tả bổ sung cho vai trò này."}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}

              {detailTab === "USERS" && (
                <div className="rounded-2xl border border-[color:rgba(198,197,213,0.35)] bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">
                        Danh sách người dùng được gán ({selectedRole.userCount})
                      </h3>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Các tài khoản hiện đang thừa hưởng quyền hạn từ vai trò này.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/50 p-6 text-center text-xs text-gray-500">
                    {selectedRole.userCount > 0
                      ? `Hiện có ${selectedRole.userCount} người dùng đang áp dụng vai trò này. Quản lý phân bổ tài khoản được thực hiện tại mục Quản lý người dùng.`
                      : "Chưa có người dùng nào được gán vai trò này."}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Create / Edit Custom Role Modal ── */}
      {modalState.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-modal-title"
        >
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-gray-100 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                  <VsIcon name={modalState.mode === "create" ? "add" : "edit"} className="text-[20px]" />
                </div>
                <div>
                  <h2 id="role-modal-title" className="text-lg font-bold text-gray-900">
                    {modalState.mode === "create" ? "Tạo vai trò tùy chỉnh" : "Chỉnh sửa vai trò tùy chỉnh"}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {modalState.mode === "create"
                      ? "Khởi tạo vai trò mới với tập quyền thu hẹp từ vai trò cơ sở"
                      : `Cập nhật cấu hình và phân quyền cho ${modalState.code}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={modalState.submitting}
                className="flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                aria-label="Đóng cửa sổ"
              >
                <VsIcon name="close" className="text-[20px]" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitModal} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                {modalState.error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
                    {modalState.error}
                  </div>
                )}

                {/* Form fields */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Code field */}
                  <div>
                    <label htmlFor="modal-code" className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                      Mã vai trò <span className="text-red-500">*</span>
                    </label>
                    {modalState.mode === "create" ? (
                      <>
                        <input
                          id="modal-code"
                          type="text"
                          value={modalState.code}
                          onChange={(e) =>
                            setModalState((prev) => ({
                              ...prev,
                              code: e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="VD: FRONTDESK_NIGHT"
                          className="mt-1.5 h-11 min-h-11 w-full rounded-xl border border-gray-300 px-3.5 font-mono text-sm text-gray-900 uppercase placeholder-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          required
                        />
                        <p className="mt-1 text-[11px] text-gray-500">
                          Chỉ chữ hoa, số và gạch dưới (A-Z, 0-9, _)
                        </p>
                      </>
                    ) : (
                      <div className="mt-1.5 flex h-11 min-h-11 items-center rounded-xl border border-gray-200 bg-gray-100 px-3.5 font-mono text-sm font-bold text-gray-700">
                        {modalState.code}
                      </div>
                    )}
                  </div>

                  {/* Name field */}
                  <div>
                    <label htmlFor="modal-name" className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                      Tên vai trò <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="modal-name"
                      type="text"
                      value={modalState.name}
                      onChange={(e) =>
                        setModalState((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="VD: Lễ tân ca đêm"
                      className="mt-1.5 h-11 min-h-11 w-full rounded-xl border border-gray-300 px-3.5 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      required
                    />
                  </div>
                </div>

                {/* Base Role Select */}
                <div>
                  <label htmlFor="modal-base-role" className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                    Vai trò cơ sở <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="modal-base-role"
                    value={modalState.baseRoleId}
                    onChange={(e) => void handleModalBaseChange(e.target.value)}
                    className="mt-1.5 h-11 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-medium text-gray-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    required
                  >
                    <option value="" disabled>-- Chọn vai trò cơ sở --</option>
                    {defaultRoles.map((dr) => (
                      <option key={dr.id} value={dr.id}>
                        {dr.name} ({dr.code})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Vai trò tùy chỉnh chỉ được cấp các quyền thuộc phạm vi vai trò cơ sở đã chọn.
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="modal-desc" className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                    Mô tả nghiệp vụ
                  </label>
                  <textarea
                    id="modal-desc"
                    value={modalState.description}
                    onChange={(e) =>
                      setModalState((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Mô tả tóm tắt phạm vi trách nhiệm của vai trò..."
                    rows={2}
                    className="mt-1.5 w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Permission Checklist Area */}
                <div className="border-t border-gray-200 pt-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                        Danh sách quyền hạn ({modalState.selectedPermissionIds.size} / {modalState.baseRolePermissions.length})
                      </h4>
                      <p className="text-[11px] text-gray-500">
                        Chọn các quyền được phép thực thi trong vai trò này.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAllPermissions(true, modalFilteredPermissions)}
                        className="text-xs font-semibold text-emerald-800 hover:underline"
                      >
                        Chọn tất cả
                      </button>
                      <span className="text-gray-300">•</span>
                      <button
                        type="button"
                        onClick={() => handleSelectAllPermissions(false, modalFilteredPermissions)}
                        className="text-xs font-semibold text-gray-600 hover:underline"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  </div>

                  {/* Filter inside permissions */}
                  <div className="mt-2.5">
                    <input
                      type="text"
                      value={modalState.permissionFilterQuery}
                      onChange={(e) =>
                        setModalState((prev) => ({
                          ...prev,
                          permissionFilterQuery: e.target.value,
                        }))
                      }
                      placeholder="Lọc danh sách quyền..."
                      className="h-10 min-h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Checklist scroll area */}
                  <div className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-gray-200 p-2.5">
                    {modalState.loadingBasePermissions ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-500">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                        <span>Đang tải danh sách quyền từ vai trò cơ sở...</span>
                      </div>
                    ) : modalFilteredPermissions.length === 0 ? (
                      <p className="py-6 text-center text-xs text-gray-400 italic">
                        {modalState.permissionFilterQuery.trim()
                          ? "Không tìm thấy quyền phù hợp với từ khóa"
                          : "Vai trò cơ sở chưa có quyền hạn nào"}
                      </p>
                    ) : (
                      modalFilteredPermissions.map((perm) => {
                        const isChecked = modalState.selectedPermissionIds.has(perm.id);
                        return (
                          <label
                            key={perm.id}
                            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                              isChecked
                                ? "border-emerald-300 bg-emerald-50/50 text-emerald-950"
                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePermission(perm.id)}
                              className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500"
                            />
                            <span className="text-xs font-medium leading-relaxed">
                              {perm.description}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 rounded-b-3xl">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={modalState.submitting}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={modalState.submitting || modalState.loadingBasePermissions}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#25483f] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#1a352d] disabled:opacity-50"
                >
                  {modalState.submitting && (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  <span>{modalState.mode === "create" ? "Tạo vai trò" : "Lưu thay đổi"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
