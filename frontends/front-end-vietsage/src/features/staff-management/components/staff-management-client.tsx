"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { SwalVietSage } from "@/libs/swal";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { OneTimePasswordDialog } from "@/features/account/security/one-time-password-dialog";
import { canResetFrontdeskPassword } from "@/features/account/security/password-security";
import { exportToExcel } from "@/libs/excel-export";
import type { HotelStaffUser } from "../types/staff-management-contract";
import {
  type StaffManagementScope,
  useStaffDirectoryQuery,
  useStaffManagementMutations,
} from "../queries/use-staff-directory-query";
import { staffDirectoryRepository } from "../repositories/staff-directory-repository";
import { RoomSearchSelect } from "./room-search-select";

export type StaffHotelOption = { id: string; code?: string | null; name: string };

type Props = {
  scope: Omit<StaffManagementScope, "hotelId">;
  canManage: boolean;
  initialHotelId?: string | null;
  onHotelPath?: string;
};

type FormFieldErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  roleId?: string;
  roomId?: string;
};

function extractApiErrorMessage(error: unknown): { message: string; field?: keyof FormFieldErrors } {
  if (error && typeof error === "object") {
    const errObj = error as Record<string, unknown>;
    const status = typeof errObj.status === "number" ? errObj.status : undefined;
    const data = errObj.data;

    let detail = "";
    if (typeof data === "string") {
      detail = data;
    } else if (data && typeof data === "object") {
      const dataRecord = data as Record<string, unknown>;
      const nestedData = dataRecord.data;
      if (typeof dataRecord.detail === "string") {
        detail = dataRecord.detail;
      } else if (nestedData && typeof nestedData === "object" && typeof (nestedData as Record<string, unknown>).detail === "string") {
        detail = (nestedData as Record<string, unknown>).detail as string;
      } else if (typeof dataRecord.message === "string") {
        detail = dataRecord.message;
      }
    } else if (typeof errObj.message === "string") {
      detail = errObj.message;
    }

    const lowerDetail = detail.toLowerCase();
    if (status === 409 || lowerDetail.includes("email already exists") || lowerDetail.includes("email đã tồn tại") || lowerDetail.includes("already exists")) {
      return {
        message: "Email này đã tồn tại trong hệ thống. Vui lòng chọn email khác.",
        field: "email",
      };
    }

    if (detail && !detail.startsWith("Internal API request failed")) {
      return { message: detail };
    }
  }

  if (error instanceof Error && !error.message.startsWith("Internal API request failed")) {
    return { message: error.message };
  }

  return { message: "Không thể xử lý yêu cầu. Vui lòng kiểm tra lại thông tin." };
}

