"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import Swal from "sweetalert2";

import { VsBottomNav } from "../../_components/vs-bottom-nav";
import { VsIcon } from "../../_components/vs-icon";
import { VsTopBar } from "../../_components/vs-top-bar";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import {
  useGuestStore,
  useGuestStoreHydrated,
} from "@/features/guest-os/store/guest-store";
import type {
  GuestPortalRequestStatus,
  GuestRequest,
} from "@/features/guest-os/types/guest-os-contract";
import {
  formatGuestDateTime,
  getStatusTone,
  requestStatusLabelMap,
} from "@/features/guest-os/utils/guest-os-display";
import { getGuestFriendlyErrorMessage } from "@/features/guest-os/utils/guest-os-errors";
import { useGuestRequestRealtime } from "@/features/request-realtime/use-guest-request-realtime";

const ctaImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAGBMSO-a1xVKKVGwWL1wndXrL9M51astXi4B1XTMXUtyAPE-HliGyYNnHVbrMijuuVbbKy2JzbV5sTKBr_njJLoVzf0MZftVNADJGcgmTs-BevHDHa7ilb0QTvJOGVawHgJ80IA940gx_ArLNcYHJQgl_udv8W3vEO_yS5W8-kM8KZiVY8khwQsZvkitkVGGtAOyr4YWyrQwjBbjtypwqV1BlD1s_i-S-z526m_vh61NaIKy6TegjZoZ0CyIYkIk65cHw9gujeT3U";
type GuestTranslator = ReturnType<typeof useGuestI18n>["t"];


type GuestRequestTabStatus = GuestPortalRequestStatus | "ENDED" | undefined;

const requestTabs: Array<{
  value: GuestRequestTabStatus;
  labelKey: string;
}> = [
  { value: undefined, labelKey: "requests.all" },
  { value: "CREATED", labelKey: "requests.sent" },
  { value: "ACKNOWLEDGED", labelKey: "requests.acknowledged" },
  { value: "IN_PROGRESS", labelKey: "requests.inProgress" },
  { value: "COMPLETED", labelKey: "requests.done" },
  { value: "ENDED", labelKey: "requests.ended" },
];

function getRequestTitle(request: GuestRequest, t: GuestTranslator): string {
  return request.displayName?.trim() || t("requests.serviceRequest");
}

function getRequestSummary(request: GuestRequest, t: GuestTranslator): string {
  return request.answer?.trim() || request.description?.trim() || t("requests.quantity", { quantity: request.quantity });
}

function getRequestId(request: GuestRequest): string {
  return request.id;
}

function getRequestPriorityLabel(request: GuestRequest, t: GuestTranslator): string {
  return request.priority === "URGENT" ? t("requests.urgent") : t("requests.normal");
}

function getRequestPriorityTone(request: GuestRequest): string {
  return request.priority === "URGENT"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function getRequestStatusLabel(status: GuestPortalRequestStatus, t: GuestTranslator): string {
  if (status === "CREATED") return t("requests.sent");
  if (status === "ACKNOWLEDGED") return t("requests.acknowledged");
  if (status === "IN_PROGRESS") return t("requests.inProgress");
  if (status === "COMPLETED") return t("requests.completed");
  if (status === "CANCELLED") return t("requests.cancelled");
  if (status === "FAILED") return t("requests.failed");
  return requestStatusLabelMap[status];
}

function getRequestCurrency(request: GuestRequest): string {
  return request.currency || "VND";
}

function readMoneyValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function getRequestUnitPrice(request: GuestRequest): number | null {
  return readMoneyValue(request.unitPrice ?? request.price);
}

function getRequestTotalPrice(request: GuestRequest): number | null {
  const explicitTotal = readMoneyValue(
    request.estimatedTotalAmount ??
      request.estimatedTotalPrice ??
      request.totalAmount ??
      request.totalPrice,
  );
  if (explicitTotal !== null) return explicitTotal;

  const unitPrice = getRequestUnitPrice(request);
  if (unitPrice === null) return null;

  return unitPrice * Math.max(request.quantity || 1, 1);
}

function getEstimatedTotal(requests: GuestRequest[]): number | null {
  const totals = requests
    .map((request) => getRequestTotalPrice(request))
    .filter((value): value is number => value !== null);

  if (!totals.length) return null;

  return totals.reduce((sum, value) => sum + value, 0);
}

function formatGuestMoney(value: number | null, currency: string, intlLocale: string, t: GuestTranslator): string {
  if (value === null) return t("requests.noPrice");
  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function matchesRequestSearch(request: GuestRequest, query: string, t: GuestTranslator): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    getRequestTitle(request, t),
    getRequestSummary(request, t),
    getRequestId(request),
    getRequestStatusLabel(request.status, t),
    getRequestPriorityLabel(request, t),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&#39;";
      case '"':
        return "&quot;";
      default:
        return character;
    }
  });
}

