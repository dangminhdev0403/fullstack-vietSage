"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { LocalPartner } from "../types/local-partners-contract";

function safeExternalUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function PartnerDetailModal({ partner, onClose }: { partner: LocalPartner; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const mapUrl = safeExternalUrl(partner.googleMapUrl) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${partner.name} ${partner.address}`)}`;
  const websiteUrl = safeExternalUrl(partner.websiteUrl);
  const zaloUrl = safeExternalUrl(partner.zaloUrl);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article role="dialog" aria-modal="true" aria-labelledby="partner-title" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 text-[#18211d] shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-[#8a6a13]">Địa điểm lân cận</p><h2 id="partner-title" className="mt-1 text-2xl font-bold">{partner.name}</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng chi tiết" className="grid min-h-11 min-w-11 place-items-center rounded-full border border-[#d8ded9] text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25483f]">×</button>
        </div>
        {partner.coverImageUrl ? <Image unoptimized src={partner.coverImageUrl} alt={partner.name} width={800} height={450} className="mt-5 aspect-[16/9] w-full rounded-2xl object-cover" /> : null}
        <p className="mt-5 text-sm leading-6 text-[#5e6a62]">{partner.description || "Khách sạn đề xuất địa điểm này cho kỳ lưu trú của bạn."}</p>
        <dl className="mt-5 space-y-3 text-sm"><div><dt className="font-semibold">Địa chỉ</dt><dd className="mt-1 text-[#5e6a62]">{partner.address}</dd></div>{partner.operatingHours ? <div><dt className="font-semibold">Giờ hoạt động</dt><dd className="mt-1 text-[#5e6a62]">{partner.operatingHours}</dd></div> : null}</dl>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {partner.phone ? <a href={`tel:${partner.phone}`} className="grid min-h-11 place-items-center rounded-xl bg-[#25483f] px-4 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25483f]">Gọi điện</a> : null}
          <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="grid min-h-11 place-items-center rounded-xl border border-[#25483f] px-4 font-semibold text-[#25483f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25483f]">Chỉ đường</a>
          {websiteUrl ? <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="grid min-h-11 place-items-center rounded-xl border border-[#d8ded9] px-4 font-semibold">Website</a> : null}
          {zaloUrl ? <a href={zaloUrl} target="_blank" rel="noopener noreferrer" className="grid min-h-11 place-items-center rounded-xl border border-[#d8ded9] px-4 font-semibold">Zalo</a> : null}
        </div>
        <p className="mt-6 rounded-xl bg-[#f8f4ea] p-3 text-xs leading-5 text-[#5e6a62]">Dịch vụ do bên thứ ba cung cấp. Thanh toán trực tiếp với nhà cung cấp; VietSage không tự ghi khoản này vào Folio.</p>
      </article>
    </div>
  );
}
