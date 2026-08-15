"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import Swal from "sweetalert2";

import { VsBottomNav } from "../../_components/vs-bottom-nav";
import { VsIcon } from "../../_components/vs-icon";
import { VsTopBar } from "../../_components/vs-top-bar";
import { printMarketplaceVoucherTicket } from "@/features/marketplace/utils/print-voucher";
import { GuestCurrentRequest } from "@/features/guest-os/components/requests/guest-current-request";
import { GuestRequestCta } from "@/features/guest-os/components/requests/guest-request-cta";
import { formatGuestMoney, getEstimatedTotal, getRequestTitle, getRequestTotalPrice, matchesRequestSearch, type GuestRequestTabStatus } from "@/features/guest-os/components/requests/guest-request-display";
import { GuestRequestFilters } from "@/features/guest-os/components/requests/guest-request-filters";
import { GuestRequestHero } from "@/features/guest-os/components/requests/guest-request-hero";
import { GuestRequestList } from "@/features/guest-os/components/requests/guest-request-list";
import { GuestRequestEmpty, GuestRequestError, GuestRequestSkeleton } from "@/features/guest-os/components/requests/guest-request-states";
import { GuestReveal } from "@/features/guest-os/components/motion/guest-reveal";
import { GuestStagger, GuestStaggerItem } from "@/features/guest-os/components/motion/guest-stagger";
import { GuestAccessRequiredState } from "@/features/guest-os/components/shared/guest-access-required-state";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import type { GuestRequest } from "@/features/guest-os/types/guest-os-contract";
import { formatGuestDateTime } from "@/features/guest-os/utils/guest-os-display";
import { getGuestFriendlyErrorMessage } from "@/features/guest-os/utils/guest-os-errors";
import {
  GUEST_REQUEST_REALTIME_BROWSER_EVENT,
  type GuestRequestRealtimeBrowserEvent,
} from "@/features/request-realtime/guest-request-realtime-notifier";
import { guestMarketplaceRepository } from "@/features/marketplace/repositories/guest-marketplace-repository";
import type { MarketplaceOrder } from "@/features/marketplace/types/marketplace-contract";
import { GuestMarketplaceOrderDetail } from "@/features/marketplace/components/guest-marketplace-order-detail";
import { getCanonicalOrderItems } from "@/features/marketplace/utils/marketplace-unit";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

type RequestSourceTab = "ALL" | "HOTEL" | "EXTERNAL";