function getProgressStep(status: GuestPortalRequestStatus): 1 | 2 | 3 {
  if (status === "COMPLETED") return 3;
  if (status === "FAILED" || status === "CANCELLED") return 2;
  if (status === "ACKNOWLEDGED" || status === "IN_PROGRESS") return 2;
  return 1;
}

function getMiddleProgressLabel(status: GuestPortalRequestStatus, t: GuestTranslator): string {
  if (status === "COMPLETED") return t("requests.processed");
  if (status === "ACKNOWLEDGED") return t("requests.acknowledged");
  if (status === "IN_PROGRESS") return t("requests.inProgress");
  if (status === "FAILED") return t("requests.failed");
  if (status === "CANCELLED") return t("requests.cancelled");
  return t("requests.inProgress");
}

function getMiddleProgressIcon(status: GuestPortalRequestStatus): string {
  if (status === "COMPLETED") return "check";
  if (status === "FAILED") return "error";
  if (status === "CANCELLED") return "close";
  if (status === "ACKNOWLEDGED") return "task_alt";
  return "room_service";
}

function GuestAccessRequiredState() {
  const { t } = useGuestI18n();

  return (
    <div className="vs-page-shell vs-guest-readable min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <VsTopBar
        showRightInfo={false}
        showLeftControl={false}
        brandSize="large"
        rightMode="none"
      />
      <main className="vs-container flex min-h-screen items-center justify-center px-6 py-24">
        <section className="w-full max-w-xl rounded-2xl border border-[var(--outline-variant)] bg-white p-8 text-center shadow-[0_18px_55px_rgba(0,0,60,0.12)]">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--on-primary)]">
            <VsIcon name="qr_code" className="text-2xl" />
          </div>
          <h1 className="vs-display text-3xl font-semibold text-[var(--primary)]">
            {t("common.scanQrTitle")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--on-surface-variant)]">
            {t("common.scanQrMessage")}
          </p>
        </section>
      </main>
    </div>
  );
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
  const roomLabel = room?.roomNumber ? t("common.roomNumber", { room: room.roomNumber }) : t("home.roomFallback");
  const currentRequestRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isHydrated || !sessionToken) {
      return;
    }

    let isCancelled = false;

    void Promise.resolve().then(async () => {
      setIsRequestsLoading(true);
      setRequestsError(null);

      try {
        const backendStatus = selectedStatus === "ENDED" ? undefined : selectedStatus;
        const data = await guestOsService.listRequests(sessionToken, {
          page: 1,
          limit: selectedStatus === "ENDED" ? 100 : 20,
          ...(backendStatus ? { status: backendStatus } : {}),
        }, locale);
        const items = selectedStatus === "ENDED"
          ? data.items.filter((request) => request.status === "CANCELLED" || request.status === "FAILED")
          : data.items;

        if (!isCancelled) {
          setRequests(items);
          setTotalRequests(selectedStatus === "ENDED" ? items.length : data.total);
        }
      } catch (error) {
        if (!isCancelled) {
          setRequestsError(getGuestFriendlyErrorMessage(error, t("requests.loadError"), t));
        }
      } finally {
        if (!isCancelled) {
          setIsRequestsLoading(false);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isHydrated, locale, requestsVersion, selectedStatus, sessionToken, t]);

  const visibleRequests = useMemo(
    () => requests.filter((request) => matchesRequestSearch(request, requestSearch, t)),
    [requestSearch, requests, t],
  );
  const estimatedVisibleTotal = useMemo(() => getEstimatedTotal(visibleRequests), [visibleRequests]);
  const pricedRequestCount = useMemo(
    () => visibleRequests.filter((request) => getRequestTotalPrice(request) !== null).length,
    [visibleRequests],
  );

  const currentRequest = useMemo(
    () =>
      visibleRequests.find((request) => request.id === selectedRequestId) ??
      visibleRequests.find((request) => request.status === "IN_PROGRESS") ??
      visibleRequests.find((request) => request.status === "ACKNOWLEDGED") ??
      visibleRequests.find((request) => request.status === "CREATED") ??
      null,
    [selectedRequestId, visibleRequests],
  );
  const progressStep = currentRequest ? getProgressStep(currentRequest.status) : 1;
  const hasActiveFilters = Boolean(selectedStatus || requestSearch.trim());

  const refreshRequests = useCallback(() => {
    setRequestsVersion((version) => version + 1);
  }, []);

  const syncRealtimeRequest = useCallback((request: Partial<GuestRequest> & { id: string }) => {
    setRequests((currentRequests) => {
      const existing = currentRequests.find((item) => item.id === request.id);
      if (!existing) {
        return currentRequests;
      }

      return currentRequests.map((item) => (item.id === request.id ? { ...item, ...request } : item));
    });
    setSelectedRequestId((currentId) => currentId ?? request.id);
  }, []);

  const guestRealtimeHandlers = useMemo(
    () => ({
      onCreated: (request: GuestRequest) => {
        syncRealtimeRequest(request);
        refreshRequests();
        toast.success(t("requests.updatedNew"));
      },
      onUpdated: (request: Partial<GuestRequest> & { id: string }) => {
        syncRealtimeRequest(request);
        refreshRequests();
        toast.info(t("requests.updatedStatus"));
      },
      onAnswered: (request: Partial<GuestRequest> & { id: string }) => {
        syncRealtimeRequest(request);
        refreshRequests();
        toast.success(t("requests.updatedAnswer"));
      },
      onReconnect: refreshRequests,
    }),
    [refreshRequests, syncRealtimeRequest, t],
  );

  useGuestRequestRealtime(sessionToken, guestRealtimeHandlers);

  function clearFilters() {
    setSelectedStatus(undefined);
    setRequestSearch("");
  }

  function selectRequest(requestId: string) {
    setSelectedRequestId(requestId);
    window.requestAnimationFrame(() => {
      currentRequestRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function cancelGuestRequest(requestToCancel: GuestRequest) {
    if (!sessionToken || !requestToCancel.canCancel) {
      return;
    }

    const confirmation = await Swal.fire({
      title: t("requests.cancel"),
      html: t("requests.cancelConfirm", { title: `<strong>${escapeHtml(getRequestTitle(requestToCancel, t))}</strong>` }),
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: t("requests.cancel"),
      cancelButtonText: t("common.back"),
      confirmButtonColor: "#ba1a1a",
      cancelButtonColor: "#767684",
    });

    if (!confirmation.isConfirmed) {
      return;
    }

    setIsCancellingRequest(true);
    setRequestsError(null);

    try {
      const cancelledRequest = await guestOsService.cancelRequest(sessionToken, requestToCancel.id, locale);
      setSelectedRequestId(cancelledRequest.id);
      setRequests((currentRequests) =>
        currentRequests.map((request) =>
          request.id === cancelledRequest.id ? cancelledRequest : request,
        ),
      );
      setSelectedStatus(undefined);
      setRequestsVersion((version) => version + 1);
      toast.success(t("requests.cancelledToast"));
    } catch (error) {
      const message = getGuestFriendlyErrorMessage(error, t("requests.cancelError"), t);
      setRequestsError(message);
      toast.error(message);
    } finally {
      setIsCancellingRequest(false);
    }
  }

  if (!isHydrated) {
    return <div className="min-h-screen bg-[var(--background)]" />;
  }

  if (!sessionToken) {
    return <GuestAccessRequiredState />;
  }

  return (
    <div className="vs-page-shell vs-guest-readable vs-safe-bottom vs-guest-comfort-surface min-h-screen text-[#18211d]">
      <VsTopBar
        showLeftControl={false}
        rightMode="icons"
        rightLabel={roomLabel}
        languageBadge={locale}
      />

      <main className="vs-container pb-32 pt-24">
        <section className="vs-rise-in mb-10 rounded-lg bg-[#25483f] p-6 text-white shadow-[0_22px_54px_rgba(31,61,53,0.18)] md:p-8">
          <p className="mb-2 text-sm font-semibold text-[#f4d36f]">{roomLabel}</p>
          <h1 className="mb-2 text-[28px] font-semibold leading-[1.15] md:text-[42px]">
            {t("requests.trackTitle")}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-white/78">
            {t("requests.trackSubtitle")}
          </p>
        </section>

        <section ref={currentRequestRef} className="vs-rise-in vs-delay-1 vs-comfort-card mb-12 scroll-mt-24 rounded-lg p-6 md:p-8">
          {isRequestsLoading && !currentRequest ? (
            <div className="animate-pulse space-y-5">
              <div className="h-5 w-32 rounded-full bg-[var(--surface-container-high)]" />
              <div className="h-7 w-2/3 rounded bg-[var(--surface-container-high)]" />
              <div className="h-4 w-1/2 rounded bg-[var(--surface-container-high)]" />
              <div className="h-16 rounded-lg bg-[var(--surface-container-low)]" />
            </div>
          ) : currentRequest ? (
            <>
              <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_260px] lg:items-start">
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${getStatusTone(currentRequest.status)}`}
                    >
                      {getRequestStatusLabel(currentRequest.status, t)}
                    </span>
                  </div>
                  <h2 className="text-2xl font-semibold text-[#18211d]">
                    {getRequestTitle(currentRequest, t)} - {roomLabel}
                  </h2>
                  <p className="mt-2 inline-flex max-w-full items-center gap-1 rounded-lg bg-[#eef3ee] px-2.5 py-1 text-sm font-semibold text-[#5e6a62]">
                    ID:{" "}
                    <span className="min-w-0 truncate font-mono text-[var(--on-surface)]">
                      {getRequestId(currentRequest)}
                    </span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-black ${getRequestPriorityTone(currentRequest)}`}>
                      {getRequestPriorityLabel(currentRequest, t)}
                    </span>
                    <span className="inline-flex min-h-8 items-center rounded-full border border-[#d7bd61]/55 bg-[#fff9df] px-3 text-xs font-black text-[#8a6a13]">
                      {t("requests.price")}: {formatGuestMoney(getRequestUnitPrice(currentRequest), getRequestCurrency(currentRequest), intlLocale, t)}
                    </span>
                    <span className="inline-flex min-h-8 items-center rounded-full border border-[#25483f]/14 bg-white px-3 text-xs font-black text-[#25483f]">
                      {t("requests.quantityShort")}: {currentRequest.quantity}
                    </span>
                  </div>
                  <p className="mt-1 text-base text-[#5e6a62]">
                    {t("requests.createdAt")}{" "}
                    {formatGuestDateTime(currentRequest.createdAt, intlLocale)}
                  </p>
                </div>
                <aside className="rounded-lg border border-[#d7bd61]/55 bg-[#fff9df] px-5 py-4 text-center shadow-[0_12px_28px_rgba(138,106,19,0.08)]">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#8a6a13]">
                    {t("requests.requestSubtotal")}
                  </p>
                  <p className="mt-1 text-xl font-black leading-tight text-[#18211d]">
                    {formatGuestMoney(getRequestTotalPrice(currentRequest), getRequestCurrency(currentRequest), intlLocale, t)}
                  </p>
                </aside>
              </div>

              <div className="mb-8 flex flex-wrap gap-3">
                  {currentRequest.canCancel ? (
                    <button
                      type="button"
                      onClick={() => void cancelGuestRequest(currentRequest)}
                      disabled={isCancellingRequest}
                      className="vs-touch-button flex items-center gap-2 rounded-full border border-[var(--error)] bg-white px-5 py-3 text-sm font-semibold text-[var(--error)] hover:bg-[var(--error-container)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <VsIcon name="close" className="text-xl" />
                      {isCancellingRequest ? t("requests.cancelling") : t("requests.cancel")}
                    </button>
                  ) : null}
                  <Link
                    href="/g/services"
                    className="vs-touch-button flex items-center gap-2 rounded-full bg-[#25483f] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(37,72,63,0.16)]"
                  >
                    <VsIcon name="phone_in_talk" className="text-xl" />
                    {t("common.contactHotel")}
                  </Link>
              </div>

              <div className="relative py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="z-10 flex flex-col items-center gap-2">
                    <div className="vs-breathe flex size-10 items-center justify-center rounded-full bg-[#f4d36f] text-[#25483f] shadow-[0_10px_24px_rgba(138,106,19,0.14)]">
                      <VsIcon name="check" className="text-xl" />
                    </div>
                    <span className="text-center text-sm font-bold text-[var(--on-surface)]">
                      {t("requests.sent")}
                    </span>
                  </div>
                  <div className={`h-1 flex-1 rounded-full ${progressStep >= 2 ? "vs-flow-line" : "bg-[#dfe7df]"}`} />
                  <div className={`z-10 flex flex-col items-center gap-2 ${progressStep >= 2 ? "" : "opacity-40"}`}>
                    <div className="vs-breathe flex size-10 items-center justify-center rounded-full border border-[#f4d36f]/60 bg-[#fff9df] text-[#25483f] shadow-[0_10px_24px_rgba(138,106,19,0.1)]">
                      <VsIcon name={getMiddleProgressIcon(currentRequest.status)} className={currentRequest.status === "CREATED" ? "animate-pulse text-xl" : "text-xl"} />
                    </div>
                    <span className="text-center text-sm font-bold text-[var(--on-surface)]">
                      {getMiddleProgressLabel(currentRequest.status, t)}
                    </span>
                  </div>
                  <div className={`h-1 flex-1 rounded-full ${progressStep >= 3 ? "vs-flow-line" : "bg-[#dfe7df]"}`} />
                  <div className={`z-10 flex flex-col items-center gap-2 ${progressStep >= 3 ? "" : "opacity-40"}`}>
                    <div className={`flex size-10 items-center justify-center rounded-full ${progressStep >= 3 ? "bg-emerald-100 text-emerald-700 shadow-sm" : "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]"}`}>
                      <VsIcon name="task_alt" className="text-xl" />
                    </div>
                    <span className={`text-center text-sm font-bold ${progressStep >= 3 ? "text-[var(--on-surface)]" : ""}`}>{t("requests.completed")}</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3 rounded-lg border-l-4 border-[#f4d36f] bg-[#fff9df] p-4 shadow-[0_10px_26px_rgba(138,106,19,0.08)]">
                <VsIcon
                  name="info"
                  className="text-xl text-[var(--secondary)]"
                />
                <p className="text-base text-[var(--on-surface-variant)]">
                  {getRequestSummary(currentRequest, t)}
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <span className="mb-3 inline-block rounded-full bg-[var(--surface-container-high)] px-3 py-1 text-sm font-semibold text-[var(--on-surface-variant)]">
                  {t("requests.noActive")}
                </span>
                <h2 className="text-2xl font-semibold text-[#18211d]">
                  {t("requests.createNew")}
                </h2>
                <p className="mt-1 text-base leading-7 text-[#5e6a62]">
                  {t("requests.emptyActiveDescription")}
                </p>
              </div>
              <Link
                href="/g/services"
                className="vs-touch-button flex items-center gap-2 self-start rounded-full bg-[#25483f] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(37,72,63,0.16)] md:self-center"
              >
                <VsIcon name="add" className="text-xl" />
                {t("requests.create")}
              </Link>
            </div>
          )}
        </section>

        <section>
          <div className="vs-rise-in vs-delay-2 mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-bold text-[#8a6a13]">{roomLabel}</p>
              <h2 className="text-2xl font-semibold text-[#18211d]">
                {t("requests.historyTitle")}
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#5e6a62]">
                {t("requests.historySubtitle")}
              </p>
            </div>
            <Link
              href="/g/services"
              className="vs-touch-button inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25483f] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(31,61,53,0.16)]"
            >
              <VsIcon name="add" className="text-lg" />
              {t("requests.create")}
              <VsIcon name="arrow_forward" className="text-sm" />
            </Link>
          </div>

          <div className="vs-rise-in vs-delay-2 vs-comfort-card mb-6 rounded-lg p-3 md:p-4">
            <div className="grid gap-3">
              <div className="rounded-lg border border-[#d7bd61]/50 bg-[#fff9df] px-4 py-3 text-center shadow-[0_10px_22px_rgba(138,106,19,0.08)]">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#8a6a13]">{t("requests.estimatedTotal")}</p>
                <p className="mt-1 text-xl font-black text-[#18211d]">
                  {formatGuestMoney(estimatedVisibleTotal, "VND", intlLocale, t)}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#8a6a13]">
                  {t("requests.pricedCount", { priced: pricedRequestCount, total: visibleRequests.length })}
                </p>
              </div>
            </div>

            <label className="mt-4 flex min-h-13 items-center gap-3 rounded-lg border border-[#25483f]/12 bg-white px-4 shadow-[0_10px_24px_rgba(31,61,53,0.06)]">
              <VsIcon name="search" className="text-xl text-[#5e6a62]" />
              <input
                value={requestSearch}
                onChange={(event) => setRequestSearch(event.target.value)}
                placeholder={t("requests.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#18211d] outline-none placeholder:text-[#7b857d]"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {requestTabs.map((tab) => {
                const isActive = selectedStatus === tab.value;

                return (
                  <button
                    key={tab.value ?? "all"}
                    type="button"
                    onClick={() => setSelectedStatus(tab.value)}
                    className={`vs-touch-button min-h-10 min-w-0 rounded-full px-2 text-[13px] font-bold leading-tight md:px-4 md:text-sm ${isActive ? "bg-[#25483f] text-white shadow-sm" : "bg-[#eef3ee] text-[#5e6a62] hover:text-[#25483f]"}`}
                  >
                    {t(tab.labelKey)}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="vs-touch-button min-h-12 rounded-full border border-[#25483f]/18 bg-white/70 px-4 text-sm font-bold text-[#25483f] hover:bg-[#eef3ee] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {t("requests.clearFilters")}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[var(--on-surface-variant)]">
              <span>{t("requests.count", { count: totalRequests })}</span>
            </div>
          </div>

          {requestsError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
              {requestsError}
            </div>
          ) : isRequestsLoading && requests.length === 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <article
                  key={index}
                  className="animate-pulse rounded-xl border border-[color:rgba(198,197,213,0.2)] bg-[color:rgba(243,243,244,0.5)] p-6"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="size-12 rounded-lg bg-[var(--surface-container-high)]" />
                    <div className="h-6 w-24 rounded-full bg-[var(--surface-container-high)]" />
                  </div>
                  <div className="mb-2 h-5 w-2/3 rounded bg-[var(--surface-container-high)]" />
                  <div className="mb-5 h-4 w-full rounded bg-[var(--surface-container-high)]" />
                  <div className="h-px bg-[color:rgba(198,197,213,0.2)]" />
                  <div className="mt-4 h-3 w-32 rounded bg-[var(--surface-container-high)]" />
                </article>
              ))}
            </div>
          ) : visibleRequests.length ? (
            <div className="grid gap-6 md:grid-cols-2">
              {visibleRequests.map((request) => {
                const isSelectedRequest = currentRequest?.id === request.id;
                const requestCurrency = getRequestCurrency(request);

                return (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => selectRequest(request.id)}
                  className={`vs-rise-in vs-comfort-card group rounded-lg p-6 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d7bd61] ${isSelectedRequest ? "border-[#d7bd61] bg-white ring-1 ring-[#f4d36f]/45" : ""}`}
                  aria-pressed={isSelectedRequest}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex size-12 items-center justify-center rounded-full bg-[#eef3ee] text-[#25483f] transition duration-500 group-hover:scale-105">
                      <VsIcon name="room_service" className="text-2xl" />
                    </div>
                    <div className="flex flex-1 flex-wrap justify-end gap-2">
                      <span
                        className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${getStatusTone(request.status)}`}
                      >
                        {getRequestStatusLabel(request.status, t)}
                      </span>
                    </div>
                  </div>
                  <p className="mb-2 inline-flex max-w-full items-center gap-1 rounded-lg bg-[#eef3ee] px-2.5 py-1 text-sm font-semibold text-[#5e6a62]">
                    ID:{" "}
                    <span className="min-w-0 truncate font-mono text-[var(--on-surface)]">{getRequestId(request)}</span>
                  </p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-black ${getRequestPriorityTone(request)}`}>
                      {getRequestPriorityLabel(request, t)}
                    </span>
                    <span className="inline-flex min-h-7 items-center rounded-full border border-[#d7bd61]/55 bg-[#fff9df] px-2.5 text-[11px] font-black text-[#8a6a13]">
                      {t("requests.price")}: {formatGuestMoney(getRequestUnitPrice(request), requestCurrency, intlLocale, t)}
                    </span>
                    <span className="inline-flex min-h-7 items-center rounded-full border border-[#25483f]/14 bg-white px-2.5 text-[11px] font-black text-[#25483f]">
                      {t("requests.quantityShort")}: {request.quantity}
                    </span>
                  </div>
                  <h3 className="mb-1 font-bold text-[#18211d]">
                    {getRequestTitle(request, t)}
                  </h3>
                  <p className="mb-4 text-base leading-7 text-[#5e6a62]">
                    {getRequestSummary(request, t)}
                  </p>
                  <div className="mb-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-[#f8fbf8] px-3 py-2">
                    <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#7b857d]">
                      {t("requests.subtotal")}
                    </span>
                    <span className="text-sm font-black text-[#18211d]">
                      {formatGuestMoney(getRequestTotalPrice(request), requestCurrency, intlLocale, t)}
                    </span>
                  </div>
                  <div className="border-t border-[#25483f]/10 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-[#5e6a62]">
                        {formatGuestDateTime(request.createdAt, intlLocale)}
                      </span>
                      {request.canCancel ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            void cancelGuestRequest(request);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            void cancelGuestRequest(request);
                          }}
                          aria-disabled={isCancellingRequest}
                          className={`vs-touch-button inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--error)] bg-white px-3 text-xs font-bold text-[var(--error)] hover:bg-[var(--error-container)] ${isCancellingRequest ? "pointer-events-none opacity-60" : ""}`}
                        >
                          <VsIcon name="close" className="text-base" />
                          {t("requests.cancel")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          ) : (
            <div className="vs-comfort-card rounded-lg p-8 text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#eef3ee] text-[#25483f]">
                <VsIcon name="assignment" className="text-3xl" />
              </div>
              <h3 className="text-lg font-bold text-[#18211d]">
                {t("requests.emptyTitle")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#5e6a62]">
                {t("requests.emptyDescription")}
              </p>
            </div>
          )}
        </section>

        <section className="vs-rise-in vs-delay-3 mt-16 grid gap-6 md:grid-cols-3">
          <Link
            href="/g/services"
            className="group relative h-64 overflow-hidden rounded-lg shadow-[0_22px_52px_rgba(31,61,53,0.16)] md:col-span-2"
          >
            <Image
              src={ctaImage}
              alt="Luxury hotel hallway"
              fill
              sizes="(min-width: 768px) 66vw, 100vw"
              className="object-cover transition-transform duration-1000 group-hover:scale-105"
            />
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#18211d]/86 to-transparent p-8">
              <h3 className="text-2xl font-semibold text-white">
                {t("requests.ctaTitle")}
              </h3>
              <p className="mb-4 text-base text-white/80">
                {t("requests.ctaDescription")}
              </p>
              <span className="vs-touch-button w-max rounded-full bg-[#f4d36f] px-6 py-2 text-sm font-bold text-[#18211d]">
                {t("services.selectNow")}
              </span>
            </div>
          </Link>

          <article className="vs-comfort-card flex flex-col items-center justify-center rounded-lg p-8 text-center">
            <div className="vs-breathe mb-4 flex size-16 items-center justify-center rounded-full bg-[#f4d36f] text-[#25483f]">
              <VsIcon name="question_answer" className="text-3xl" />
            </div>
            <h3 className="mb-2 text-2xl font-bold text-[#18211d]">
              {t("requests.helpTitle")}
            </h3>
            <p className="mb-6 leading-6 text-[#5e6a62]">
              {t("requests.helpDescription")}
            </p>
            <Link
              href="/g/services"
              className="vs-touch-button w-full rounded-full border border-[#25483f] bg-white py-4 text-sm font-bold text-[#25483f] hover:bg-[#25483f] hover:text-white"
            >
              {t("requests.messageDirectly")}
            </Link>
          </article>
        </section>
      </main>

      <VsBottomNav active="requests" />
    </div>
  );
}
