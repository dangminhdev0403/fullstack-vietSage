"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Swal from "sweetalert2";

import { VsBottomNav } from "../../_components/vs-bottom-nav";
import { VsIcon } from "../../_components/vs-icon";
import { VsTopBar } from "../../_components/vs-top-bar";
import { GuestReveal } from "@/features/guest-os/components/motion/guest-reveal";
import { GuestAccessRequiredState } from "@/features/guest-os/components/shared/guest-access-required-state";
import { GuestRequestSheet } from "@/features/guest-os/components/services/guest-request-sheet";
import { GuestServiceEmptyState } from "@/features/guest-os/components/services/guest-service-empty-state";
import { GuestServiceErrorState } from "@/features/guest-os/components/services/guest-service-error-state";
import { GuestServiceList } from "@/features/guest-os/components/services/guest-service-list";
import { GuestServiceSkeleton } from "@/features/guest-os/components/services/guest-service-skeleton";
import { GuestServicesHeader } from "@/features/guest-os/components/services/guest-services-header";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import type { CreateGuestRequestInput, GuestPortalRequestPriority, GuestServiceCategory, GuestServiceItem } from "@/features/guest-os/types/guest-os-contract";
import { GuestCatalogRequestGuard } from "@/features/guest-os/utils/guest-catalog-request-guard";
import { adaptGuestServiceCatalog } from "@/features/guest-os/utils/guest-service-catalog";
import { getGuestFriendlyErrorMessage } from "@/features/guest-os/utils/guest-os-errors";
import { useGuestRequestRealtime } from "@/features/request-realtime/use-guest-request-realtime";

type GuestTranslator = ReturnType<typeof useGuestI18n>["t"];

function getServicePrice(service: GuestServiceItem, t: GuestTranslator, intlLocale: string): string {
  if (service.price === null || service.price === undefined || service.price === "") return t("services.priceContact");
  const numericPrice = typeof service.price === "number" ? service.price : Number(service.price);
  const formattedPrice = Number.isFinite(numericPrice) ? numericPrice.toLocaleString(intlLocale) : String(service.price);
  return service.currency ? `${formattedPrice} ${service.currency}` : formattedPrice;
}

function getQuantityHint(service: GuestServiceItem, t: GuestTranslator): string | null {
  if (!service.quantityEnabled) return null;
  return service.maxQuantity === null ? t("services.quantityMinimum", { min: service.minQuantity }) : `${service.minQuantity}-${service.maxQuantity}`;
}

function buildGuestRequestPayload({ service, quantity, note, urgent = false }: { service: GuestServiceItem; quantity?: number; note?: string; urgent?: boolean }): CreateGuestRequestInput {
  return { serviceItemId: service.id, ...(service.quantityEnabled ? { quantity } : {}), ...(note?.trim() ? { description: note.trim() } : {}), priority: urgent ? "URGENT" : "NORMAL" };
}

