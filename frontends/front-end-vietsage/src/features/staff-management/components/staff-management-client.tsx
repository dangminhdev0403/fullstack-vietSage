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

export function StaffManagementClient({ scope, canManage, initialHotelId = null, onHotelPath }: Props) {
  const [hotelId, setHotelId] = useState(initialHotelId ?? "");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const activeScope = { ...scope, hotelId: hotelId || null };
  const directory = useStaffDirectoryQuery(activeScope, { q: query, page, limit: 20 });
  const mutations = useStaffManagementMutations(activeScope);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", roleId: "" });
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});

  const data = directory.data;
  const assignedUserIds = useMemo(
    () => new Set(data?.assignments?.items.map((assignment) => assignment.userId) ?? []),
    [data?.assignments?.items],
  );
  const users = data?.users.items ?? [];

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.roleId) {
      await Swal.fire({ icon: "warning", title: "Chọn vai trò cho nhân viên" });
      return;
    }
    try {
      await mutations.createUser.mutateAsync({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        roleIds: [form.roleId],
      });
      setForm({ fullName: "", email: "", password: "", roleId: "" });
      setFormOpen(false);
      await Swal.fire({ icon: "success", title: "Đã tạo nhân viên", timer: 1200, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể tạo nhân viên", text: error instanceof Error ? error.message : "Vui lòng thử lại." });
    }
  }

  async function runMutation(action: () => Promise<unknown>, successTitle: string) {
    try {
      await action();
      await Swal.fire({ icon: "success", title: successTitle, timer: 1000, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: "error", title: "Không thể cập nhật", text: error instanceof Error ? error.message : "Vui lòng thử lại." });
    }
  }

  const isBusy = mutations.createUser.isPending || mutations.assignRole.isPending || mutations.revokeRole.isPending || mutations.updateAssignment.isPending;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Nhân viên", value: data?.users.total ?? 0, icon: "group" },
          { label: "Đã phân công", value: data?.assignments?.total ?? 0, icon: "domain_add" },
          { label: "Vai trò dùng được", value: data?.roles.length ?? 0, icon: "verified_user" },
        ].map((metric) => (
          <article key={metric.label} className="rounded-xl border border-[var(--outline-variant)] bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--on-surface-variant)]">{metric.label}</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--primary)]">{metric.value}</p>
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
            <VsIcon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--outline)]" />
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
              onClick={() => setFormOpen((value) => !value)}
              className="min-h-11 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)]"
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

      {canManage && formOpen ? (
        <form onSubmit={submitCreate} className="grid gap-3 rounded-xl border border-[var(--outline-variant)] bg-white p-5 md:grid-cols-2 xl:grid-cols-5">
          <input required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Họ tên" className="min-h-11 rounded-lg border px-3 text-sm" />
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email đăng nhập" className="min-h-11 rounded-lg border px-3 text-sm" />
          <input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mật khẩu ban đầu" className="min-h-11 rounded-lg border px-3 text-sm" />
          <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className="min-h-11 rounded-lg border px-3 text-sm">
            <option value="">Chọn vai trò</option>
            {data?.roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <button disabled={mutations.createUser.isPending} className="min-h-11 rounded-xl bg-[var(--secondary-container)] px-4 text-sm font-semibold">
            {mutations.createUser.isPending ? "Đang tạo..." : "Tạo tài khoản"}
          </button>
        </form>
      ) : null}

      {directory.isLoading ? <div className="rounded-xl bg-white p-8 text-center text-sm">Đang tải đúng phạm vi nhân viên...</div> : null}
      {directory.isError ? (
        <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-container)] p-5 text-sm text-[var(--on-error-container)]">
          {directory.error instanceof Error ? directory.error.message : "Không tải được danh sách nhân viên."}
        </div>
      ) : null}

      {data ? (
        <>
          {/* Desktop view */}
          <section className="hidden md:block">
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
                      {user.roles.map((role) =>
                        canManage ? (
                          <button
                            disabled={isBusy}
                            title="Thu hồi vai trò"
                            type="button"
                            onClick={() =>
                              runMutation(
                                () => mutations.revokeRole.mutateAsync({ userId: user.id, roleId: role.id }),
                                "Đã thu hồi vai trò",
                              )
                            }
                            key={role.id}
                            className="rounded-full bg-[var(--surface-container)] px-3 py-1 text-xs font-semibold hover:bg-red-100 hover:text-red-700"
                          >
                            {role.name} ×
                          </button>
                        ) : (
                          <span key={role.id} className="rounded-full bg-[var(--surface-container)] px-3 py-1 text-xs font-semibold">
                            {role.name}
                          </span>
                        ),
                      )}
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
                    return (
                      <span className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${assigned ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                        {hotelId ? (assigned ? "Đang làm tại khách sạn" : "Chưa phân công") : "Chọn khách sạn"}
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
                    return (
                      <div className="flex min-h-10 items-center gap-2">
                        <select
                          value={selectedRoleId}
                          onChange={(e) => setRoleDrafts((current) => ({ ...current, [user.id]: e.target.value }))}
                          className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--outline-variant)] bg-white px-3 text-xs"
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
                              () => mutations.assignRole.mutateAsync({ userId: user.id, roleId: selectedRoleId }),
                              "Đã gán vai trò",
                            )
                          }
                          className="h-10 shrink-0 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          Gán
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
                    return (
                      <div className="flex min-h-10 items-center justify-end">
                        <button
                          disabled={!hotelId || isBusy}
                          type="button"
                          onClick={() =>
                            runMutation(
                              () => mutations.updateAssignment.mutateAsync({ userId: user.id, assigned: !assigned }),
                              assigned ? "Đã thu hồi phân công" : "Đã phân công nhân viên",
                            )
                          }
                          className="h-10 whitespace-nowrap rounded-lg border border-[var(--outline-variant)] px-3 text-xs font-semibold disabled:opacity-40 hover:bg-[var(--surface-container-low)]"
                        >
                          {assigned ? "Bỏ khỏi khách sạn" : "Phân công"}
                        </button>
                      </div>
                    );
                  },
                },
              ]}
              data={users}
              getRowKey={(user) => user.id}
              emptyMessage="Không có nhân viên phù hợp."
              minWidth="980px"
            />
          </section>

          {/* Mobile view */}
          <section className="space-y-4 md:hidden">
            {users.map((user) => {
              const assigned = assignedUserIds.has(user.id);
              const selectedRoleId = roleDrafts[user.id] ?? "";
              const availableRoles = data.roles.filter((role) => !user.roles.some((current) => current.id === role.id));
              return (
                <article key={user.id} className="rounded-xl border border-[var(--outline-variant)] bg-white p-5 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-base text-[var(--primary)]">{user.fullName}</p>
                      <p className="text-xs text-[var(--on-surface-variant)]">{user.email}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${assigned ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {hotelId ? (assigned ? "Đang làm việc" : "Chưa phân công") : "Chưa chọn KS"}
                    </span>
                  </div>

                  <div className="border-t border-[var(--outline-variant)] pt-3 text-xs space-y-2">
                    <div>
                      <span className="font-semibold text-[var(--on-surface-variant)]">Vai trò hiện tại: </span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {user.roles.map((role) => (
                          <span key={role.id} className="rounded-full bg-[var(--surface-container)] px-2.5 py-0.5 text-xs font-semibold">
                            {role.name}
                          </span>
                        ))}
                        {user.roles.length === 0 ? <span className="text-[var(--on-surface-variant)]">Chưa có vai trò</span> : null}
                      </div>
                    </div>

                    {canManage ? (
                      <div className="pt-2 space-y-2">
                        <div className="flex gap-2">
                          <select
                            value={selectedRoleId}
                            onChange={(e) => setRoleDrafts((current) => ({ ...current, [user.id]: e.target.value }))}
                            className="min-h-11 flex-1 rounded-lg border border-[var(--outline-variant)] px-3 text-xs"
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
                                () => mutations.assignRole.mutateAsync({ userId: user.id, roleId: selectedRoleId }),
                                "Đã gán vai trò",
                              )
                            }
                            className="min-h-11 rounded-lg bg-[var(--primary)] px-4 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            Gán
                          </button>
                        </div>

                        <button
                          disabled={!hotelId || isBusy}
                          type="button"
                          onClick={() =>
                            runMutation(
                              () => mutations.updateAssignment.mutateAsync({ userId: user.id, assigned: !assigned }),
                              assigned ? "Đã thu hồi phân công" : "Đã phân công nhân viên",
                            )
                          }
                          className="min-h-11 w-full rounded-xl border border-[var(--outline-variant)] text-xs font-semibold disabled:opacity-40 active:bg-[var(--surface-container-low)]"
                        >
                          {assigned ? "Thu hồi phân công khỏi khách sạn" : "Phân công vào khách sạn này"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {users.length === 0 ? (
              <div className="rounded-xl border border-[var(--outline-variant)] bg-white p-8 text-center text-sm text-[var(--on-surface-variant)]">
                Không có nhân viên phù hợp.
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
