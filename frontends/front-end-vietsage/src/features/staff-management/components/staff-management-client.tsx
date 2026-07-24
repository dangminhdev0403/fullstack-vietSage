"use client";

import { type FormEvent, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { DataTable } from "@/components/ui/data-table";
import {
  type StaffManagementScope,
  useStaffDirectoryQuery,
  useStaffManagementMutations,
} from "../queries/use-staff-directory-query";

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
  const [page, setPage] = useState(1);
  const activeScope = { ...scope, hotelId: hotelId || null };
  const directory = useStaffDirectoryQuery(activeScope, { q: query, page, limit: 20 });
  const mutations = useStaffManagementMutations(activeScope);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", roleId: "" });
  const [formErrors, setFormErrors] = useState<FormFieldErrors>({});
  const [formGeneralError, setFormGeneralError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  const data = directory.data;
  const assignedUserIds = useMemo(
    () => new Set(data?.assignments?.items.map((assignment) => assignment.userId) ?? []),
    [data?.assignments?.items],
  );
  const users = useMemo(() => data?.users.items ?? [], [data?.users.items]);
  const displayedUsers = useMemo(
    () => (hotelId ? users.filter((user) => assignedUserIds.has(user.id)) : users),
    [hotelId, users, assignedUserIds],
  );
  const skeletonRows = useMemo(() => Array.from({ length: 5 }, (_, i) => ({ id: `skel-${i}` })), []);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormErrors({});
    setFormGeneralError(null);

    if (!hotelId) {
      setFormGeneralError("Vui lòng chọn khách sạn trước khi tạo nhân viên.");
      return;
    }
    if (!form.roleId) {
      setFormErrors((prev) => ({ ...prev, roleId: "Chọn vai trò cho nhân viên" }));
      return;
    }
    try {
      await mutations.createUser.mutateAsync({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        roleIds: [form.roleId],
        hotelId,
      });
      setForm({ fullName: "", email: "", password: "", roleId: "" });
      setFormErrors({});
      setFormGeneralError(null);
      setShowPassword(false);
      setFormOpen(false);
      await Swal.fire({ icon: "success", title: "Đã tạo và phân công nhân viên", timer: 1200, showConfirmButton: false });
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
      await Swal.fire({ icon: "success", title: successTitle, timer: 1000, showConfirmButton: false });
    } catch (error) {
      const { message } = extractApiErrorMessage(error);
      await Swal.fire({ icon: "error", title: "Không thể cập nhật", text: message });
    } finally {
      setActiveActionKey(null);
    }
  }

  const isBusy = mutations.createUser.isPending || mutations.assignRole.isPending || mutations.revokeRole.isPending || mutations.updateAssignment.isPending || activeActionKey !== null;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Nhân viên", value: data?.users.total ?? 0, icon: "group" },
          {
            label: hotelId ? "Nhân viên tại khách sạn" : "Chọn khách sạn để xem",
            value: hotelId ? data?.assignments?.total ?? 0 : "--",
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
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,320px)_1fr_auto]">
          <select
            value={hotelId}
            onChange={(event) => {
              const value = event.target.value;
              setHotelId(value);
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
          {canManage ? (
            <button
              type="button"
              disabled={!hotelId || isBusy}
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
      </section>

      {hotelId ? (
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
              <select
                required
                disabled={mutations.createUser.isPending}
                value={form.roleId}
                onChange={(e) => {
                  setForm({ ...form, roleId: e.target.value });
                  if (formErrors.roleId) setFormErrors((prev) => ({ ...prev, roleId: undefined }));
                }}
                className={`min-h-11 w-full rounded-lg border px-3 text-sm transition-colors disabled:bg-slate-50 ${
                  formErrors.roleId
                    ? "border-red-500 focus:border-red-500"
                    : "border-[var(--outline-variant)]"
                }`}
              >
                <option value="">Chọn vai trò</option>
                {data?.roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              {formErrors.roleId ? (
                <span className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1">
                  <VsIcon name="error" className="text-sm shrink-0" />
                  {formErrors.roleId}
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
                "Tạo & phân công"
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
                className: "w-[18%]",
                headerClassName: "w-[18%]",
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
                className: "w-[30%]",
                headerClassName: "w-[30%]",
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
                className: "w-[16%]",
                headerClassName: "w-[16%]",
                cell: () => <div className="h-7 w-28 animate-pulse rounded-full bg-slate-100" />,
              },
              {
                key: "assignRole",
                header: "Gán vai trò",
                className: "w-[24%]",
                headerClassName: "w-[24%]",
                cell: () => <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />,
              },
              {
                key: "actions",
                header: <div className="text-right">Thao tác</div>,
                className: "w-[12%]",
                headerClassName: "w-[12%] text-right",
                cell: () => <div className="ml-auto h-10 w-28 animate-pulse rounded-lg bg-slate-100" />,
              },
            ]}
            data={skeletonRows}
            getRowKey={(item) => item.id}
            emptyMessage=""
            minWidth="980px"
          />
        ) : data ? (
          <DataTable
            columns={[
              {
                key: "user",
                header: "Nhân viên",
                className: "w-[18%]",
                headerClassName: "w-[18%]",
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
                className: "w-[30%]",
                headerClassName: "w-[30%]",
                cell: (user) => (
                  <div className="flex min-h-10 max-w-[360px] flex-wrap items-center gap-2 py-1">
                    {user.roles.map((role) => {
                      const isRevoking = activeActionKey === `revoke-${user.id}-${role.id}`;
                      return canManage ? (
                        <button
                          disabled={isBusy}
                          title="Thu hồi vai trò"
                          type="button"
                          onClick={() =>
                            runMutation(
                              `revoke-${user.id}-${role.id}`,
                              () => mutations.revokeRole.mutateAsync({ userId: user.id, roleId: role.id }),
                              "Đã thu hồi vai trò",
                            )
                          }
                          key={role.id}
                          className="rounded-full bg-[var(--surface-container)] px-3 py-1 text-xs font-semibold hover:bg-red-100 hover:text-red-700 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {isRevoking ? (
                            <>
                              <VsIcon name="progress_activity" className="animate-spin text-xs" />
                              <span>Đang xóa...</span>
                            </>
                          ) : (
                            `${role.name} ×`
                          )}
                        </button>
                      ) : (
                        <span key={role.id} className="rounded-full bg-[var(--surface-container)] px-3 py-1 text-xs font-semibold">
                          {role.name}
                        </span>
                      );
                    })}
                  </div>
                ),
              },
              {
                key: "assignment",
                header: "Phân công",
                className: "w-[16%]",
                headerClassName: "w-[16%]",
                cell: (user) => {
                  const assigned = assignedUserIds.has(user.id);
                  const assignedElsewhere = Boolean(user.assignedHotel && !assigned);
                  return (
                    <span className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${assigned ? "bg-emerald-100 text-emerald-800" : assignedElsewhere ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                      {assigned
                        ? user.assignedHotel?.name ?? "Đang làm tại khách sạn"
                        : assignedElsewhere
                          ? `Đang ở ${user.assignedHotel?.name}`
                          : "Chưa phân công"}
                    </span>
                  );
                },
              },
              {
                key: "assignRole",
                header: "Gán vai trò",
                className: "w-[24%]",
                headerClassName: "w-[24%]",
                cell: (user) => {
                  if (!canManage) return <span className="text-xs text-[var(--on-surface-variant)]">Chỉ xem</span>;
                  const selectedRoleId = roleDrafts[user.id] ?? "";
                  const availableRoles = data.roles.filter((role) => !user.roles.some((current) => current.id === role.id));
                  const isAssigning = activeActionKey === `assign-${user.id}`;
                  return (
                    <div className="flex min-h-10 items-center gap-2">
                      <select
                        disabled={isBusy}
                        value={selectedRoleId}
                        onChange={(e) => setRoleDrafts((current) => ({ ...current, [user.id]: e.target.value }))}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--outline-variant)] bg-white px-3 text-xs disabled:bg-slate-50"
                      >
                        <option value="">Chọn vai trò</option>
                        {availableRoles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                      <button
                        disabled={!selectedRoleId || isBusy}
                        type="button"
                        onClick={() =>
                          runMutation(
                            `assign-${user.id}`,
                            () => mutations.assignRole.mutateAsync({ userId: user.id, roleId: selectedRoleId }),
                            "Đã gán vai trò",
                          )
                        }
                        className="h-10 shrink-0 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-1.5"
                      >
                        {isAssigning ? (
                          <>
                            <VsIcon name="progress_activity" className="animate-spin text-xs" />
                            <span>Đang gán...</span>
                          </>
                        ) : (
                          "Gán"
                        )}
                      </button>
                    </div>
                  );
                },
              },
              {
                key: "actions",
                header: <div className="text-right">Thao tác</div>,
                className: "w-[12%]",
                headerClassName: "w-[12%] text-right",
                cell: (user) => {
                  if (!canManage) return <div className="text-right text-xs text-[var(--on-surface-variant)]">Chỉ xem</div>;
                  const assigned = assignedUserIds.has(user.id);
                  const isTransfer = Boolean(user.assignedHotel && !assigned);
                  const isUpdatingAssignment = activeActionKey === `assignment-${user.id}`;
                  return (
                    <div className="flex min-h-10 items-center justify-end">
                      <button
                        disabled={!hotelId || isBusy}
                        type="button"
                        onClick={() =>
                          runMutation(
                            `assignment-${user.id}`,
                            () => mutations.updateAssignment.mutateAsync({ userId: user.id, assigned: !assigned }),
                            assigned
                              ? "Đã thu hồi phân công"
                              : isTransfer
                                ? "Đã chuyển nhân viên đến khách sạn"
                                : "Đã phân công nhân viên",
                          )
                        }
                        className="h-10 whitespace-nowrap rounded-lg border border-[var(--outline-variant)] px-3 text-xs font-semibold disabled:opacity-40 hover:bg-[var(--surface-container-low)] flex items-center gap-1.5"
                      >
                        {isUpdatingAssignment ? (
                          <>
                            <VsIcon name="progress_activity" className="animate-spin text-xs" />
                            <span>Đang xử lý...</span>
                          </>
                        ) : assigned ? (
                          "Bỏ khỏi khách sạn"
                        ) : isTransfer ? (
                          "Chuyển đến đây"
                        ) : (
                          "Phân công"
                        )}
                      </button>
                    </div>
                  );
                },
              },
            ]}
            data={displayedUsers}
            getRowKey={(user) => user.id}
            emptyMessage={hotelId ? "Không có nhân viên nào đang làm việc tại khách sạn này." : "Không có nhân viên phù hợp."}
            minWidth="980px"
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
            const selectedRoleId = roleDrafts[user.id] ?? "";
            const availableRoles = data.roles.filter((role) => !user.roles.some((current) => current.id === role.id));
            const isAssigning = activeActionKey === `assign-${user.id}`;
            const isUpdatingAssignment = activeActionKey === `assignment-${user.id}`;
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
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {user.roles.map((role) => {
                        const isRevoking = activeActionKey === `revoke-${user.id}-${role.id}`;
                        return (
                          <span key={role.id} className="rounded-full bg-[var(--surface-container)] px-2.5 py-0.5 text-xs font-semibold inline-flex items-center gap-1">
                            {isRevoking ? (
                              <>
                                <VsIcon name="progress_activity" className="animate-spin text-xs" />
                                <span>Đang xóa...</span>
                              </>
                            ) : (
                              role.name
                            )}
                          </span>
                        );
                      })}
                      {user.roles.length === 0 ? <span className="text-[var(--on-surface-variant)]">Chưa có vai trò</span> : null}
                    </div>
                  </div>

                  {canManage ? (
                    <div className="pt-2 space-y-2">
                      <div className="flex gap-2">
                        <select
                          disabled={isBusy}
                          value={selectedRoleId}
                          onChange={(e) => setRoleDrafts((current) => ({ ...current, [user.id]: e.target.value }))}
                          className="min-h-11 flex-1 rounded-lg border border-[var(--outline-variant)] px-3 text-xs disabled:bg-slate-50"
                        >
                          <option value="">Thêm vai trò mới</option>
                          {availableRoles.map((role) => (
                            <option key={role.id} value={role.id}>{role.name}</option>
                          ))}
                        </select>
                        <button
                          disabled={!selectedRoleId || isBusy}
                          type="button"
                          onClick={() =>
                            runMutation(
                              `assign-${user.id}`,
                              () => mutations.assignRole.mutateAsync({ userId: user.id, roleId: selectedRoleId }),
                              "Đã gán vai trò",
                            )
                          }
                          className="min-h-11 rounded-lg bg-[var(--primary)] px-4 text-xs font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-1.5"
                        >
                          {isAssigning ? (
                            <>
                              <VsIcon name="progress_activity" className="animate-spin text-xs" />
                              <span>Đang gán...</span>
                            </>
                          ) : (
                            "Gán"
                          )}
                        </button>
                      </div>

                      <button
                        disabled={!hotelId || isBusy}
                        type="button"
                        onClick={() =>
                          runMutation(
                            `assignment-${user.id}`,
                            () => mutations.updateAssignment.mutateAsync({ userId: user.id, assigned: !assigned }),
                            assigned
                              ? "Đã thu hồi phân công"
                              : assignedElsewhere
                                ? "Đã chuyển nhân viên đến khách sạn"
                                : "Đã phân công nhân viên",
                          )
                        }
                        className="min-h-11 w-full rounded-xl border border-[var(--outline-variant)] text-xs font-semibold disabled:opacity-40 active:bg-[var(--surface-container-low)] flex items-center justify-center gap-1.5"
                      >
                        {isUpdatingAssignment ? (
                          <>
                            <VsIcon name="progress_activity" className="animate-spin text-xs" />
                            <span>Đang xử lý...</span>
                          </>
                        ) : assigned ? (
                          "Thu hồi phân công khỏi khách sạn"
                        ) : assignedElsewhere ? (
                          "Chuyển nhân viên đến khách sạn này"
                        ) : (
                          "Phân công vào khách sạn này"
                        )}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : null}
        {!directory.isLoading && data && displayedUsers.length === 0 ? (
          <div className="rounded-xl border border-[var(--outline-variant)] bg-white p-8 text-center text-sm text-[var(--on-surface-variant)]">
            {hotelId ? "Không có nhân viên nào đang làm việc tại khách sạn này." : "Không có nhân viên phù hợp."}
          </div>
        ) : null}
      </section>
    </div>
  );
}
