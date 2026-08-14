"use client";

import Link from "next/link";
import { useGuestLocalPartners } from "../queries/use-guest-local-partners";
import type { GuestLocaleCode } from "@/features/guest-os/types/guest-os-contract";

export function GuestNearbyPreview({ sessionToken, locale }: { sessionToken: string; locale?: GuestLocaleCode }) {
  const { partners } = useGuestLocalPartners(sessionToken, undefined, locale);
  if (partners.isError || (!partners.isPending && !partners.data?.length)) return null;
  return (
    <section aria-labelledby="nearby-preview-title" className="vs-container py-10">
      <div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#8a6a13]">Gần khách sạn</p><h2 id="nearby-preview-title" className="mt-1 text-2xl font-bold text-[#18211d]">Khám phá xung quanh</h2></div><Link href="/g/nearby" className="grid min-h-11 place-items-center rounded-xl border border-[#25483f] px-4 font-semibold text-[#25483f]">Xem tất cả</Link></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{partners.isPending ? [1,2,3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-[#ece8df]" />) : partners.data?.slice(0, 3).map((partner) => <Link key={partner.id} href="/g/nearby" className="rounded-2xl border border-[#d8ded9] bg-white p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25483f]"><h3 className="font-bold text-[#18211d]">{partner.name}</h3><p className="mt-2 line-clamp-2 text-sm text-[#5e6a62]">{partner.address}</p></Link>)}</div>
    </section>
  );
}