function getExternalOrderStatusBadge(status: string, t: (key: string) => string): { label: string; className: string } {
  switch (status) {
    case "PENDING":
      return { label: t("requests.statusPending"), className: "bg-[#fff3db] text-[#925f0e] border-[#f3d6a2]" };
    case "CONFIRMED":
    case "ACCEPTED":
      return { label: t("requests.statusConfirmed"), className: "bg-[#e0f2fe] text-[#0369a1] border-[#bae6fd]" };
    case "COMPLETED":
      return { label: t("requests.completed"), className: "bg-[#e7f4eb] text-[#16562c] border-[#bde2c7]" };
    case "CANCELLED":
    case "REJECTED":
      return { label: t("requests.cancelled"), className: "bg-[#ffe4e6] text-[#9f1239] border-[#fecdd3]" };
    default:
      return { label: status, className: "bg-[#f2efe9] text-[#46534b] border-[#e5ddcd]" };
  }
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

  // External marketplace orders state
  const [externalOrders, setExternalOrders] = useState<MarketplaceOrder[]>([]);
  const [isExternalLoading, setIsExternalLoading] = useState(false);
  const [externalOrdersVersion, setExternalOrdersVersion] = useState(0);
  const [sourceTab, setSourceTab] = useState<RequestSourceTab>("ALL");
  const [selectedExternalOrder, setSelectedExternalOrder] = useState<MarketplaceOrder | null>(null);

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

  // Fetch external marketplace orders
  useEffect(() => {
    if (!isHydrated || !sessionToken) return;
    let isCancelled = false;
    void Promise.resolve().then(async () => {
      setIsExternalLoading(true);
      try {
        const orders = await guestMarketplaceRepository.orders(sessionToken, locale);
        if (!isCancelled) setExternalOrders(orders);
      } catch {
        if (!isCancelled) setExternalOrders([]);
      } finally {
        if (!isCancelled) setIsExternalLoading(false);
      }
    });
    return () => { isCancelled = true; };
  }, [externalOrdersVersion, isHydrated, locale, sessionToken]);

  const visibleRequests = useMemo(() => requests.filter((request) => matchesRequestSearch(request, requestSearch, t)), [requestSearch, requests, t]);
  const estimatedVisibleTotal = useMemo(() => getEstimatedTotal(visibleRequests), [visibleRequests]);
  const pricedRequestCount = useMemo(() => visibleRequests.filter((request) => getRequestTotalPrice(request) !== null).length, [visibleRequests]);
  const currentRequest = useMemo(() => visibleRequests.find((request) => request.id === selectedRequestId) ?? visibleRequests.find((request) => request.status === "IN_PROGRESS") ?? visibleRequests.find((request) => request.status === "ACKNOWLEDGED") ?? visibleRequests.find((request) => request.status === "CREATED") ?? null, [selectedRequestId, visibleRequests]);
  const hasActiveFilters = Boolean(selectedStatus || requestSearch.trim());
  const refreshRequests = useCallback(() => { setRequestsVersion((version) => version + 1); setExternalOrdersVersion((version) => version + 1); }, []);
  const syncRealtimeRequest = useCallback((request: Partial<GuestRequest> & { id: string }) => { setRequests((current) => current.some((item) => item.id === request.id) ? current.map((item) => item.id === request.id ? { ...item, ...request } : item) : current); setSelectedRequestId((currentId) => currentId ?? request.id); }, []);
  useEffect(() => {
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<GuestRequestRealtimeBrowserEvent>).detail;
      if (detail.request) syncRealtimeRequest(detail.request);
      refreshRequests();
    };
    window.addEventListener(GUEST_REQUEST_REALTIME_BROWSER_EVENT, onRealtime);
    return () => window.removeEventListener(GUEST_REQUEST_REALTIME_BROWSER_EVENT, onRealtime);
  }, [refreshRequests, syncRealtimeRequest]);

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

  const showHotelRequests = sourceTab === "ALL" || sourceTab === "HOTEL";
  const showExternalOrders = sourceTab === "ALL" || sourceTab === "EXTERNAL";

  return (
    <div className="vs-page-shell vs-guest-readable vs-safe-bottom vs-guest-comfort-surface min-h-screen overflow-x-clip text-[#18211d]">
      <VsTopBar showLeftControl={false} rightMode="icons" rightLabel={roomLabel} languageBadge={locale} />
      <main className="vs-container pb-36 pt-24">
        <GuestRequestHero roomLabel={roomLabel} title={t("requests.trackTitle")} subtitle={t("requests.trackSubtitle")} />
        <div ref={currentRequestRef}><GuestCurrentRequest request={currentRequest} roomLabel={roomLabel} intlLocale={intlLocale} isLoading={isRequestsLoading} isCancelling={isCancellingRequest} t={t} onCancel={(request) => void cancelGuestRequest(request)} /></div>

        {/* Source Tab Switcher */}
        <GuestReveal className="mb-5">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { value: "ALL" as const, label: t("requests.sourceAll"), icon: "list" },
                { value: "HOTEL" as const, label: t("requests.sourceHotel"), icon: "room_service" },
                { value: "EXTERNAL" as const, label: t("requests.sourceExternal"), icon: "storefront" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={sourceTab === tab.value}
                onClick={() => setSourceTab(tab.value)}
                className={`vs-touch-button inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition-colors duration-200 ${
                  sourceTab === tab.value
                    ? "bg-[#25483f] text-white"
                    : "bg-[#eef3ee] text-[#465149] hover:bg-[#e2e9e3]"
                }`}
              >
                <VsIcon name={tab.icon} className="text-base" />
                <span>{tab.label}</span>
                {tab.value === "EXTERNAL" && externalOrders.length > 0 ? (
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-black ${sourceTab === tab.value ? "bg-white/20 text-white" : "bg-amber-100 text-amber-900"}`}>
                    {externalOrders.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </GuestReveal>

        {/* Hotel Service Requests Section */}
        {showHotelRequests ? (
          <section aria-labelledby="request-history-title">
            <GuestReveal className="mb-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-bold text-[#765a0e]">{roomLabel}</p><h2 id="request-history-title" className="vs-display text-2xl font-semibold text-[#18211d]">{t("requests.historyTitle")}</h2><p className="mt-1 text-sm leading-6 text-[#5e6a62]">{t("requests.historySubtitle")}</p></div><Link href="/g/services" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25483f] px-5 text-sm font-bold text-white"><VsIcon name="add" className="text-lg" />{t("requests.create")}<VsIcon name="arrow_forward" className="text-sm" /></Link></div></GuestReveal>
            <GuestReveal><GuestRequestFilters selectedStatus={selectedStatus} search={requestSearch} estimatedTotal={formatGuestMoney(estimatedVisibleTotal, "VND", intlLocale, t)} pricedCount={pricedRequestCount} visibleCount={visibleRequests.length} totalRequests={totalRequests} hasActiveFilters={hasActiveFilters} t={t} onStatusChange={setSelectedStatus} onSearchChange={setRequestSearch} onClear={clearFilters} /></GuestReveal>
            {requestsError ? <GuestRequestError message={requestsError} retryLabel={t("common.retry")} onRetry={refreshRequests} /> : isRequestsLoading && requests.length === 0 ? <GuestRequestSkeleton label={t("common.wait")} /> : visibleRequests.length ? <GuestRequestList requests={visibleRequests} selectedRequestId={currentRequest?.id} intlLocale={intlLocale} isCancelling={isCancellingRequest} t={t} onSelect={selectRequest} onCancel={(request) => void cancelGuestRequest(request)} /> : <GuestRequestEmpty t={t} filtered={hasActiveFilters} onClear={clearFilters} />}
          </section>
        ) : null}

        {/* External Service Orders Section */}
        {showExternalOrders ? (
          <section aria-labelledby="external-orders-title" className="mt-8">
            <GuestReveal className="mb-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900">{t("requests.sourceExternal")}</span>
                  </div>
                  <h2 id="external-orders-title" className="vs-display mt-1 text-2xl font-semibold text-[#18211d]">{t("requests.sourceExternal")}</h2>
                  <p className="mt-1 text-sm leading-6 text-[#5e6a62]">{t("requests.historySubtitle")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExternalOrdersVersion((v) => v + 1)}
                  className="vs-touch-button inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#25483f]/20 bg-white px-5 text-sm font-bold text-[#25483f] hover:bg-[#eef3ee]"
                >
                  <VsIcon name="refresh" className="text-lg" />
                  {t("common.retry")}
                </button>
              </div>
            </GuestReveal>

            {isExternalLoading && externalOrders.length === 0 ? (
              <GuestRequestSkeleton label={t("common.wait")} />
            ) : externalOrders.length > 0 ? (
              <GuestStagger className="grid gap-5 md:grid-cols-2">
                {externalOrders.map((order) => {
                  const statusBadge = getExternalOrderStatusBadge(order.status, t);
                  const providerName = order.serviceTenant?.serviceProfile?.displayName ?? "Đối tác dịch vụ";
                  const totalAmount = typeof order.totalAmount === "number" ? order.totalAmount : Number(order.totalAmount);
                  return (
                    <GuestStaggerItem key={order.id}>
                      <article
                        onClick={() => setSelectedExternalOrder(order)}
                        className="vs-comfort-card rounded-3xl p-5 transition-shadow duration-200 hover:shadow-md cursor-pointer"
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="grid size-12 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-800">
                            <VsIcon name="storefront" className="text-2xl" />
                          </div>
                          <span className={`inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${statusBadge.className}`}>
                            {statusBadge.label}
                          </span>
                        </div>

                        <div className="mb-2 flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-900">Dịch vụ bên ngoài</span>
                          <span className="truncate rounded-lg bg-[#eef3ee] px-2.5 py-1 font-mono text-xs text-[#465149]">{order.orderNumber}</span>
                        </div>

                        <h3 className="font-bold text-[#18211d]">{order.serviceNameSnapshot}</h3>
                        <p className="mt-1 text-sm text-[#5e6a62]">{providerName}</p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="inline-flex min-h-7 items-center rounded-full border border-[#d7bd61]/55 bg-[#fff9df] px-2.5 text-[11px] font-black text-[#765a0e]">
                            Tổng: {Number.isFinite(totalAmount) ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: order.currency || "VND", maximumFractionDigits: 0 }).format(totalAmount) : "-"}
                          </span>
                          <span className="inline-flex min-h-7 items-center rounded-full border border-[#25483f]/14 bg-white px-2.5 text-[11px] font-black text-[#25483f]">
                            SL: {order.quantity}
                          </span>
                          {order.unitSnapshot ? (
                            <span className="inline-flex min-h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-bold text-slate-600">
                              {order.unitSnapshot}
                            </span>
                          ) : null}
                        </div>

                        {order.guestNote ? (
                          <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs italic text-[#5e6a62]">
                            &quot;{order.guestNote}&quot;
                          </p>
                        ) : null}

                        {order.voucher?.voucherNumber || order.hotelCoordinationStatus === "VOUCHER_ISSUED" ? (
                          <div className="mt-3.5 flex items-center justify-between rounded-2xl border border-emerald-300 bg-emerald-50/90 p-3.5 shadow-2xs">
                            <div className="flex items-center gap-2.5">
                              <div className="grid size-9 place-items-center rounded-xl bg-emerald-700 text-white font-bold">
                                <VsIcon name="confirmation_number" className="text-xl" />
                              </div>
                              <div>
                                <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
                                  Mã phiếu dịch vụ
                                </div>
                                <div className="font-mono text-sm font-black text-emerald-950 tracking-wider">
                                  {order.voucher?.voucherNumber ?? "ĐÃ PHÁT HÀNH"}
                                </div>
                              </div>
                            </div>
                            {order.voucher?.voucherNumber ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  printMarketplaceVoucherTicket({
                                    voucherCode: order.voucher!.voucherNumber!,

                                    guestDisplayName: order.stay?.guestDisplayName ?? "Khách lưu trú",
                                    roomNumber: order.stay?.room?.roomNumber ?? "-",
                                    providerDisplayName: providerName,
                                    orderNumber: order.orderNumber,
                                    serviceName: order.serviceNameSnapshot,
                                    quantity: order.quantity,
                                    totalAmount: totalAmount,
                                    currency: order.currency || "VND",
                                    guestNote: order.guestNote,
                                    items: getCanonicalOrderItems(order).map(({ serviceName, quantity, unitPrice }) => ({ serviceName, quantity, unitPrice })),
                                  });
                                }}
                                className="vs-touch-button inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 active:scale-[0.97]"
                              >
                                <VsIcon name="print" className="text-sm" />
                                <span>In phiếu</span>
                              </button>
                            ) : null}
                          </div>
                        ) : order.hotelCoordinationStatus === "ACKNOWLEDGED" ? (
                          <div className="mt-3.5 flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50/80 px-3.5 py-2.5 text-xs font-bold text-blue-800">
                            <VsIcon name="check_circle" className="text-base text-blue-600" />
                            <span>Khách sạn đã tiếp nhận & đang tạo mã phiếu...</span>
                          </div>
                        ) : null}

                        <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-[#f8fbf8] px-3 py-2">
                          <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#68746c]">Ngày đặt</span>
                          <span className="text-xs font-semibold text-[#18211d]">{formatGuestDateTime(order.createdAt, intlLocale)}</span>
                        </div>
                      </article>
                    </GuestStaggerItem>
                  );
                })}
              </GuestStagger>
            ) : (
              <div className="rounded-3xl border-2 border-dashed border-amber-200 bg-amber-50/30 px-6 py-12 text-center">
                <VsIcon name="storefront" className="mx-auto mb-3 text-4xl text-amber-300" />
                <p className="text-sm font-bold text-[#465149]">Chưa có đơn dịch vụ bên ngoài</p>
                <p className="mt-1 text-xs text-[#5e6a62]">Khi bạn đặt dịch vụ từ đối tác liên kết, đơn sẽ xuất hiện tại đây.</p>
              </div>
            )}
          </section>
        ) : null}

        <GuestRequestCta t={t} />
      </main>

      {/* External Marketplace Order Detail Modal */}
      {selectedExternalOrder && sessionToken ? (
        <GuestMarketplaceOrderDetail
          order={selectedExternalOrder}
          sessionToken={sessionToken}
          isOpen={Boolean(selectedExternalOrder)}
          onClose={() => setSelectedExternalOrder(null)}
        />
      ) : null}

      <VsBottomNav active="requests" />
    </div>
  );
}
