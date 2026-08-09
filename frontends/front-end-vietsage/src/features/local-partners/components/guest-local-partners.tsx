"use client";

import Image from "next/image";
import { useState } from "react";
import { useGuestLocalPartners } from "../queries/use-guest-local-partners";
import type { LocalPartner } from "../types/local-partners-contract";
import { PartnerDetailModal } from "./partner-detail-modal";

function distanceLabel(distance?: number | null) {
  if (distance == null) return null;
  return distance < 1000 ? `${distance} m` : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(distance / 1000)} km`;
}

export function GuestLocalPartners({ sessionToken }: { sessionToken: string }) {
  const [categoryId, setCategoryId] = useState<string>();
  const [selected, setSelected] = useState<LocalPartner>();
  const { categories, partners } = useGuestLocalPartners(sessionToken, categoryId);

  return (
    <section aria-labelledby="nearby-title" className="mx-auto max-w-5xl space-y-6">
      <header><p className="text-sm font-semibold text-[#8a6a13]">Gợi ý từ khách sạn</p><h1 id="nearby-title" className="mt-1 text-3xl font-bold text-[#18211d]">Khám phá xung quanh</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6a62]">Địa điểm ăn uống, thư giãn và dịch vụ được khách sạn tuyển chọn.</p></header>
      {categories.data?.length ? <div role="group" aria-label="Lọc theo danh mục" className="flex gap-2 overflow-x-auto pb-2"><button type="button" aria-pressed={!categoryId} onClick={() => setCategoryId(undefined)} className="min-h-11 shrink-0 rounded-full border px-4 font-semibold">Tất cả</button>{categories.data.map((category) => <button key={category.id} type="button" aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)} className="min-h-11 shrink-0 rounded-full border px-4 font-semibold aria-pressed:bg-[#25483f] aria-pressed:text-white">{category.nameVi}</button>)}</div> : null}
      {partners.isPending ? <div aria-label="Đang tải địa điểm" className="grid gap-4 sm:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl bg-[#ece8df]" />)}</div> : partners.isError ? <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"><p>Không thể tải địa điểm lân cận.</p><button type="button" onClick={() => void partners.refetch()} className="mt-3 min-h-11 rounded-xl border border-red-700 px-4 font-semibold">Thử lại</button></div> : partners.data?.length ? <div className="grid gap-4 sm:grid-cols-2">{partners.data.map((partner) => { const distance = distanceLabel(partner.distanceMeters); return <article key={partner.id} className="overflow-hidden rounded-2xl border border-[#d8ded9] bg-white shadow-sm">{partner.coverImageUrl ? <Image unoptimized src={partner.coverImageUrl} alt={partner.name} width={640} height={360} className="aspect-[16/9] w-full object-cover" /> : <div className="aspect-[16/9] bg-[#e9f0ec]" />}<div className="p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-bold text-[#18211d]">{partner.name}</h2>{distance ? <span className="shrink-0 rounded-full bg-[#e9f0ec] px-2 py-1 text-xs font-semibold text-[#25483f]">{distance}</span> : null}</div><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#5e6a62]">{partner.address}</p><button type="button" onClick={() => setSelected(partner)} className="mt-4 min-h-11 w-full rounded-xl bg-[#25483f] px-4 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25483f]">Xem chi tiết</button></div></article>; })}</div> : <div className="rounded-2xl border border-[#d8ded9] bg-white p-8 text-center text-[#5e6a62]">Khách sạn chưa có gợi ý phù hợp.</div>}
      {selected ? <PartnerDetailModal partner={selected} onClose={() => setSelected(undefined)} /> : null}
    </section>
  );
}
