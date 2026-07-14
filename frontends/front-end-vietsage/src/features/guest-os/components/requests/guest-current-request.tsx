import Link from "next/link";

import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { GuestRequest } from "../../types/guest-os-contract";
import { formatGuestDateTime, getStatusTone } from "../../utils/guest-os-display";
import { GuestReveal } from "../motion/guest-reveal";
import { formatGuestMoney, getRequestCurrency, getRequestPriorityLabel, getRequestPriorityTone, getRequestStatusLabel, getRequestSummary, getRequestTitle, getRequestTotalPrice, getRequestUnitPrice, type GuestRequestTranslator } from "./guest-request-display";
import { GuestRequestProgress } from "./guest-request-progress";

type Props = { request: GuestRequest | null; roomLabel: string; intlLocale: string; isLoading: boolean; isCancelling: boolean; t: GuestRequestTranslator; onCancel: (request: GuestRequest) => void };

export function GuestCurrentRequest({ request, roomLabel, intlLocale, isLoading, isCancelling, t, onCancel }: Props) {
  return (
    <GuestReveal className="mb-12">
      <section className="vs-comfort-card scroll-mt-24 rounded-[24px] p-5 md:p-8" aria-labelledby="current-request-title">
        {isLoading && !request ? <div className="animate-pulse space-y-5" aria-label={t("common.wait")}><div className="h-5 w-32 rounded-full bg-[#e2e8e3]" /><div className="h-7 w-2/3 rounded bg-[#e2e8e3]" /><div className="h-16 rounded-xl bg-[#eef3ee]" /></div> : request ? (
          <>
            <div className="grid gap-5 lg:grid-cols-[1fr_260px] lg:items-start">
              <div className="min-w-0">
                <span className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${getStatusTone(request.status)}`}>{getRequestStatusLabel(request.status, t)}</span>
                <h2 id="current-request-title" className="vs-display mt-3 text-2xl font-semibold text-[#18211d]">{getRequestTitle(request, t)} - {roomLabel}</h2>
                <p className="mt-2 max-w-full truncate rounded-lg bg-[#eef3ee] px-2.5 py-1 font-mono text-sm text-[#465149]">ID: {request.id}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-black ${getRequestPriorityTone(request)}`}>{getRequestPriorityLabel(request, t)}</span>
                  <span className="inline-flex min-h-8 items-center rounded-full border border-[#d7bd61]/55 bg-[#fff9df] px-3 text-xs font-black text-[#765a0e]">{t("requests.price")}: {formatGuestMoney(getRequestUnitPrice(request), getRequestCurrency(request), intlLocale, t)}</span>
                  <span className="inline-flex min-h-8 items-center rounded-full border border-[#25483f]/14 bg-white px-3 text-xs font-black text-[#25483f]">{t("requests.quantityShort")}: {request.quantity}</span>
                </div>
                <p className="mt-3 text-sm text-[#5e6a62]">{t("requests.createdAt")} {formatGuestDateTime(request.createdAt, intlLocale)}</p>
              </div>
              <aside className="rounded-xl border border-[#d7bd61]/55 bg-[#fff9df] px-5 py-4 text-center"><p className="text-xs font-bold uppercase tracking-[0.1em] text-[#765a0e]">{t("requests.requestSubtotal")}</p><p className="mt-1 text-xl font-black text-[#18211d]">{formatGuestMoney(getRequestTotalPrice(request), getRequestCurrency(request), intlLocale, t)}</p></aside>
            </div>
            <div className="my-6 flex flex-wrap gap-3">
              {request.canCancel ? <button type="button" onClick={() => onCancel(request)} disabled={isCancelling} className="vs-touch-button inline-flex min-h-11 items-center gap-2 rounded-full border border-red-700 bg-white px-5 text-sm font-semibold text-red-700 transition-colors duration-200 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"><VsIcon name="close" className="text-xl" />{isCancelling ? t("requests.cancelling") : t("requests.cancel")}</button> : null}
              <Link href="/g/services" className="vs-touch-button inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25483f] px-6 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#1d3932] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26]"><VsIcon name="phone_in_talk" className="text-xl" />{t("common.contactHotel")}</Link>
            </div>
            <GuestRequestProgress status={request.status} t={t} />
            <div className="mt-6 flex gap-3 rounded-xl border-l-4 border-[#d7bd61] bg-[#fff9df] p-4"><VsIcon name="info" className="text-xl text-[#765a0e]" /><p className="text-base text-[#465149]">{getRequestSummary(request, t)}</p></div>
          </>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><span className="mb-3 inline-block rounded-full bg-[#e7ece8] px-3 py-1 text-sm font-semibold text-[#465149]">{t("requests.noActive")}</span><h2 id="current-request-title" className="vs-display text-2xl font-semibold text-[#18211d]">{t("requests.createNew")}</h2><p className="mt-1 text-base leading-7 text-[#5e6a62]">{t("requests.emptyActiveDescription")}</p></div><Link href="/g/services" className="vs-touch-button inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-[#25483f] px-6 text-sm font-semibold text-white"><VsIcon name="add" className="text-xl" />{t("requests.create")}</Link></div>
        )}
      </section>
    </GuestReveal>
  );
}
