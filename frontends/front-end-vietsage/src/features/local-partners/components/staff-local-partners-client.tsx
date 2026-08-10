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
    try {
      await status.mutateAsync({
        partnerId: partner.id,
        status: partner.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
      });
    } catch {
      setError("Không thể cập nhật trạng thái. Vui lòng thử lại.");
    }
  }

  return (
    <section aria-labelledby="partners-title" className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/60">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              DANH BẠ KHÁCH SẠN
            </span>
          </div>
          <h1 id="partners-title" className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Đối tác địa phương
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Các địa điểm ẩm thực, giải trí và dịch vụ lân cận được đề xuất trong Guest OS.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 py-3 font-semibold text-white shadow-md shadow-emerald-900/10 transition-all text-sm cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Thêm đối tác</span>
          </button>
        ) : null}
      </header>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="font-medium text-sm">{error}</p>
        </div>
      ) : null}

      {list.isPending || categories.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-44 animate-pulse rounded-2xl bg-slate-100 border border-slate-200/60" />
          <div className="h-44 animate-pulse rounded-2xl bg-slate-100 border border-slate-200/60" />
        </div>
      ) : list.isError ? (
        <div role="alert" className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-700">
          <p className="font-semibold text-base">Không thể tải danh sách đối tác</p>
          <button
            type="button"
            onClick={() => void list.refetch()}
            className="mt-3 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Thử lại
          </button>
        </div>
      ) : list.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data.map((partner) => (
            <article
              key={partner.id}
              className="group relative rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-lg text-slate-900 group-hover:text-emerald-800 transition-colors">
                        {partner.name}
                      </h2>
                      {partner.isFeatured ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 border border-amber-300/60">
                          <svg className="w-3 h-3 fill-amber-500" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          Nổi bật
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {partner.address}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      partner.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {partner.status === "ACTIVE" ? "Đang hiển thị" : "Tạm ẩn"}
                  </span>
                </div>

                {partner.distanceMeters != null ? (
                  <p className="mt-3 text-xs font-semibold text-emerald-700 bg-emerald-50/60 w-fit px-2.5 py-1 rounded-lg border border-emerald-100">
                    📍 {partner.distanceMeters} m từ khách sạn
                  </p>
                ) : null}
              </div>

              {canManage ? (
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(partner);
                      setFormOpen(true);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 hover:bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>Chỉnh sửa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggle(partner)}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors cursor-pointer"
                  >
                    {partner.status === "ACTIVE" ? "Ẩn" : "Hiển thị"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0V11m0 0h4m-4 0H9" />
          </svg>
          <p className="font-semibold text-base text-slate-700">Chưa có đối tác địa phương</p>
          <p className="text-sm text-slate-500 mt-1">Bấm &ldquo;Thêm đối tác&rdquo; để tạo thông tin đối tác lân cận đầu tiên.</p>
        </div>
      )}

      {formOpen ? (
        <PartnerFormModal
          partner={editing}
          categories={categories.data ?? []}
          onSave={save}
          onClose={() => setFormOpen(false)}
        />
      ) : null}
    </section>
  );
}

