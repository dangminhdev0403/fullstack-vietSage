"use client";

import { useState } from "react";
import { useLocalPartners } from "../queries/use-local-partners";
import type { LocalPartner, LocalPartnerInput } from "../types/local-partners-contract";
import { PartnerFormModal } from "./partner-form-modal";

export function StaffLocalPartnersClient({ hotelId, canManage }: { hotelId: string; canManage: boolean }) {
  const { list, categories, create, update, status } = useLocalPartners(hotelId);
  const [editing, setEditing] = useState<LocalPartner>();
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string>();

  async function save(input: LocalPartnerInput) {
    setError(undefined);
    try {
      if (editing) await update.mutateAsync({ partnerId: editing.id, input });
      else await create.mutateAsync(input);
      setFormOpen(false);
    } catch (cause) {
      setError("Không thể lưu đối tác. Kiểm tra thông tin rồi thử lại.");
      throw cause;
    }
  }

  async function toggle(partner: LocalPartner) {
    if (!confirm(`${partner.status === "ACTIVE" ? "Ẩn" : "Hiển thị"} “${partner.name}”?`)) return;
    setError(undefined);
    try { await status.mutateAsync({ partnerId: partner.id, status: partner.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }); }
    catch { setError("Không thể cập nhật trạng thái. Vui lòng thử lại."); }
  }

  return <section aria-labelledby="partners-title" className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-emerald-700">Danh bạ khách sạn</p><h1 id="partners-title" className="mt-1 text-2xl font-bold">Đối tác địa phương</h1><p className="mt-2 text-sm text-slate-600">Các địa điểm và dịch vụ được giới thiệu trong Guest OS.</p></div>{canManage ? <button type="button" onClick={() => { setEditing(undefined); setFormOpen(true); }} className="min-h-11 rounded-xl bg-emerald-700 px-4 font-semibold text-white">Thêm đối tác</button> : null}</header>
    {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> : null}
    {list.isPending || categories.isPending ? <div className="h-48 animate-pulse rounded-2xl bg-slate-100" /> : list.isError ? <div role="alert" className="rounded-xl border p-5">Không thể tải danh sách.<button type="button" onClick={() => void list.refetch()} className="ml-3 min-h-11 rounded-lg border px-3">Thử lại</button></div> : list.data?.length ? <div className="grid gap-3 md:grid-cols-2">{list.data.map((partner) => <article key={partner.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><div><h2 className="font-bold">{partner.name}</h2><p className="mt-1 text-sm text-slate-600">{partner.address}</p></div><span className={`h-fit rounded-full px-2 py-1 text-xs font-semibold ${partner.status === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{partner.status === "ACTIVE" ? "Đang hiển thị" : "Tạm ẩn"}</span></div>{partner.distanceMeters != null ? <p className="mt-3 text-sm font-semibold text-emerald-700">{partner.distanceMeters} m từ khách sạn</p> : null}{canManage ? <div className="mt-4 flex gap-2"><button type="button" onClick={() => { setEditing(partner); setFormOpen(true); }} className="min-h-11 rounded-lg border px-4 font-semibold">Chỉnh sửa</button><button type="button" onClick={() => void toggle(partner)} className="min-h-11 rounded-lg border px-4 font-semibold">{partner.status === "ACTIVE" ? "Ẩn" : "Hiển thị"}</button></div> : null}</article>)}</div> : <div className="rounded-2xl border bg-white p-8 text-center text-slate-600">Chưa có đối tác địa phương.</div>}
    {formOpen ? <PartnerFormModal partner={editing} categories={categories.data ?? []} onSave={save} onClose={() => setFormOpen(false)} /> : null}
  </section>;
}
