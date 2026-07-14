import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import type { GuestRequest } from "../../types/guest-os-contract";
import { formatGuestDateTime, getStatusTone } from "../../utils/guest-os-display";
import { formatGuestMoney, getRequestCurrency, getRequestPriorityLabel, getRequestPriorityTone, getRequestStatusLabel, getRequestSummary, getRequestTitle, getRequestTotalPrice, getRequestUnitPrice, type GuestRequestTranslator } from "./guest-request-display";

type Props = { request: GuestRequest; selected: boolean; intlLocale: string; isCancelling: boolean; t: GuestRequestTranslator; onSelect: (id: string) => void; onCancel: (request: GuestRequest) => void };

export function GuestRequestCard({ request, selected, intlLocale, isCancelling, t, onSelect, onCancel }: Props) {
  const currency = getRequestCurrency(request);
  const titleId = `guest-request-${request.id}`;
  return (
    <article aria-labelledby={titleId} className={`vs-comfort-card rounded-[24px] p-5 transition-[border-color,box-shadow] duration-200 ${selected ? "border-[#d7bd61] bg-white ring-1 ring-[#f4d36f]/45" : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3"><div className="grid size-12 shrink-0 place-items-center rounded-full bg-[#eef3ee] text-[#25483f]"><VsIcon name="room_service" className="text-2xl" /></div><span className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${getStatusTone(request.status)}`}>{getRequestStatusLabel(request.status, t)}</span></div>
      <p className="mb-2 max-w-full truncate rounded-lg bg-[#eef3ee] px-2.5 py-1 font-mono text-sm text-[#465149]">ID: {request.id}</p>
      <div className="mb-3 flex flex-wrap gap-2"><span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-black ${getRequestPriorityTone(request)}`}>{getRequestPriorityLabel(request, t)}</span><span className="inline-flex min-h-7 items-center rounded-full border border-[#d7bd61]/55 bg-[#fff9df] px-2.5 text-[11px] font-black text-[#765a0e]">{t("requests.price")}: {formatGuestMoney(getRequestUnitPrice(request), currency, intlLocale, t)}</span><span className="inline-flex min-h-7 items-center rounded-full border border-[#25483f]/14 bg-white px-2.5 text-[11px] font-black text-[#25483f]">{t("requests.quantityShort")}: {request.quantity}</span></div>
      <h3 id={titleId} className="font-bold text-[#18211d]">{getRequestTitle(request, t)}</h3><p className="mt-1 text-base leading-7 text-[#5e6a62]">{getRequestSummary(request, t)}</p>
      <div className="my-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-[#f8fbf8] px-3 py-2"><span className="text-xs font-bold uppercase tracking-[0.08em] text-[#68746c]">{t("requests.subtotal")}</span><span className="text-sm font-black text-[#18211d]">{formatGuestMoney(getRequestTotalPrice(request), currency, intlLocale, t)}</span></div>
      <p className="text-xs text-[#5e6a62]">{formatGuestDateTime(request.createdAt, intlLocale)}</p>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-[#25483f]/10 pt-4"><button type="button" aria-pressed={selected} onClick={() => onSelect(request.id)} className="vs-touch-button inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#25483f] px-4 text-sm font-bold text-white transition-colors duration-200 hover:bg-[#1d3932] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26]"><VsIcon name="visibility" className="text-lg" />{selected ? t("requests.updatedStatus") : t("requests.trackTitle")}</button>{request.canCancel ? <button type="button" onClick={() => onCancel(request)} disabled={isCancelling} className="vs-touch-button inline-flex min-h-11 items-center gap-1.5 rounded-full border border-red-700 bg-white px-4 text-sm font-bold text-red-700 transition-colors duration-200 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"><VsIcon name="close" className="text-lg" />{t("requests.cancel")}</button> : null}</div>
    </article>
  );
}
