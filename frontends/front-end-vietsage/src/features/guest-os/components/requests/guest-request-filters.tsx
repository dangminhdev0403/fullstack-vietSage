import { VsIcon } from "@/app/(vietsage)/_components/vs-icon";
import { guestRequestTabs, type GuestRequestTabStatus, type GuestRequestTranslator } from "./guest-request-display";

type Props = { selectedStatus: GuestRequestTabStatus; search: string; estimatedTotal: string; pricedCount: number; visibleCount: number; totalRequests: number; hasActiveFilters: boolean; t: GuestRequestTranslator; onStatusChange: (status: GuestRequestTabStatus) => void; onSearchChange: (value: string) => void; onClear: () => void };

export function GuestRequestFilters({ selectedStatus, search, estimatedTotal, pricedCount, visibleCount, totalRequests, hasActiveFilters, t, onStatusChange, onSearchChange, onClear }: Props) {
  return (
    <div className="vs-comfort-card mb-6 rounded-[24px] p-4 md:p-5">
      <div className="rounded-xl border border-[#d7bd61]/50 bg-[#fff9df] px-4 py-3 text-center"><p className="text-xs font-bold uppercase tracking-[0.1em] text-[#765a0e]">{t("requests.estimatedTotal")}</p><p className="mt-1 text-xl font-black text-[#18211d]">{estimatedTotal}</p><p className="mt-1 text-xs font-semibold text-[#765a0e]">{t("requests.pricedCount", { priced: pricedCount, total: visibleCount })}</p></div>
      <label htmlFor="guest-request-search" className="mt-4 block text-sm font-bold text-[#334139]">{t("requests.searchPlaceholder")}</label>
      <div className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-[#25483f]/20 bg-white px-4 focus-within:border-[#25483f] focus-within:ring-2 focus-within:ring-[#25483f]/15"><VsIcon name="search" className="text-xl text-[#5e6a62]" /><input id="guest-request-search" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={t("requests.searchPlaceholder")} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#18211d] outline-none placeholder:text-[#7b857d]" /></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label={t("requests.historyTitle")}>
        {guestRequestTabs.map((tab) => { const active = selectedStatus === tab.value; return <button key={tab.value ?? "all"} type="button" aria-pressed={active} onClick={() => onStatusChange(tab.value)} className={`vs-touch-button min-h-11 min-w-0 rounded-full px-2 text-[13px] font-bold leading-tight transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26] md:px-4 md:text-sm ${active ? "bg-[#25483f] text-white" : "bg-[#eef3ee] text-[#465149] hover:bg-[#e2e9e3]"}`}>{t(tab.labelKey)}</button>; })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs font-semibold text-[#5e6a62]">{t("requests.count", { count: totalRequests })}</span><button type="button" onClick={onClear} disabled={!hasActiveFilters} className="vs-touch-button min-h-11 rounded-full border border-[#25483f]/20 bg-white px-4 text-sm font-bold text-[#25483f] transition-colors duration-200 hover:bg-[#eef3ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26] disabled:cursor-not-allowed disabled:opacity-45">{t("requests.clearFilters")}</button></div>
    </div>
  );
}