export function StaffManagementClient({ scope, canManage, initialHotelId = null, onHotelPath }: Props) {
  const [hotelId, setHotelId] = useState(initialHotelId ?? "");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const activeScope = { ...scope, hotelId: hotelId || null };
  const directory = useStaffDirectoryQuery(activeScope, {
    q: debouncedQuery,
    page,
    limit: pageSize,
  });
  const mutations = useStaffManagementMutations(activeScope);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", roleId: "", roomId: "" });
  const [formErrors, setFormErrors] = useState<FormFieldErrors>({});
  const [formGeneralError, setFormGeneralError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [resetAccountLabel, setResetAccountLabel] = useState("");
  const [editingUser, setEditingUser] = useState<HotelStaffUser | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", email: "", roomId: "" });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const data = directory.data;
  const hasMultipleHotels = (data?.hotels?.length ?? 0) > 1;
  const singleHotelId = data?.hotels?.length === 1 ? data.hotels[0].id : null;
  const effectiveHotelId = hotelId || singleHotelId || "";

  const selectedHotel = useMemo(
    () => data?.hotels.find((h) => h.id === effectiveHotelId),
    [data?.hotels, effectiveHotelId],
  );
  const isRoomExclusive = selectedHotel?.staffScopeMode === "ROOM_EXCLUSIVE";

  function isFrontDeskRole(roleIdOrCode?: string | null): boolean {
    if (!roleIdOrCode) return false;
    const role = data?.roles.find(
      (r) => r.id === roleIdOrCode || r.code === roleIdOrCode,
    );
    const code = role?.code ?? roleIdOrCode;
    const name = (role?.name ?? "").toLowerCase();
    return (
      code === "HOTEL_FRONTDESK" ||
      code.includes("FRONTDESK") ||
      name.includes("lễ tân") ||
      name.includes("front desk") ||
      name.includes("sale")
    );
  }

  const userRoomAssignmentMap = useMemo(() => {
    const map = new Map<string, { id: string; roomId: string; roomNumber: string; assignedAt: string }>();
    for (const assignment of data?.assignments?.items ?? []) {
      if (assignment.roomAssignment) {
        map.set(assignment.userId, assignment.roomAssignment);
      }
    }
    return map;
  }, [data?.assignments?.items]);

  const roomUserAssignmentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const assignment of data?.assignments?.items ?? []) {
      if (assignment.roomAssignment?.roomId) {
        map.set(assignment.roomAssignment.roomId, assignment.userId);
      }
    }
    return map;
  }, [data?.assignments?.items]);

  const availableRoomsForEdit = useMemo(() => {
    if (!editingUser) return [];
    const currentRoom = userRoomAssignmentMap.get(editingUser.id);
    const rooms = [...(data?.rooms ?? [])];
    if (currentRoom && !rooms.some((r) => r.id === currentRoom.roomId)) {
      rooms.unshift({
        id: currentRoom.roomId,
        roomNumber: currentRoom.roomNumber,
        type: "",
      });
    }
    return rooms.filter((r) => {
      const occupiedBy = roomUserAssignmentMap.get(r.id);
      return !occupiedBy || occupiedBy === editingUser.id;
    });
  }, [data?.rooms, roomUserAssignmentMap, editingUser, userRoomAssignmentMap]);

  function openEditStaff(user: HotelStaffUser) {
    const currentRoom = userRoomAssignmentMap.get(user.id);
    setEditingUser(user);
    setEditForm({
      fullName: user.fullName,
      email: user.email,
      roomId: currentRoom?.roomId ?? "",
    });
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    const currentRoom = userRoomAssignmentMap.get(editingUser.id);
    const oldRoomId = currentRoom?.roomId ?? "";
    const newRoomId = editForm.roomId.trim();

    const isProfileChanged =
      editForm.fullName.trim() !== editingUser.fullName ||
      editForm.email.trim().toLowerCase() !== editingUser.email.toLowerCase();
    const isRoomChanged = oldRoomId !== newRoomId;

    if (!isProfileChanged && !isRoomChanged) {
      setEditingUser(null);
      return;
    }

    setIsSavingEdit(true);
    try {
      const tasks: Promise<unknown>[] = [];

      if (isProfileChanged) {
        tasks.push(
          mutations.updateUser.mutateAsync({
            userId: editingUser.id,
            fullName: editForm.fullName.trim(),
            email: editForm.email.trim().toLowerCase(),
          }),
        );
      }

      if (isRoomChanged && effectiveHotelId) {
        if (newRoomId) {
          tasks.push(
            mutations.assignRoom.mutateAsync({
              userId: editingUser.id,
              roomId: newRoomId,
            }),
          );
        } else if (oldRoomId) {
          tasks.push(
            mutations.unassignRoom.mutateAsync({
              userId: editingUser.id,
            }),
          );
        }
      }

      await Promise.all(tasks);

      setEditingUser(null);
      await SwalVietSage.fire({
        icon: "success",
        title: "Đã cập nhật thông tin nhân viên",
        timer: 1500,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } catch (error) {
      const { message } = extractApiErrorMessage(error);
      await SwalVietSage.fire({
        icon: "error",
        title: "Không thể cập nhật",
        text: message,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleAddRole(user: { id: string; fullName: string; roles: Array<{ id: string }> }) {
    const availableRoles = (data?.roles ?? []).filter(
      (role) => !user.roles.some((current) => current.id === role.id),
    );
    if (availableRoles.length === 0) {
      await SwalVietSage.fire({
        icon: "info",
        title: "Đã đủ vai trò",
        text: `Nhân viên ${user.fullName} đã được gán tất cả các vai trò khả dụng.`,
        confirmButtonText: "OK",
      });
      return;
    }

    const options = availableRoles
      .map((r) => `<option value="${r.id}">${r.name}</option>`)
      .join("");

    const result = await SwalVietSage.fire({
      title: `Gán vai trò cho ${user.fullName}`,
      html: `
        <div class="text-left">
          <label class="block text-sm font-semibold mb-2 text-slate-700">Chọn vai trò cần gán:</label>
          <select id="swal-role-select" class="swal2-input !h-11 !w-full !m-0 !text-sm">
            <option value="">-- Chọn vai trò --</option>
            ${options}
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Gán vai trò",
      cancelButtonText: "Hủy",
      reverseButtons: false,
      preConfirm: () => {
        const select = document.getElementById("swal-role-select") as HTMLSelectElement;
        const val = select?.value?.trim();
        if (!val) {
          SwalVietSage.showValidationMessage("Vui lòng chọn vai trò");
          return false;
        }
        return val;
      },
    });

    if (!result.isConfirmed || !result.value) return;
    await runMutation(
      `assign-${user.id}`,
      () => mutations.assignRole.mutateAsync({ userId: user.id, roleId: result.value }),
      "Đã gán vai trò thành công",
    );
  }

  async function resetFrontdesk(user: { id: string; fullName: string }) {
    const confirmed = await SwalVietSage.fire({ icon: "warning", title: "Cấp lại mật khẩu?", text: `Tạo mật khẩu tạm thời mới cho ${user.fullName}. Tất cả phiên hiện tại sẽ bị thu hồi.`, showCancelButton: true, confirmButtonText: "Cấp lại mật khẩu", cancelButtonText: "Hủy" });
    if (!confirmed.isConfirmed) return;
    try {
      const result = await mutations.resetFrontdeskPassword.mutateAsync({ userId: user.id });
      setResetAccountLabel(user.fullName);
      setTemporaryPassword(result.temporaryPassword);
    } catch (error) {
      const { message } = extractApiErrorMessage(error);
      await SwalVietSage.fire({ icon: "error", title: "Không thể cấp lại mật khẩu", text: message, showConfirmButton: true, confirmButtonText: "OK" });
    }
  }



  async function toggleStaff(user: { id: string; fullName: string; userStatus?: string; tenantStatus?: string }) {
    const locked = user.userStatus === "DISABLED" || user.tenantStatus === "DISABLED";
    const result = await SwalVietSage.fire({ icon: locked ? "question" : "warning", title: locked ? "Mở khóa nhân viên?" : "Khóa nhân viên?", text: locked ? `Cho phép ${user.fullName} đăng nhập lại.` : `Nhân viên ${user.fullName} sẽ không thể đăng nhập.`, showCancelButton: true, confirmButtonText: locked ? "Mở khóa" : "Khóa", cancelButtonText: "Hủy" });
    if (!result.isConfirmed) return;
    await runMutation(`status-${user.id}`, () => mutations.updateUser.mutateAsync({ userId: user.id, status: locked ? "ACTIVE" : "DISABLED" }), locked ? "Đã mở khóa nhân viên" : "Đã khóa nhân viên");
  }

  const assignedUserIds = useMemo(
    () => new Set(data?.assignments?.items.map((assignment) => assignment.userId) ?? []),
    [data?.assignments?.items],
  );
  const users = useMemo(
    () =>
      (data?.users.items ?? []).filter(
        (user) => !user.roles.some((r) => r.code === "TENANT_OWNER" || r.code === "SUPER_ADMIN"),
      ),
    [data?.users.items],
  );
  const displayedUsers = useMemo(
    () => (hasMultipleHotels && effectiveHotelId ? users.filter((user) => assignedUserIds.has(user.id)) : users),
    [hasMultipleHotels, effectiveHotelId, users, assignedUserIds],
  );
  const skeletonRows = useMemo(() => Array.from({ length: 5 }, (_, i) => ({ id: `skel-${i}` })), []);

  const totalItems = useMemo(() => {
    if (!data) return 0;
    if (hasMultipleHotels && effectiveHotelId && data.assignments) {
      return data.assignments.total ?? data.users.total ?? displayedUsers.length;
    }
    return data.users.total ?? displayedUsers.length;
  }, [data, hasMultipleHotels, effectiveHotelId, displayedUsers.length]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormErrors({});
    setFormGeneralError(null);

    if (!effectiveHotelId) {
      setFormGeneralError("Vui lòng chọn khách sạn trước khi tạo nhân viên.");
      return;
    }
    const defaultFrontDeskRoleId =
      data?.roles.find((r) => isFrontDeskRole(r.code ?? r.id))?.id ?? data?.roles[0]?.id;
    const activeRoleId = form.roleId || defaultFrontDeskRoleId;

    if (!activeRoleId) {
      setFormGeneralError("Hệ thống chưa cấu hình vai trò cho nhân viên.");
      return;
    }
    try {
      await mutations.createUser.mutateAsync({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        roleIds: [activeRoleId],
        hotelId: effectiveHotelId,
        roomId: form.roomId || undefined,
      });
      setForm({ fullName: "", email: "", password: "", roleId: "", roomId: "" });
      setFormErrors({});
      setFormGeneralError(null);
      setShowPassword(false);
      setFormOpen(false);
      await SwalVietSage.fire({ icon: "success", title: "Đã tạo và phân công nhân viên", timer: 1500, showConfirmButton: true, confirmButtonText: "OK" });
    } catch (error) {
      const { message, field } = extractApiErrorMessage(error);
      if (field) {
        setFormErrors((prev) => ({ ...prev, [field]: message }));
      } else {
        setFormGeneralError(message);
      }
    }
  }

  async function runMutation(actionKey: string, action: () => Promise<unknown>, successTitle: string) {
    setActiveActionKey(actionKey);
    try {
      await action();
      await SwalVietSage.fire({ icon: "success", title: successTitle, timer: 1500, showConfirmButton: true, confirmButtonText: "OK" });
    } catch (error) {
      const { message } = extractApiErrorMessage(error);
      await SwalVietSage.fire({ icon: "error", title: "Không thể cập nhật", text: message, showConfirmButton: true, confirmButtonText: "OK" });
    } finally {
      setActiveActionKey(null);
    }
  }

  async function handleExportStaffExcel() {
    if (totalItems === 0) {
      void SwalVietSage.fire({
        icon: "info",
        title: "Không có dữ liệu",
        text: "Không có nhân viên nào để xuất Excel.",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
      return;
    }

    setIsExporting(true);

    try {
      const EXPORT_PAGE_SIZE = 100;
      let allUsers: HotelStaffUser[] = [];
      let currentHotel = data?.hotels?.find((h) => h.id === effectiveHotelId);
      const allAssignedUserIds = new Set<string>(
        data?.assignments?.items.map((a) => a.userId) ?? [],
      );

      // Fast path: if page 1 already holds the entire dataset
      if (
        page === 1 &&
        data &&
        data.users.items.length >= totalItems &&
        displayedUsers.length === totalItems
      ) {
        allUsers = [...displayedUsers];
      } else {
        const firstPageData = await staffDirectoryRepository.list(activeScope, {
          q: debouncedQuery,
          page: 1,
          limit: EXPORT_PAGE_SIZE,
        });

        if (firstPageData.hotels && !currentHotel) {
          currentHotel = firstPageData.hotels.find((h) => h.id === effectiveHotelId);
        }
        if (firstPageData.assignments?.items) {
          for (const a of firstPageData.assignments.items) {
            allAssignedUserIds.add(a.userId);
          }
        }

        const rawUsers: HotelStaffUser[] = [...firstPageData.users.items];
        const serverTotal = firstPageData.users.total ?? firstPageData.users.items.length;
        const totalPagesNeeded = Math.max(1, Math.ceil(serverTotal / EXPORT_PAGE_SIZE));

        if (totalPagesNeeded > 1) {
          const remainingPages = await Promise.all(
            Array.from({ length: totalPagesNeeded - 1 }, (_, idx) =>
              staffDirectoryRepository.list(activeScope, {
                q: debouncedQuery,
                page: idx + 2,
                limit: EXPORT_PAGE_SIZE,
              }),
            ),
          );

          for (const pageSnapshot of remainingPages) {
            rawUsers.push(...pageSnapshot.users.items);
            if (pageSnapshot.assignments?.items) {
              for (const a of pageSnapshot.assignments.items) {
                allAssignedUserIds.add(a.userId);
              }
            }
          }
        }

        const userMap = new Map<string, HotelStaffUser>();
        for (const u of rawUsers) {
          if (!u.roles.some((r) => r.code === "TENANT_OWNER" || r.code === "SUPER_ADMIN")) {
            userMap.set(u.id, u);
          }
        }

        let filtered = Array.from(userMap.values());
        if (hasMultipleHotels && effectiveHotelId) {
          filtered = filtered.filter((u) => allAssignedUserIds.has(u.id));
        }
        allUsers = filtered;
      }

      if (allUsers.length === 0) {
        void SwalVietSage.fire({
          icon: "info",
          title: "Không có dữ liệu",
          text: "Không có nhân viên nào phù hợp để xuất Excel.",
          showConfirmButton: true,
          confirmButtonText: "OK",
        });
        return;
      }

      const hotelLabel = currentHotel
        ? currentHotel.code
          ? `${currentHotel.code} · ${currentHotel.name}`
          : currentHotel.name
        : "Đã phân công";

      const exportData = allUsers.map((user, idx) => ({
        index: idx + 1,
        fullName: user.fullName,
        email: user.email,
        roles: user.roles?.map((r) => r.name).join(", ") || "--",
        hotelAssignment:
          assignedUserIds.has(user.id) || allAssignedUserIds.has(user.id)
            ? hotelLabel
            : "Chưa phân công",
        status: user.userStatus === "DISABLED" || user.tenantStatus === "DISABLED" ? "Bị khóa" : "Đang hoạt động",
      }));

      exportToExcel({
        filename: `danh-sach-nhan-vien-${new Date().toISOString().slice(0, 10)}.xls`,
        sheetName: "Nhân viên khách sạn",
        columns: [
          { header: "STT", key: "index" },
          { header: "Họ và tên", key: "fullName" },
          { header: "Email tài khoản", key: "email" },
          { header: "Vai trò", key: "roles" },
          { header: "Phân công khách sạn", key: "hotelAssignment" },
          { header: "Trạng thái", key: "status" },
        ],
        data: exportData,
      });

      void SwalVietSage.fire({
        icon: "success",
        title: "Xuất Excel thành công",
        text: `Đã xuất toàn bộ ${exportData.length} nhân viên ra tệp Excel.`,
        timer: 2000,
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } catch (error) {
      const { message } = extractApiErrorMessage(error);
      void SwalVietSage.fire({
        icon: "error",
        title: "Không thể xuất Excel",
        text: message || "Đã xảy ra lỗi khi tải danh sách nhân viên để xuất file.",
        showConfirmButton: true,
        confirmButtonText: "OK",
      });
    } finally {
      setIsExporting(false);
    }
  }

  const isBusy = mutations.createUser.isPending || mutations.assignRole.isPending || mutations.updateUser.isPending || mutations.assignRoom.isPending || mutations.unassignRoom.isPending || activeActionKey !== null;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Nhân viên", value: data?.users.total ?? 0, icon: "group" },
          {
            label: hasMultipleHotels
              ? effectiveHotelId ? "Nhân viên tại khách sạn" : "Chọn khách sạn để xem"
              : "Đã phân công",
            value: hasMultipleHotels
              ? (effectiveHotelId ? data?.assignments?.total ?? 0 : "--")
              : (data?.assignments?.total ?? 0),
            icon: "domain_add",
          },
          { label: "Vai trò dùng được", value: data?.roles.length ?? 0, icon: "verified_user" },
        ].map((metric) => (
          <article key={metric.label} className="rounded-xl border border-[var(--outline-variant)] bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--on-surface-variant)]">{metric.label}</p>
                {directory.isLoading ? (
                  <span className="mt-2 block h-9 w-20 animate-pulse rounded-lg bg-slate-200" />
                ) : (
                  <p className="mt-2 text-3xl font-semibold text-[var(--primary)]">{metric.value}</p>
                )}
              </div>
              <VsIcon name={metric.icon} className="text-2xl text-[var(--secondary)]" />
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-5">
        <div className={`grid gap-3 ${hasMultipleHotels ? "lg:grid-cols-[minmax(220px,320px)_1fr_auto]" : "lg:grid-cols-[1fr_auto]"}`}>
          {hasMultipleHotels ? (
            <select
              value={hotelId}
              onChange={(event) => {
                const value = event.target.value;
                setHotelId(value);
                setPage(1);
                if (onHotelPath) {
                  const nextUrl = new URL(window.location.href);
                  nextUrl.pathname = onHotelPath;
                  if (value) nextUrl.searchParams.set("hotelId", value);
                  else nextUrl.searchParams.delete("hotelId");
                  window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}`);
                }
              }}
              className="min-h-11 rounded-lg border border-[var(--outline-variant)] bg-white px-3 text-sm"
            >
              <option value="">Chọn khách sạn để phân công</option>
              {data?.hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.code ? `${hotel.code} · ` : ""}{hotel.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="relative">
            {directory.isFetching && !directory.isLoading ? (
              <VsIcon name="progress_activity" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 animate-spin text-[var(--primary)] text-lg" />
            ) : (
              <VsIcon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--outline)]" />
            )}
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm tên, email..."
              className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-white pl-11 pr-4 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isBusy || isExporting || totalItems === 0}
              onClick={handleExportStaffExcel}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-2 text-sm font-semibold text-[var(--primary)] shadow-2xs hover:bg-slate-50 disabled:opacity-40"
            >
              <VsIcon
                name={isExporting ? "progress_activity" : "file_download"}
                className={`text-lg ${isExporting ? "animate-spin" : ""}`}
              />
              {isExporting ? "Đang xuất..." : `Xuất Excel (${totalItems})`}
            </button>
            {canManage ? (
              <button
                type="button"
                disabled={!effectiveHotelId || isBusy}
                onClick={() => {
                  setFormErrors({});
                  setFormGeneralError(null);
                  setFormOpen((value) => !value);
                }}
                className="min-h-11 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <VsIcon name="person_add" className="mr-2 inline text-lg" />
                Thêm nhân viên
              </button>
            ) : (
              <span className="inline-flex items-center justify-center rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-2 text-sm font-semibold text-[var(--on-surface-variant)]">
                Chế độ chỉ xem
              </span>
            )}
          </div>
        </div>
      </section>

      {hasMultipleHotels && effectiveHotelId ? (
        <p className="text-sm text-[var(--on-surface-variant)]">
          Mỗi nhân viên chỉ làm việc tại một khách sạn. Phân công sang khách sạn này sẽ tự động thu hồi phân công cũ.
        </p>
      ) : null}

      {canManage && formOpen ? (
        <form onSubmit={submitCreate} className="rounded-xl border border-[var(--outline-variant)] bg-white p-5 space-y-3">
          {formGeneralError ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
              <VsIcon name="error" className="text-base text-red-500 shrink-0" />
              <span>{formGeneralError}</span>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 items-start">
            <div className="flex flex-col">
              <input
                required
                disabled={mutations.createUser.isPending}
                minLength={2}
                value={form.fullName}
                onChange={(e) => {
                  setForm({ ...form, fullName: e.target.value });
                  if (formErrors.fullName) setFormErrors((prev) => ({ ...prev, fullName: undefined }));
                }}
                placeholder="Họ tên"
                className={`min-h-11 w-full rounded-lg border px-3 text-sm transition-colors disabled:bg-slate-50 ${
                  formErrors.fullName
                    ? "border-red-500 focus:border-red-500 focus:outline-none"
                    : "border-[var(--outline-variant)]"
                }`}
              />
              {formErrors.fullName ? (
                <span className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1">
                  <VsIcon name="error" className="text-sm shrink-0" />
                  {formErrors.fullName}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col">
              <input
                required
                disabled={mutations.createUser.isPending}
                type="email"
                value={form.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value });
                  if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: undefined }));
                }}
                placeholder="Email đăng nhập"
                className={`min-h-11 w-full rounded-lg border px-3 text-sm transition-colors disabled:bg-slate-50 ${
                  formErrors.email
                    ? "border-red-500 focus:border-red-500 focus:outline-none"
                    : "border-[var(--outline-variant)]"
                }`}
              />
              {formErrors.email ? (
                <span className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1">
                  <VsIcon name="error" className="text-sm shrink-0" />
                  {formErrors.email}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col">
              <div className="relative">
                <input
                  required
                  disabled={mutations.createUser.isPending}
                  minLength={8}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value });
                    if (formErrors.password) setFormErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="Mật khẩu ban đầu"
                  className={`min-h-11 w-full rounded-lg border px-3 pr-10 text-sm outline-none transition-colors disabled:bg-slate-50 ${
                    formErrors.password
                      ? "border-red-500 focus:border-red-500"
                      : "border-[var(--outline-variant)] focus:border-[var(--primary)]"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)]"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  <VsIcon name={showPassword ? "visibility_off" : "visibility"} className="text-[20px]" />
                </button>
              </div>
              {formErrors.password ? (
                <span className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1">
                  <VsIcon name="error" className="text-sm shrink-0" />
                  {formErrors.password}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col">
              <RoomSearchSelect
                rooms={data?.rooms ?? []}
                roomUserAssignmentMap={roomUserAssignmentMap}
                value={form.roomId}
                onChange={(roomId) => {
                  setForm({ ...form, roomId });
                  if (formErrors.roomId) setFormErrors((prev) => ({ ...prev, roomId: undefined }));
                }}
                disabled={mutations.createUser.isPending}
                error={formErrors.roomId}
                required={false}
                placeholder="Phòng phụ trách (Tùy chọn)"
              />
              {formErrors.roomId ? (
                <span className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1">
                  <VsIcon name="error" className="text-sm shrink-0" />
                  {formErrors.roomId}
                </span>
              ) : null}
            </div>

            <button disabled={mutations.createUser.isPending} className="min-h-11 rounded-xl bg-[var(--secondary-container)] px-4 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {mutations.createUser.isPending ? (
                <>
                  <VsIcon name="progress_activity" className="animate-spin text-lg" />
                  <span>Đang tạo...</span>
                </>
              ) : (
                "Tạo & Phân công"
              )}
            </button>
          </div>
        </form>
      ) : null}

      {directory.isError ? (
        <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-container)] p-5 text-sm text-[var(--on-error-container)]">
          {directory.error instanceof Error ? directory.error.message : "Không tải được danh sách nhân viên."}
        </div>
      ) : null}

      {/* Desktop view */}
      <section className="hidden md:block">
        {directory.isLoading ? (
          <DataTable
            columns={[
              {
                key: "user",
                header: "Nhân viên",
                className: effectiveHotelId ? "w-[22%]" : "w-[28%]",
                headerClassName: effectiveHotelId ? "w-[22%]" : "w-[28%]",
                cell: () => (
                  <div className="space-y-1.5 py-1">
                    <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
                  </div>
                ),
              },
              {
                key: "roles",
                header: "Vai trò",
                className: effectiveHotelId ? "w-[22%]" : "w-[28%]",
                headerClassName: effectiveHotelId ? "w-[22%]" : "w-[28%]",
                cell: () => (
                  <div className="flex gap-2 py-1">
                    <div className="h-6 w-20 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
                  </div>
                ),
              },
              {
                key: "assignment",
                header: "Phân công",
                className: effectiveHotelId ? "w-[18%]" : "w-[22%]",
                headerClassName: effectiveHotelId ? "w-[18%]" : "w-[22%]",
                cell: () => <div className="h-7 w-28 animate-pulse rounded-full bg-slate-100" />,
              },
              ...(effectiveHotelId
                ? [
                    {
                      key: "room",
                      header: "Phòng phụ trách",
                      className: "w-[18%]",
                      headerClassName: "w-[18%]",
                      cell: () => <div className="h-7 w-24 animate-pulse rounded-md bg-slate-100" />,
                    },
                  ]
                : []),
              {
                key: "actions",
                header: <div className="text-right">Thao tác</div>,
                className: effectiveHotelId ? "w-[20%]" : "w-[22%]",
                headerClassName: effectiveHotelId ? "w-[20%] text-right" : "w-[22%] text-right",
                cell: () => <div className="ml-auto h-10 w-44 animate-pulse rounded-lg bg-slate-100" />,
              },
            ]}
            data={skeletonRows}
            getRowKey={(item) => item.id}
            emptyMessage=""
            minWidth="1100px"
          />
        ) : data ? (
          <DataTable
            columns={[
              {
                key: "user",
                header: "Nhân viên",
                className: effectiveHotelId ? "w-[22%]" : "w-[28%]",
                headerClassName: effectiveHotelId ? "w-[22%]" : "w-[28%]",
                cell: (user) => (
                  <div className="min-w-0 py-1">
                    <p className="font-semibold text-[var(--primary)]">{user.fullName}</p>
                    <p className="mt-1 text-xs text-[var(--on-surface-variant)]">{user.email}</p>
                  </div>
                ),
              },
              {
                key: "roles",
                header: "Vai trò",
                className: effectiveHotelId ? "w-[22%]" : "w-[28%]",
                headerClassName: effectiveHotelId ? "w-[22%]" : "w-[28%]",
                cell: (user) => {
                  const availableRoles = (data.roles ?? []).filter(
                    (role) => !user.roles.some((current) => current.id === role.id),
                  );
                  const isAssigning = activeActionKey === `assign-${user.id}`;
                  return (
                    <div className="flex min-h-10 flex-wrap items-center gap-1.5 py-1">
                      {user.roles.map((role) => (
                        <span
                          key={role.id}
                          className="rounded-full bg-[var(--surface-container)] px-2.5 py-0.5 text-xs font-semibold text-[var(--on-surface)]"
                        >
                          {role.name}
                        </span>
                      ))}
                      {user.roles.length === 0 ? (
                         <span className="text-xs text-[var(--on-surface-variant)]">Chưa có vai trò</span>
                      ) : null}
                      {canManage && availableRoles.length > 0 ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAddRole(user)}
                          title="Gán thêm vai trò"
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--outline-variant)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary)] hover:border-[var(--primary)] hover:bg-slate-50 transition-colors disabled:opacity-40"
                        >
                          {isAssigning ? (
                            <VsIcon name="progress_activity" className="animate-spin text-xs" />
                          ) : (
                            <VsIcon name="add" className="text-xs" />
                          )}
                          <span>Gán thêm</span>
                        </button>
                      ) : null}
                    </div>
                  );
                },
              },
              {
                key: "assignment",
                header: "Phân công",
                className: effectiveHotelId ? "w-[18%]" : "w-[22%]",
                headerClassName: effectiveHotelId ? "w-[18%]" : "w-[22%]",
                cell: (user) => {
                  const assigned = assignedUserIds.has(user.id);
                  const assignedElsewhere = Boolean(user.assignedHotel && !assigned);
                  return (
                    <span className={`inline-flex min-h-8 items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${assigned ? "bg-emerald-100 text-emerald-800" : assignedElsewhere ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                      {assigned
                        ? user.assignedHotel?.name ?? "Đang làm tại khách sạn"
                        : assignedElsewhere
                          ? `Đang ở ${user.assignedHotel?.name}`
                          : "Chưa phân công"}
                    </span>
                  );
                },
              },
              ...(effectiveHotelId
                ? [
                    {
                      key: "room",
                      header: "Phòng phụ trách",
                      className: "w-[18%]",
                      headerClassName: "w-[18%]",
                      cell: (user: HotelStaffUser) => {
                        const isUserFrontDesk = user.roles.some((r) => isFrontDeskRole(r.code ?? r.id));
                        const roomAssignment = userRoomAssignmentMap.get(user.id);
                        const assigned = assignedUserIds.has(user.id);

                        if (!assigned) {
                          return <span className="text-xs text-[var(--outline)]">—</span>;
                        }

                        if (roomAssignment) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                              <VsIcon name="meeting_room" className="text-xs" />
                              Phòng {roomAssignment.roomNumber}
                            </span>
                          );
                        }

                        if (isUserFrontDesk) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-600 px-2 py-0.5 text-xs font-medium">
                              Chung toàn KS
                            </span>
                          );
                        }

                        return <span className="text-xs text-[var(--outline)]">—</span>;
                      },
                    },
                  ]
                : []),
              {
                key: "actions",
                header: <div className="text-right">Thao tác</div>,
                className: effectiveHotelId ? "w-[20%]" : "w-[22%]",
                headerClassName: effectiveHotelId ? "w-[20%] text-right" : "w-[22%] text-right",
                cell: (user) => {
                  if (!canManage) return <div className="text-right text-xs text-[var(--on-surface-variant)]">Chỉ xem</div>;
                  const canResetPassword = (scope.surface === "owner" || scope.surface === "admin") && canResetFrontdeskPassword(user.roles.map((role) => role.code));
                  return (
                    <div className="flex min-h-10 items-center justify-end gap-1.5 flex-nowrap">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditStaff(user)}
                        className="h-9 shrink-0 whitespace-nowrap rounded-lg border border-[var(--outline-variant)] px-2.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--surface-container-low)] disabled:opacity-40 flex items-center gap-1"
                        title="Chỉnh sửa thông tin nhân viên"
                      >
                        <VsIcon name="edit" className="text-sm" />
                        <span>Sửa</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => toggleStaff(user)}
                        className={`h-9 shrink-0 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-40 flex items-center gap-1 transition-colors ${
                          user.userStatus === "DISABLED" || user.tenantStatus === "DISABLED"
                            ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            : "border-red-200 text-red-700 hover:bg-red-50"
                        }`}
                        title={user.userStatus === "DISABLED" || user.tenantStatus === "DISABLED" ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                      >
                        <VsIcon
                          name={user.userStatus === "DISABLED" || user.tenantStatus === "DISABLED" ? "lock_open" : "lock"}
                          className="text-sm"
                        />
                        <span>{user.userStatus === "DISABLED" || user.tenantStatus === "DISABLED" ? "Mở khóa" : "Khóa"}</span>
                      </button>
                      {canResetPassword ? (
                        <button
                          type="button"
                          disabled={isBusy || mutations.resetFrontdeskPassword.isPending}
                          onClick={() => resetFrontdesk(user)}
                          className="h-9 shrink-0 whitespace-nowrap rounded-lg border border-amber-300 bg-amber-50/50 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100/60 disabled:opacity-40 flex items-center gap-1"
                          title="Cấp lại mật khẩu tạm thời cho lễ tân"
                        >
                          <VsIcon name="key" className="text-sm" />
                          <span>Đổi MK</span>
                        </button>
                      ) : null}
                    </div>
                  );
                },
              },
            ]}
            data={displayedUsers}
            getRowKey={(user) => user.id}
            emptyMessage={hasMultipleHotels && effectiveHotelId ? "Không có nhân viên nào đang làm việc tại khách sạn này." : "Không có nhân viên phù hợp."}
            minWidth="1200px"
            pagination={{
              page,
              pageSize,
              totalItems,
              pageSizeOptions: [10, 20, 50, 100],
              serverSide: true,
              onPageChange: (nextPage) => setPage(nextPage),
              onPageSizeChange: (nextSize) => {
                setPageSize(nextSize);
                setPage(1);
              },
            }}
          />
        ) : null}
      </section>

      {/* Mobile view */}
      <section className="space-y-4 md:hidden">
        {directory.isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-[var(--outline-variant)] bg-white p-5 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <div className="space-y-1.5">
                    <div className="h-4 w-36 rounded bg-slate-200" />
                    <div className="h-3 w-48 rounded bg-slate-100" />
                  </div>
                  <div className="h-6 w-24 rounded-full bg-slate-100" />
                </div>
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <div className="h-3 w-28 rounded bg-slate-100" />
                  <div className="h-10 w-full rounded-xl bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : data ? (
          displayedUsers.map((user) => {
            const assigned = assignedUserIds.has(user.id);
            const assignedElsewhere = Boolean(user.assignedHotel && !assigned);
            const availableRoles = data.roles.filter((role) => !user.roles.some((current) => current.id === role.id));
            const isAssigning = activeActionKey === `assign-${user.id}`;
            const canResetPassword = (scope.surface === "owner" || scope.surface === "admin") && canResetFrontdeskPassword(user.roles.map((role) => role.code));
            return (
              <article key={user.id} className="rounded-xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-base text-[var(--primary)]">{user.fullName}</p>
                    <p className="text-xs text-[var(--on-surface-variant)]">{user.email}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${assigned ? "bg-emerald-100 text-emerald-800" : assignedElsewhere ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                    {assigned
                      ? user.assignedHotel?.name ?? "Đang làm việc"
                      : assignedElsewhere
                        ? `Đang ở ${user.assignedHotel?.name}`
                        : "Chưa phân công"}
                  </span>
                </div>

                <div className="border-t border-[var(--outline-variant)] pt-3 text-xs space-y-2">
                  <div>
                    <span className="font-semibold text-[var(--on-surface-variant)]">Vai trò hiện tại: </span>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {user.roles.map((role) => (
                        <span key={role.id} className="rounded-full bg-[var(--surface-container)] px-2.5 py-0.5 text-xs font-semibold">
                          {role.name}
                        </span>
                      ))}
                      {user.roles.length === 0 ? <span className="text-[var(--on-surface-variant)]">Chưa có vai trò</span> : null}
                      {canManage && availableRoles.length > 0 ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAddRole(user)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--outline-variant)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary)] hover:border-[var(--primary)] hover:bg-slate-50 transition-colors disabled:opacity-40"
                        >
                          {isAssigning ? (
                            <VsIcon name="progress_activity" className="animate-spin text-xs" />
                          ) : (
                            <VsIcon name="add" className="text-xs" />
                          )}
                          <span>Gán thêm</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {effectiveHotelId && assigned ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--on-surface-variant)]">Phòng phụ trách: </span>
                      {(() => {
                        const isUserFrontDesk = user.roles.some((r) => isFrontDeskRole(r.code ?? r.id));
                        const roomAssignment = userRoomAssignmentMap.get(user.id);
                        if (roomAssignment) {
                          return (
                            <span className="inline-flex items-center gap-1 font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                              <VsIcon name="meeting_room" className="text-sm" />
                              Phòng {roomAssignment.roomNumber}
                            </span>
                          );
                        }
                        if (isUserFrontDesk) {
                          return (
                            <span className="inline-flex items-center gap-1 font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                              Chung toàn KS
                            </span>
                          );
                        }
                        return <span className="text-[var(--on-surface-variant)]">—</span>;
                      })()}
                    </div>
                  ) : null}

                  {canManage ? (
                    <div className="pt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditStaff(user)}
                        className="flex-1 min-h-9 rounded-lg border border-[var(--outline-variant)] px-3 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--surface-container-low)] disabled:opacity-40 flex items-center justify-center gap-1"
                      >
                        <VsIcon name="edit" className="text-sm" />
                        <span>Sửa</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => toggleStaff(user)}
                        className={`flex-1 min-h-9 rounded-lg border px-3 text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-1 transition-colors ${
                          user.userStatus === "DISABLED" || user.tenantStatus === "DISABLED"
                            ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            : "border-red-200 text-red-700 hover:bg-red-50"
                        }`}
                      >
                        <VsIcon
                          name={user.userStatus === "DISABLED" || user.tenantStatus === "DISABLED" ? "lock_open" : "lock"}
                          className="text-sm"
                        />
                        <span>{user.userStatus === "DISABLED" || user.tenantStatus === "DISABLED" ? "Mở khóa" : "Khóa"}</span>
                      </button>
                      {canResetPassword ? (
                        <button
                          type="button"
                          disabled={isBusy || mutations.resetFrontdeskPassword.isPending}
                          onClick={() => resetFrontdesk(user)}
                          className="w-full min-h-9 rounded-lg border border-amber-300 bg-amber-50/50 text-xs font-semibold text-amber-800 disabled:opacity-40 flex items-center justify-center gap-1"
                        >
                          <VsIcon name="key" className="text-sm" />
                          <span>Cấp lại mật khẩu</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : null}
        {!directory.isLoading && data && displayedUsers.length === 0 ? (
          <div className="rounded-xl border border-[var(--outline-variant)] bg-white p-8 text-center text-sm text-[var(--on-surface-variant)]">
            {hasMultipleHotels && effectiveHotelId ? "Không có nhân viên nào đang làm việc tại khách sạn này." : "Không có nhân viên phù hợp."}
          </div>
        ) : null}

        {/* Mobile Pagination */}
        {!directory.isLoading && totalItems > 0 && totalPages > 1 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--outline-variant)] bg-white p-4 shadow-sm text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-medium text-slate-500">
                Hiển thị <strong className="font-bold text-slate-900">{displayedUsers.length}</strong> / {totalItems} nhân viên
              </span>
              <span className="font-bold text-slate-900">
                Trang {page} / {totalPages}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={page <= 1 || directory.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex-1 min-h-11 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Trang trước"
              >
                <VsIcon name="chevron_left" className="text-lg" />
                <span>Trang trước</span>
              </button>
              <button
                type="button"
                disabled={page >= totalPages || directory.isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex-1 min-h-11 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Trang sau"
              >
                <span>Trang sau</span>
                <VsIcon name="chevron_right" className="text-lg" />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Box / Modal Sửa thông tin nhân viên */}
      {editingUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--outline-variant)] bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--outline-variant)] pb-4">
              <div>
                <h3 className="text-lg font-bold text-[var(--primary)]">Sửa thông tin nhân viên</h3>
                <p className="text-xs text-[var(--on-surface-variant)] mt-0.5">
                  Cập nhật thông tin tài khoản và phòng phụ trách
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <VsIcon name="close" className="text-lg" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--on-surface-variant)] mb-1.5">
                  Họ và tên <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  placeholder="Họ và tên"
                  className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--on-surface-variant)] mb-1.5">
                  Email đăng nhập <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="Email"
                  className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
              </div>

              {effectiveHotelId ? (
                <div>
                  <label className="block text-xs font-bold text-[var(--on-surface-variant)] mb-1.5">
                    Phòng phụ trách
                  </label>
                  <select
                    value={editForm.roomId}
                    onChange={(e) => setEditForm({ ...editForm, roomId: e.target.value })}
                    className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-white px-3 text-sm focus:border-[var(--primary)] focus:outline-none"
                  >
                    <option value="">-- Không gán phòng (Vận hành chung) --</option>
                    {availableRoomsForEdit.map((r) => {
                      const isCurrent = userRoomAssignmentMap.get(editingUser.id)?.roomId === r.id;
                      return (
                        <option key={r.id} value={r.id}>
                          Phòng {r.roomNumber}{r.type ? ` · ${r.type}` : ""}{isCurrent ? " (Đang phụ trách)" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">
                    Chọn phòng riêng để phân công, hoặc để trống nếu nhân viên này phụ trách chung toàn khách sạn.
                  </p>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--outline-variant)]">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingUser(null)}
                  className="min-h-10 rounded-xl border border-[var(--outline-variant)] px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="min-h-10 rounded-xl bg-[var(--primary)] px-5 text-xs font-semibold text-white hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <VsIcon name="progress_activity" className="animate-spin text-sm" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu thay đổi</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <OneTimePasswordDialog temporaryPassword={temporaryPassword} accountLabel={resetAccountLabel} onClose={() => { setTemporaryPassword(null); setResetAccountLabel(""); mutations.resetFrontdeskPassword.reset(); }} />
    </div>
  );
}
