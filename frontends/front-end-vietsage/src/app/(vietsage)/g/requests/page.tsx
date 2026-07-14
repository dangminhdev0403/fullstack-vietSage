"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import Swal from "sweetalert2";

import { VsBottomNav } from "../../_components/vs-bottom-nav";
import { VsIcon } from "../../_components/vs-icon";
import { VsTopBar } from "../../_components/vs-top-bar";
import { GuestCurrentRequest } from "@/features/guest-os/components/requests/guest-current-request";
import { GuestRequestCta } from "@/features/guest-os/components/requests/guest-request-cta";
import { formatGuestMoney, getEstimatedTotal, getRequestTitle, getRequestTotalPrice, matchesRequestSearch, type GuestRequestTabStatus } from "@/features/guest-os/components/requests/guest-request-display";
import { GuestRequestFilters } from "@/features/guest-os/components/requests/guest-request-filters";
import { GuestRequestHero } from "@/features/guest-os/components/requests/guest-request-hero";
import { GuestRequestList } from "@/features/guest-os/components/requests/guest-request-list";
import { GuestRequestEmpty, GuestRequestError, GuestRequestSkeleton } from "@/features/guest-os/components/requests/guest-request-states";
import { GuestReveal } from "@/features/guest-os/components/motion/guest-reveal";
import { GuestAccessRequiredState } from "@/features/guest-os/components/shared/guest-access-required-state";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import type { GuestRequest } from "@/features/guest-os/types/guest-os-contract";
import { getGuestFriendlyErrorMessage } from "@/features/guest-os/utils/guest-os-errors";
import { useGuestRequestRealtime } from "@/features/request-realtime/use-guest-request-realtime";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export default function GuestRequestsPage() {
  const { intlLocale, locale, t } = useGuestI18n();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const room = useGuestStore((state) => state.room);
  const isHydrated = useGuestStoreHydrated();
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [totalRequests, setTotalRequests] = useState(0);
  const [isRequestsLoading, setIsRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<GuestRequestTabStatus>();
  const [requestSearch, setRequestSearch] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestsVersion, setRequestsVersion] = useState(0);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const currentRequestRef = useRef<HTMLDivElement | null>(null);
  const roomLabel = room?.roomNumber ? t("common.roomNumber", { room: room.roomNumber }) : t("home.roomFallback");

  useEffect(() => {
    if (!isHydrated || !sessionToken) return;
    let isCancelled = false;
    void Promise.resolve().then(async () => {
      setIsRequestsLoading(true);
      setRequestsError(null);
      try {
        const backendStatus = selectedStatus === "ENDED" ? undefined : selectedStatus;
        const data = await guestOsService.listRequests(sessionToken, { page: 1, limit: selectedStatus === "ENDED" ? 100 : 20, ...(backendStatus ? { status: backendStatus } : {}) }, locale);
        const items = selectedStatus === "ENDED" ? data.items.filter((request) => request.status === "CANCELLED" || request.status === "FAILED") : data.items;
        if (!isCancelled) { setRequests(items); setTotalRequests(selectedStatus === "ENDED" ? items.length : data.total); }
      } catch (error) {
        if (!isCancelled) setRequestsError(getGuestFriendlyErrorMessage(error, t("requests.loadError"), t));
      } finally {
        if (!isCancelled) setIsRequestsLoading(false);
      }
    });
    return () => { isCancelled = true; };
  }, [isHydrated, locale, requestsVersion, selectedStatus, sessionToken, t]);

  const visibleRequests = useMemo(() => requests.filter((request) => matchesRequestSearch(request, requestSearch, t)), [requestSearch, requests, t]);
  const estimatedVisibleTotal = useMemo(() => getEstimatedTotal(visibleRequests), [visibleRequests]);
  const pricedRequestCount = useMemo(() => visibleRequests.filter((request) => getRequestTotalPrice(request) !== null).length, [visibleRequests]);
  const currentRequest = useMemo(() => visibleRequests.find((request) => request.id === selectedRequestId) ?? visibleRequests.find((request) => request.status === "IN_PROGRESS") ?? visibleRequests.find((request) => request.status === "ACKNOWLEDGED") ?? visibleRequests.find((request) => request.status === "CREATED") ?? null, [selectedRequestId, visibleRequests]);
  const hasActiveFilters = Boolean(selectedStatus || requestSearch.trim());
  const refreshRequests = useCallback(() => setRequestsVersion((version) => version + 1), []);
  const syncRealtimeRequest = useCallback((request: Partial<GuestRequest> & { id: string }) => { setRequests((current) => current.some((item) => item.id === request.id) ? current.map((item) => item.id === request.id ? { ...item, ...request } : item) : current); setSelectedRequestId((currentId) => currentId ?? request.id); }, []);
  const guestRealtimeHandlers = useMemo(() => ({
    onCreated: (request: GuestRequest) => { syncRealtimeRequest(request); refreshRequests(); toast.success(t("requests.updatedNew")); },
    onUpdated: (request: Partial<GuestRequest> & { id: string }) => { syncRealtimeRequest(request); refreshRequests(); toast.info(t("requests.updatedStatus")); },
    onAnswered: (request: Partial<GuestRequest> & { id: string }) => { syncRealtimeRequest(request); refreshRequests(); toast.success(t("requests.updatedAnswer")); },
    onReconnect: refreshRequests,
  }), [refreshRequests, syncRealtimeRequest, t]);
  useGuestRequestRealtime(sessionToken, guestRealtimeHandlers);

  function clearFilters() { setSelectedStatus(undefined); setRequestSearch(""); }
  function selectRequest(requestId: string) { setSelectedRequestId(requestId); window.requestAnimationFrame(() => currentRequestRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  async function cancelGuestRequest(requestToCancel: GuestRequest) {
    if (!sessionToken || !requestToCancel.canCancel) return;
    const confirmation = await Swal.fire({ title: t("requests.cancel"), html: t("requests.cancelConfirm", { title: `<strong>${escapeHtml(getRequestTitle(requestToCancel, t))}</strong>` }), icon: "warning", showCancelButton: true, confirmButtonText: t("requests.cancel"), cancelButtonText: t("common.back"), confirmButtonColor: "#ba1a1a", cancelButtonColor: "#767684" });
    if (!confirmation.isConfirmed) return;
    setIsCancellingRequest(true); setRequestsError(null);
    try {
      const cancelledRequest = await guestOsService.cancelRequest(sessionToken, requestToCancel.id, locale);
      setSelectedRequestId(cancelledRequest.id);
      setRequests((current) => current.map((request) => request.id === cancelledRequest.id ? cancelledRequest : request));
      setSelectedStatus(undefined); setRequestsVersion((version) => version + 1); toast.success(t("requests.cancelledToast"));
    } catch (error) {
      const message = getGuestFriendlyErrorMessage(error, t("requests.cancelError"), t); setRequestsError(message); toast.error(message);
    } finally { setIsCancellingRequest(false); }
  }

  if (!isHydrated) return <div className="min-h-screen bg-[var(--background)]" />;
  if (!sessionToken) return <GuestAccessRequiredState icon={<VsIcon name="qr_code" className="text-3xl" />} />;

  return (
    <div className="vs-page-shell vs-guest-readable vs-safe-bottom vs-guest-comfort-surface min-h-screen overflow-x-clip text-[#18211d]">
      <VsTopBar showLeftControl={false} rightMode="icons" rightLabel={roomLabel} languageBadge={locale} />
      <main className="vs-container pb-36 pt-24">
        <GuestRequestHero roomLabel={roomLabel} title={t("requests.trackTitle")} subtitle={t("requests.trackSubtitle")} />
        <div ref={currentRequestRef}><GuestCurrentRequest request={currentRequest} roomLabel={roomLabel} intlLocale={intlLocale} isLoading={isRequestsLoading} isCancelling={isCancellingRequest} t={t} onCancel={(request) => void cancelGuestRequest(request)} /></div>
        <section aria-labelledby="request-history-title">
          <GuestReveal className="mb-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-bold text-[#765a0e]">{roomLabel}</p><h2 id="request-history-title" className="vs-display text-2xl font-semibold text-[#18211d]">{t("requests.historyTitle")}</h2><p className="mt-1 text-sm leading-6 text-[#5e6a62]">{t("requests.historySubtitle")}</p></div><Link href="/g/services" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25483f] px-5 text-sm font-bold text-white"><VsIcon name="add" className="text-lg" />{t("requests.create")}<VsIcon name="arrow_forward" className="text-sm" /></Link></div></GuestReveal>
          <GuestReveal><GuestRequestFilters selectedStatus={selectedStatus} search={requestSearch} estimatedTotal={formatGuestMoney(estimatedVisibleTotal, "VND", intlLocale, t)} pricedCount={pricedRequestCount} visibleCount={visibleRequests.length} totalRequests={totalRequests} hasActiveFilters={hasActiveFilters} t={t} onStatusChange={setSelectedStatus} onSearchChange={setRequestSearch} onClear={clearFilters} /></GuestReveal>
          {requestsError ? <GuestRequestError message={requestsError} retryLabel={t("common.retry")} onRetry={refreshRequests} /> : isRequestsLoading && requests.length === 0 ? <GuestRequestSkeleton label={t("common.wait")} /> : visibleRequests.length ? <GuestRequestList requests={visibleRequests} selectedRequestId={currentRequest?.id} intlLocale={intlLocale} isCancelling={isCancellingRequest} t={t} onSelect={selectRequest} onCancel={(request) => void cancelGuestRequest(request)} /> : <GuestRequestEmpty t={t} filtered={hasActiveFilters} onClear={clearFilters} />}
        </section>
        <GuestRequestCta t={t} />
      </main>
      <VsBottomNav active="requests" />
    </div>
  );
}