function validateQuantity(service: GuestServiceItem, t: GuestTranslator, quantity?: number): true | string {
  if (!service.quantityEnabled) return true;
  if (quantity === undefined) return t("services.quantityRequired");
  if (quantity < service.minQuantity) return t("services.minQuantity", { min: service.minQuantity });
  if (service.maxQuantity !== null && quantity > service.maxQuantity) return t("services.maxQuantity", { max: service.maxQuantity });
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function buildConfirmHtml(service: GuestServiceItem, note: string, t: GuestTranslator): string {
  const noteLine = note.trim() ? `<section class="vs-service-confirm-item"><span class="vs-service-confirm-bullet">&bull;</span><span class="vs-service-confirm-label">${escapeHtml(t("services.noteLabel"))}</span><p class="vs-service-confirm-copy">${escapeHtml(note.trim())}</p></section>` : "";
  return `<div class="vs-service-confirm-content"><section class="vs-service-confirm-item"><span class="vs-service-confirm-bullet">&bull;</span><span class="vs-service-confirm-label">${escapeHtml(t("services.serviceLabel"))}</span><p class="vs-service-confirm-service">${escapeHtml(service.name)}</p></section>${noteLine}</div>`;
}

export default function GuestServicesPage() {
  const { intlLocale, locale, t } = useGuestI18n();
  const router = useRouter();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const room = useGuestStore((state) => state.room);
  const isHydrated = useGuestStoreHydrated();
  const [selectedService, setSelectedService] = useState<GuestServiceItem | null>(null);
  const [requestNote, setRequestNote] = useState("");
  const [requestQuantity, setRequestQuantity] = useState("1");
  const [requestPriority, setRequestPriority] = useState<GuestPortalRequestPriority>("NORMAL");
  const [isRequestSubmitting, setIsRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [categories, setCategories] = useState<GuestServiceCategory[]>([]);
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const catalogRequestGuardRef = useRef(new GuestCatalogRequestGuard());
  const roomLabel = room?.roomNumber ? t("common.roomNumber", { room: room.roomNumber }) : t("home.roomFallback");
  const loadServices = useCallback(async (options?: { silent?: boolean }) => {
    if (!sessionToken) return;
    const requestGeneration = catalogRequestGuardRef.current.begin();
    if (!options?.silent) {
      setIsServicesLoading(true);
      setServicesError(null);
      setCategories([]);
    }
    try {
      const catalog = adaptGuestServiceCatalog(await guestOsService.listServices(sessionToken, locale));
      if (!catalogRequestGuardRef.current.isCurrent(requestGeneration)) return;
      setCategories(catalog.categories);
      setServicesError(null);
    } catch (error) {
      if (!catalogRequestGuardRef.current.isCurrent(requestGeneration)) return;
      if (!options?.silent) {
        setServicesError(getGuestFriendlyErrorMessage(error, t("services.loadError"), t));
      }
    } finally {
      if (!options?.silent && catalogRequestGuardRef.current.isCurrent(requestGeneration)) {
        setIsServicesLoading(false);
      }
    }
  }, [locale, sessionToken, t]);

  useGuestRequestRealtime(sessionToken, {
    onReconnect: () => { void loadServices({ silent: true }); },
    onCreated: () => { void loadServices({ silent: true }); },
    onUpdated: () => { void loadServices({ silent: true }); },
    onAnswered: () => { void loadServices({ silent: true }); },
    onConversationClosed: () => { void loadServices({ silent: true }); },
  });

  useEffect(() => {
    if (!isHydrated || !sessionToken) return;
    const requestGuard = catalogRequestGuardRef.current;
    void Promise.resolve().then(() => loadServices());
    return () => {
      requestGuard.invalidate();
    };
  }, [isHydrated, sessionToken, loadServices]);

  useEffect(() => {
    if (!selectedService || !categories.length) return;
    const allItems = categories.flatMap((cat) => cat.items);
    const stillExists = allItems.some((item) => item.id === selectedService.id);
    if (!stillExists) {
      toast.error("Dịch vụ bạn vừa chọn đã ngưng phục vụ.");
      const timer = setTimeout(() => setSelectedService(null), 0);
      return () => clearTimeout(timer);
    }
  }, [categories, selectedService]);

  const closeRequestSheet = useCallback(() => {
    if (isRequestSubmitting) return;
    setSelectedService(null);
    setRequestError(null);
  }, [isRequestSubmitting]);

  if (!isHydrated) return <div className="min-h-screen bg-[var(--background)]" />;
  if (!sessionToken) return <GuestAccessRequiredState icon={<VsIcon name="qr_code" className="text-2xl" />} />;

  function openRequestSheet(service: GuestServiceItem) {
    setSelectedService(service);
    setRequestNote("");
    setRequestQuantity(String(service.quantityEnabled ? service.minQuantity || 1 : 1));
    setRequestPriority("NORMAL");
    setRequestError(null);
  }

  function updateQuantityBy(delta: number) {
    if (!selectedService?.quantityEnabled) return;
    const current = Number(requestQuantity);
    const base = Number.isInteger(current) ? current : selectedService.minQuantity;
    const upperBound = selectedService.maxQuantity ?? Number.POSITIVE_INFINITY;
    setRequestQuantity(String(Math.min(upperBound, Math.max(selectedService.minQuantity, base + delta))));
  }

  async function submitGuestRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService || !sessionToken) return;
    let quantity: number | undefined;
    if (selectedService.quantityEnabled) {
      const parsedQuantity = Number(requestQuantity);
      quantity = Number.isInteger(parsedQuantity) ? parsedQuantity : undefined;
      const result = validateQuantity(selectedService, t, quantity);
      if (result !== true) { setRequestError(result); return; }
    }
    const payload = buildGuestRequestPayload({ service: selectedService, quantity, note: requestNote, urgent: requestPriority === "URGENT" });
    const confirmation = await Swal.fire({
      title: requestPriority === "URGENT" ? t("requests.urgent") : t("services.send"), html: buildConfirmHtml(selectedService, requestNote, t), icon: requestPriority === "URGENT" ? "warning" : "question", showCancelButton: true, confirmButtonText: t("services.send"), cancelButtonText: t("common.chooseAgain"), confirmButtonColor: requestPriority === "URGENT" ? "#ba1a1a" : "#25483f", reverseButtons: false,
      customClass: { popup: "vs-service-confirm-popup", title: "vs-service-confirm-title", htmlContainer: "vs-service-confirm-html", actions: "vs-service-confirm-actions" },
    });
    if (!confirmation.isConfirmed) return;
    setIsRequestSubmitting(true);
    setRequestError(null);
    void Swal.fire({ title: t("common.wait"), text: t("services.submitText"), allowOutsideClick: false, allowEscapeKey: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    try {
      await guestOsService.createRequest(sessionToken, payload, locale);
      Swal.close();
      toast.success(payload.priority === "URGENT" ? t("services.urgentSent") : t("services.sent"));
      setSelectedService(null);
      router.push("/g/requests");
    } catch (error) {
      void loadServices();
      const userMsg = getGuestFriendlyErrorMessage(error, t("services.loadError"), t);
      setRequestError(userMsg);
      toast.error("Dịch vụ có thể đã bị ngưng hoạt động. Vui lòng kiểm tra lại danh mục.");
    } finally {
      Swal.close();
      setIsRequestSubmitting(false);
    }
  }

  const pageTitle = t("services.title");
  const pageSubtitle = t("services.subtitle");

  return (
    <div className="vs-page-shell vs-guest-readable vs-safe-bottom vs-guest-comfort-surface min-h-screen overflow-x-hidden text-[#18211d]">
      <VsTopBar showLeftControl={false} rightMode="icons" rightLabel={roomLabel} languageBadge={locale} />
      <main className="vs-container pb-32 pt-24">
        <GuestServicesHeader roomLabel={roomLabel} title={pageTitle} subtitle={pageSubtitle} requestsLabel={t("requests.title")} />
        <GuestReveal>
          <section aria-labelledby="guest-services-list-title">
            <h2 id="guest-services-list-title" className="sr-only">{t("services.service")}</h2>
            {isServicesLoading ? <GuestServiceSkeleton /> : servicesError ? <GuestServiceErrorState message={servicesError} retryLabel={t("common.retry")} onRetry={() => void loadServices()} /> : categories.length ? <div className="space-y-10">{categories.map((category) => <section key={category.id} aria-labelledby={`guest-service-category-${category.id}`}><div className="mb-6"><p className="text-sm font-semibold text-[#8a6a13]">{t("services.title")}</p><h3 id={`guest-service-category-${category.id}`} className="vs-display mt-1 text-2xl font-semibold text-[#18211d] md:text-3xl">{category.name}</h3>{category.description ? <p className="mt-2 text-sm text-[#5e6a62]">{category.description}</p> : null}</div>{category.items.length ? <GuestServiceList services={category.items} getPrice={(service) => getServicePrice(service, t, intlLocale)} getQuantityHint={(service) => getQuantityHint(service, t)} quantityLabel={t("services.quantity")} actionLabel={t("services.send")} onSelect={openRequestSheet} /> : <GuestServiceEmptyState message={t("services.empty")} />}</section>)}</div> : <GuestServiceEmptyState message={t("services.empty")} />}
          </section>
        </GuestReveal>
      </main>
      {selectedService ? <GuestRequestSheet service={selectedService} quantity={requestQuantity} priority={requestPriority} note={requestNote} error={requestError} isSubmitting={isRequestSubmitting} labels={{ eyebrow: t("services.guestRequest"), close: t("common.close"), quantity: t("services.quantity"), quantityHint: getQuantityHint(selectedService, t) ?? "", decrease: t("services.quantityDecrease"), increase: t("services.quantityIncrease"), normal: t("requests.normal"), urgent: t("requests.urgent"), note: t("services.note"), notePlaceholder: t("services.notePlaceholder"), submit: t("services.send"), submitting: t("services.sending") }} onClose={closeRequestSheet} onQuantityChange={setRequestQuantity} onQuantityStep={updateQuantityBy} onPriorityChange={setRequestPriority} onNoteChange={setRequestNote} onSubmit={submitGuestRequest} /> : null}
      <VsBottomNav active="services" />
    </div>
  );
}
