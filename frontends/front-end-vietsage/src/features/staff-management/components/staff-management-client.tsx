"use client";

import { type FormEvent, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import {
  type StaffManagementScope,
  useStaffDirectoryQuery,
  useStaffManagementMutations,
} from "../queries/use-staff-directory-query";

export type StaffHotelOption = { id: string; code?: string | null; name: string };

type Props = {
  scope: Omit<StaffManagementScope, "hotelId">;
  hotels: StaffHotelOption[];
  canManage: boolean;
  initialHotelId?: string | null;
  onHotelPath?: string;
};

export function StaffManagementClient({ scope, hotels, canManage, initialHotelId = null, onHotelPath }: Props) {
  const [hotelId, setHotelId] = useState(initialHotelId ?? "");
  const activeScope = { ...scope, hotelId: hotelId || null };
  const directory = useStaffDirectoryQuery(activeScope);
  const mutations = useStaffManagementMutations(activeScope);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", roleId: "" });
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});

  const data = directory.data;
  const assignedUserIds = useMemo(
    () => new Set(data?.assignments?.items.map((assignment) => assignment.userId) ?? []),
    [data?.assignments?.items],
  );
  const users = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data?.users.items ?? [];
    return (data?.users.items ?? []).filter((user) =>
      `${user.fullName} ${user.email} ${user.roles.map((role) => role.name).join(" ")}`
        .toLowerCase()
        .includes(needle),
    );
  }, [data?.users.items, query]);

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
            <div className="flex items-center justify-between"><div><p className="text-sm text-[var(--on-surface-variant)]">{metric.label}</p><p className="mt-2 text-3xl font-semibold text-[var(--primary)]">{metric.value}</p></div><VsIcon name={metric.icon} className="text-2xl text-[var(--secondary)]" /></div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,320px)_1fr_auto]">
          <select value={hotelId} onChange={(event) => {
            const value = event.target.value;
            setHotelId(value);
            if (onHotelPath) {
              const nextUrl = new URL(window.location.href);
              nextUrl.pathname = onHotelPath;
              if (value) nextUrl.searchParams.set("hotelId", value);
              else nextUrl.searchParams.delete("hotelId");
              window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}`);
            }
          }} className="min-h-11 rounded-lg border border-[var(--outline-variant)] bg-white px-3 text-sm">
            <option value="">Chọn khách sạn để phân công</option>
            {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.code ? `${hotel.code} · ` : ""}{hotel.name}</option>)}
          </select>
          <div className="relative"><VsIcon name="search" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--outline)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên, email hoặc vai trò..." className="min-h-11 w-full rounded-lg border border-[var(--outline-variant)] bg-white pl-11 pr-4 text-sm" /></div>
          {canManage ? <button type="button" onClick={() => setFormOpen((value) => !value)} className="rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[var(--on-primary)]"><VsIcon name="person_add" className="mr-2 inline text-lg" />Thêm nhân viên</button> : <span className="rounded-xl border border-[var(--outline-variant)] bg-white px-4 py-3 text-center text-sm font-semibold text-[var(--on-surface-variant)]">Chế độ chỉ xem</span>}
        </div>
      </section>

      {canManage && formOpen ? (
        <form onSubmit={submitCreate} className="grid gap-3 rounded-xl border border-[var(--outline-variant)] bg-white p-5 md:grid-cols-2 xl:grid-cols-5">
          <input required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Họ tên" className="min-h-11 rounded-lg border px-3 text-sm" />
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email đăng nhập" className="min-h-11 rounded-lg border px-3 text-sm" />
          <input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mật khẩu ban đầu" className="min-h-11 rounded-lg border px-3 text-sm" />
          <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className="min-h-11 rounded-lg border px-3 text-sm"><option value="">Chọn vai trò</option>{data?.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
          <button disabled={mutations.createUser.isPending} className="rounded-xl bg-[var(--secondary-container)] px-4 text-sm font-semibold">{mutations.createUser.isPending ? "Đang tạo..." : "Tạo tài khoản"}</button>
        </form>
      ) : null}

      {directory.isLoading ? <div className="rounded-xl bg-white p-8 text-center text-sm">Đang tải đúng phạm vi nhân viên...</div> : null}
      {directory.isError ? <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-container)] p-5 text-sm text-[var(--on-error-container)]">{directory.error instanceof Error ? directory.error.message : "Không tải được danh sách nhân viên."}</div> : null}

      {data ? (
        <section className="overflow-hidden rounded-xl border border-[var(--outline-variant)] bg-white">
          <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-[var(--surface-container-low)] text-xs uppercase tracking-[0.08em]"><tr><th className="px-5 py-4">Nhân viên</th><th className="px-5 py-4">Vai trò</th><th className="px-5 py-4">Phân công</th><th className="px-5 py-4">Gán vai trò</th><th className="px-5 py-4 text-right">Thao tác</th></tr></thead>
            <tbody className="divide-y divide-[var(--outline-variant)]">{users.map((user) => {
              const assigned = assignedUserIds.has(user.id);
              const selectedRoleId = roleDrafts[user.id] ?? "";
              return <tr key={user.id} className="align-top"><td className="px-5 py-4"><p className="font-semibold text-[var(--primary)]">{user.fullName}</p><p className="mt-1 text-xs text-[var(--on-surface-variant)]">{user.email}</p></td><td className="px-5 py-4"><div className="flex max-w-[340px] flex-wrap gap-2">{user.roles.map((role) => canManage ? <button disabled={isBusy} title="Thu hồi vai trò" type="button" onClick={() => runMutation(() => mutations.revokeRole.mutateAsync({ userId: user.id, roleId: role.id }), "Đã thu hồi vai trò")} key={role.id} className="rounded-full bg-[var(--surface-container)] px-3 py-1 text-xs font-semibold">{role.name} ×</button> : <span key={role.id} className="rounded-full bg-[var(--surface-container)] px-3 py-1 text-xs font-semibold">{role.name}</span>)}</div></td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${assigned ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{hotelId ? (assigned ? "Đang làm tại khách sạn" : "Chưa phân công") : "Chọn khách sạn"}</span></td><td className="px-5 py-4">{canManage ? <div className="flex gap-2"><select value={selectedRoleId} onChange={(e) => setRoleDrafts((current) => ({ ...current, [user.id]: e.target.value }))} className="min-h-9 rounded-lg border px-2 text-xs"><option value="">Chọn vai trò</option>{data.roles.filter((role) => !user.roles.some((current) => current.id === role.id)).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><button disabled={!selectedRoleId || isBusy} type="button" onClick={() => runMutation(() => mutations.assignRole.mutateAsync({ userId: user.id, roleId: selectedRoleId }), "Đã gán vai trò")} className="rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white disabled:opacity-40">Gán</button></div> : <span className="text-xs text-[var(--on-surface-variant)]">Không có quyền chỉnh sửa</span>}</td><td className="px-5 py-4 text-right">{canManage ? <button disabled={!hotelId || isBusy} type="button" onClick={() => runMutation(() => mutations.updateAssignment.mutateAsync({ userId: user.id, assigned: !assigned }), assigned ? "Đã thu hồi phân công" : "Đã phân công nhân viên")} className="rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-xs font-semibold disabled:opacity-40">{assigned ? "Bỏ khỏi khách sạn" : "Phân công"}</button> : <span className="text-xs text-[var(--on-surface-variant)]">Chỉ xem</span>}</td></tr>;
            })}</tbody></table></div>
          {users.length === 0 ? <p className="p-8 text-center text-sm text-[var(--on-surface-variant)]">Không có nhân viên phù hợp.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
