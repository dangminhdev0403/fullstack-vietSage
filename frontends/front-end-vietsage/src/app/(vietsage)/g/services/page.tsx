"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  CreateGuestRequestInput,
  GuestCategoryServicesResult,
  GuestPortalRequestPriority,
  GuestServiceItem,
} from "@/features/guest-os/types/guest-os-contract";
import { getGuestFriendlyErrorMessage } from "@/features/guest-os/utils/guest-os-errors";

const defaultServiceCategoryId =
  process.env.NEXT_PUBLIC_GUEST_DEFAULT_SERVICE_CATEGORY_ID?.trim() ?? "";

type ServiceCard = {
  id: string;
  title: string;
  description: string;
  icon: string;
  tone: "primary" | "secondary" | "error" | "neutral";
  action: string;
};

const services: ServiceCard[] = [
  {
    id: "cleaning",
    title: "services.housekeeping",
    description: "services.housekeeping",
    icon: "cleaning_services",
    tone: "primary",
    action: "services.selectNow",
  },
  {
    id: "supplies",
    title: "services.extraTowels",
    description: "services.extraTowels",
    icon: "inventory_2",
    tone: "secondary",
    action: "services.selectNow",
  },
  {
    id: "water",
    title: "services.service",
    description: "services.service",
    icon: "water_drop",
    tone: "primary",
    action: "services.selectNow",
  },
  {
    id: "reception",
    title: "common.contact",
    description: "common.contact",
    icon: "phone_in_talk",
    tone: "secondary",
    action: "services.callNow",
  },
  {
    id: "incident",
    title: "services.maintenance",
    description: "services.maintenance",
    icon: "build",
    tone: "error",
    action: "services.report",
  },
  {
    id: "other",
    title: "requests.serviceRequest",
    description: "requests.serviceRequest",
    icon: "more_horiz",
    tone: "neutral",
    action: "services.send",
  },
];


const showServiceGroup = false;
const showServicePreviewImage = false;

const toneClass: Record<ServiceCard["tone"], string> = {
  primary: "bg-[var(--primary-fixed)] text-[var(--primary)]",
  secondary: "bg-[var(--surface-container-high)] text-[var(--secondary)]",
  error: "bg-[var(--error-container)] text-[var(--error)]",
  neutral: "bg-[var(--surface-container)] text-[var(--on-surface-variant)]",
};

type ServiceTileProps = {
  service: ServiceCard;
  onSelect: (service: ServiceCard) => void;
};

type SelectedService = ServiceCard | GuestServiceItem;

type BuildGuestRequestPayloadInput = {
  service: GuestServiceItem;
  quantity?: number;
  note?: string;
  urgent?: boolean;
};

function isGuestServiceItem(
  service: SelectedService,
): service is GuestServiceItem {
  return "name" in service;
}

function getServiceTitle(service: SelectedService): string {
  return isGuestServiceItem(service) ? service.name : service.title;
}

function getServiceDescription(service: SelectedService): string {
  return isGuestServiceItem(service)
    ? (service.description ?? "")
    : service.description;
}

type GuestTranslator = ReturnType<typeof useGuestI18n>["t"];

function getServicePrice(service: GuestServiceItem, t: GuestTranslator, intlLocale: string): string {
  if (
    service.price === null ||
    service.price === undefined ||
    service.price === ""
  ) {
    return t("services.priceContact");
  }

  const numericPrice =
    typeof service.price === "number" ? service.price : Number(service.price);
  const formattedPrice = Number.isFinite(numericPrice)
    ? numericPrice.toLocaleString(intlLocale)
    : String(service.price);

  return service.currency
    ? `${formattedPrice} ${service.currency}`
    : formattedPrice;
}

function isQuantityEnabled(
  service: SelectedService,
): service is GuestServiceItem {
  return isGuestServiceItem(service) && service.quantityEnabled;
}

function getInitialQuantity(service: SelectedService): string {
  return isQuantityEnabled(service) ? String(service.minQuantity || 1) : "1";
}

function getQuantityHint(service: GuestServiceItem, t: GuestTranslator): string | null {
  if (!service.quantityEnabled) return null;
  return service.maxQuantity === null
    ? t("services.quantityMinimum", { min: service.minQuantity })
    : `${service.minQuantity}-${service.maxQuantity}`;
}

function buildGuestRequestPayload({
  service,
  quantity,
  note,
  urgent = false,
}: BuildGuestRequestPayloadInput): CreateGuestRequestInput {
  return {
    serviceItemId: service.id,
    ...(service.quantityEnabled ? { quantity } : {}),
    ...(note?.trim() ? { description: note.trim() } : {}),
    priority: urgent ? "URGENT" : "NORMAL",
  };
}

function validateQuantity(
  service: GuestServiceItem,
  t: GuestTranslator,
  quantity?: number,
): true | string {
  if (!service.quantityEnabled) return true;
  if (quantity === undefined) return t("services.quantityRequired");
  if (quantity < service.minQuantity)
    return t("services.minQuantity", { min: service.minQuantity });
  if (service.maxQuantity !== null && quantity > service.maxQuantity)
    return t("services.maxQuantity", { max: service.maxQuantity });
  return true;
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

function buildConfirmHtml(service: SelectedService, note: string, t: GuestTranslator): string {
  const serviceTitle = escapeHtml(getServiceTitle(service));
  const trimmedNote = note.trim();
  const noteLine = trimmedNote
    ? `
      <section class="vs-service-confirm-item">
        <span class="vs-service-confirm-bullet">•</span>
        <span class="vs-service-confirm-label">${escapeHtml(t("services.noteLabel"))}</span>
        <p class="vs-service-confirm-copy">${escapeHtml(trimmedNote)}</p>
      </section>`
    : "";

  return `
    <div class="vs-service-confirm-content">
      <section class="vs-service-confirm-item">
        <span class="vs-service-confirm-bullet">•</span>
        <span class="vs-service-confirm-label">${escapeHtml(t("services.serviceLabel"))}</span>
        <p class="vs-service-confirm-service">${serviceTitle}</p>
      </section>
      ${noteLine}
    </div>`;
}

function ServiceTile({ service, onSelect }: ServiceTileProps) {
  const { t } = useGuestI18n();

  return (
    <button
      type="button"
      onClick={() => onSelect(service)}
      className="group relative flex min-h-[132px] flex-col items-center rounded-xl border border-transparent bg-white px-2.5 py-4 text-center shadow-[0px_4px_20px_rgba(0,0,0,0.05)] transition-all duration-500 hover:-translate-y-1 hover:border-[var(--primary)] active:scale-[0.97] md:min-h-48 md:items-start md:p-6 md:text-left"
    >
      <div
        className={`mb-3 flex size-11 items-center justify-center rounded-lg transition-transform duration-500 group-hover:scale-110 md:mb-4 md:size-12 ${toneClass[service.tone]}`}
      >
        <VsIcon name={service.icon} className="text-[24px] md:text-[28px]" />
      </div>
      <h2 className="line-clamp-2 min-h-[32px] text-[12px] font-bold leading-4 text-[var(--primary)] md:mb-2 md:min-h-0 md:text-sm md:font-semibold md:tracking-[0.05em]">
        {t(service.title)}
      </h2>
      <p className="hidden text-xs leading-[1.5] text-[var(--on-surface-variant)] md:block">
        {t(service.description)}
      </p>
      <span className="mt-auto pt-3 text-[10px] font-bold uppercase leading-none text-[var(--primary)] md:pt-4 md:text-[12px] md:opacity-0 md:transition-opacity md:duration-500 md:group-hover:opacity-100">
        {t(service.action)}
      </span>
    </button>
  );
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

export default function GuestServicesPage() {
  const { intlLocale, locale, t } = useGuestI18n();
  const router = useRouter();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const room = useGuestStore((state) => state.room);
  const [selectedService, setSelectedService] =
    useState<SelectedService | null>(null);
  const [requestNote, setRequestNote] = useState("");
  const [requestQuantity, setRequestQuantity] = useState("1");
  const [requestPriority, setRequestPriority] =
    useState<GuestPortalRequestPriority>("NORMAL");
  const [isRequestSubmitting, setIsRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [categoryServices, setCategoryServices] =
    useState<GuestCategoryServicesResult | null>(null);
  const [isServicesLoading, setIsServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const isHydrated = useGuestStoreHydrated();
  const roomLabel = room?.roomNumber ? t("common.roomNumber", { room: room.roomNumber }) : t("home.roomFallback");
  const isDefaultCategoryConfigured = defaultServiceCategoryId.length > 0;
  const pageTitle = isDefaultCategoryConfigured
    ? (categoryServices?.category.name ?? t("services.title"))
    : t("services.defaultMissing");
  const pageSubtitle = isDefaultCategoryConfigured
    ? (categoryServices?.category.description ??
      t("services.subtitle"))
    : "";

  useEffect(() => {
    if (!isHydrated || !sessionToken || !isDefaultCategoryConfigured) {
      return;
    }

    let isCancelled = false;

    void Promise.resolve().then(async () => {
      if (isCancelled) {
        return;
      }

      setIsServicesLoading(true);
      setServicesError(null);

      try {
        const data = await guestOsService.listServicesByCategory(
          sessionToken,
          defaultServiceCategoryId,
          { page: 1, limit: 20 },
          locale,
        );
        if (!isCancelled) {
          setCategoryServices(data);
        }
      } catch (error) {
        if (!isCancelled) {
          setServicesError(getGuestFriendlyErrorMessage(error, t("services.loadError"), t));
        }
      } finally {
        if (!isCancelled) {
          setIsServicesLoading(false);
        }
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isDefaultCategoryConfigured, isHydrated, locale, sessionToken, t]);

  if (!isHydrated) {
    return <div className="min-h-screen bg-[var(--background)]" />;
  }

  if (!sessionToken) {
    return <GuestAccessRequiredState />;
  }

  function openRequestModal(service: SelectedService) {
    setSelectedService(service);
    setRequestNote("");
    setRequestQuantity(getInitialQuantity(service));
    setRequestPriority("NORMAL");
    setRequestError(null);
  }

  function closeRequestModal() {
    setSelectedService(null);
    setRequestError(null);
  }

  function updateQuantityBy(delta: number) {
    if (!selectedService || !isQuantityEnabled(selectedService)) return;

    const currentQuantity = Number(requestQuantity);
    const baseQuantity = Number.isInteger(currentQuantity)
      ? currentQuantity
      : selectedService.minQuantity;
    const nextQuantity = baseQuantity + delta;
    const cappedQuantity =
      selectedService.maxQuantity === null
        ? nextQuantity
        : Math.min(nextQuantity, selectedService.maxQuantity);

    setRequestQuantity(
      String(Math.max(selectedService.minQuantity, cappedQuantity)),
    );
  }

  async function submitGuestRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService || !sessionToken) return;

    let quantity: number | undefined;
    if (isQuantityEnabled(selectedService)) {
      const parsedQuantity = Number(requestQuantity);
      quantity = Number.isInteger(parsedQuantity) ? parsedQuantity : undefined;
      const quantityValidation = validateQuantity(selectedService, t, quantity);
      if (quantityValidation !== true) {
        setRequestError(quantityValidation);
        return;
      }
    }

    if (!isGuestServiceItem(selectedService)) {
      setRequestError(t("services.loadError"));
      return;
    }

    const payload = buildGuestRequestPayload({
      service: selectedService,
      quantity,
      note: requestNote,
      urgent: requestPriority === "URGENT",
    });

    const confirmation = await Swal.fire({
      title:
        requestPriority === "URGENT"
          ? t("requests.urgent")
          : t("services.send"),
      html: buildConfirmHtml(selectedService, requestNote, t),
      icon: requestPriority === "URGENT" ? "warning" : "question",
      showCancelButton: true,
      confirmButtonText: t("services.send"),
      cancelButtonText: t("common.chooseAgain"),
      confirmButtonColor: requestPriority === "URGENT" ? "#ba1a1a" : "#4f46e5",
      reverseButtons: false,
      customClass: {
        popup: "vs-service-confirm-popup",
        title: "vs-service-confirm-title",
        htmlContainer: "vs-service-confirm-html",
        actions: "vs-service-confirm-actions",
      },
    });

    if (!confirmation.isConfirmed) {
      return;
    }

    setIsRequestSubmitting(true);
    setRequestError(null);
    void Swal.fire({
      title: t("common.wait"),
      text: t("services.submitText"),
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      await guestOsService.createRequest(sessionToken, payload, locale);
      Swal.close();
      toast.success(
        payload.priority === "URGENT"
          ? t("services.urgentSent")
          : t("services.sent"),
      );
      setSelectedService(null);
      router.push("/g/requests");
    } catch (error) {
      setRequestError(getGuestFriendlyErrorMessage(error, t("services.loadError"), t));
    } finally {
      Swal.close();
      setIsRequestSubmitting(false);
    }
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
        <header className="vs-rise-in vs-comfort-card mb-10 flex flex-col justify-between gap-5 rounded-lg p-6 md:flex-row md:items-center md:p-8">
          <div>
            <p className="mb-2 text-sm font-semibold text-[#8a6a13]">{roomLabel}</p>
            <h1 className="mb-2 text-[28px] font-semibold leading-[1.15] text-[#18211d] md:text-[40px]">
              {pageTitle}
            </h1>
            {pageSubtitle ? (
              <p className="max-w-2xl text-base leading-7 text-[#5e6a62]">
                {pageSubtitle}
              </p>
            ) : null}
          </div>
          <Link
            href="/g/requests"
            className="vs-touch-button inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#25483f] px-5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(37,72,63,0.18)]"
          >
            {t("requests.title")}
            <VsIcon name="chevron_right" className="text-lg" />
          </Link>
        </header>

        {showServiceGroup ? (
          <section className="grid grid-cols-3 gap-3 md:gap-6">
            {services.map((service) => (
              <ServiceTile
                key={service.id}
                service={service}
                onSelect={openRequestModal}
              />
            ))}
          </section>
        ) : null}

        <section className="vs-rise-in vs-delay-1 mt-8">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <span className="text-sm font-semibold text-[#8a6a13]">
                {t("services.title")}
              </span>
              <h2 className="mt-1 text-2xl font-semibold text-[#18211d] md:text-3xl">
                {categoryServices?.category.name ?? t("services.service")}
              </h2>
            </div>
            <Link
              href="/g/requests"
              className="vs-touch-button inline-flex items-center gap-1 rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-[#25483f] shadow-[0_8px_22px_rgba(31,61,53,0.08)]"
            >
              {t("requests.title")}
              <VsIcon name="chevron_right" className="text-lg" />
            </Link>
          </div>

          {!isDefaultCategoryConfigured ? (
            <div className="vs-comfort-card rounded-lg p-5 text-sm font-semibold text-[#5e6a62]">
              {t("services.defaultMissing")}
            </div>
          ) : isServicesLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <article
                  key={index}
                  className="vs-comfort-card flex animate-pulse items-center gap-4 rounded-lg p-4"
                >
                  {showServicePreviewImage ? (
                    <div className="size-20 shrink-0 rounded-lg bg-[var(--surface-container)]" />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-2/3 rounded bg-[var(--surface-container)]" />
                    <div className="h-3 w-full rounded bg-[var(--surface-container)]" />
                    <div className="h-3 w-1/2 rounded bg-[var(--surface-container)]" />
                  </div>
                </article>
              ))}
            </div>
          ) : servicesError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700 shadow-[0_14px_34px_rgba(127,29,29,0.08)]">
              {servicesError}
            </div>
          ) : categoryServices?.services.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {categoryServices.services.map((service) => (
                <article
                  key={service.id}
                  className="vs-rise-in vs-comfort-card flex items-center gap-4 rounded-lg p-4"
                >
                  {showServicePreviewImage ? (
                    <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-container)] text-[var(--primary)]">
                      <VsIcon name="room_service" className="text-3xl" />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold text-[#18211d]">
                      {service.name}
                    </h3>
                    {service.description ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5e6a62]">
                        {service.description}
                      </p>
                    ) : null}
                    {getQuantityHint(service, t) ? (
                      <p className="mt-1 text-xs font-semibold text-[#8a6a13]">
                        {t("services.quantity")}: {getQuantityHint(service, t)}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="whitespace-nowrap text-sm font-bold text-[#8a6a13]">
                      {getServicePrice(service, t, intlLocale)}
                    </p>
                    <button
                      type="button"
                      onClick={() => openRequestModal(service)}
                      className="vs-touch-button mt-2 rounded-full border border-[#d7bd61] bg-[#fff9df] px-4 py-2 text-xs font-bold text-[#25483f] hover:bg-[#f4d36f]"
                    >
                      {t("services.send")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="vs-comfort-card rounded-lg p-5 text-sm font-semibold text-[#5e6a62]">
              {t("services.empty")}
            </div>
          )}
        </section>
      </main>

      {selectedService ? (
        <div className="fixed inset-0 z-[70] grid place-items-end bg-[#18211d]/45 p-0 backdrop-blur-sm md:place-items-center md:p-6">
          <form
            onSubmit={submitGuestRequest}
            className="vs-rise-in w-full rounded-t-2xl bg-white p-6 shadow-[0_28px_80px_rgba(24,33,29,0.24)] md:max-w-xl md:rounded-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-[#8a6a13]">
                  {t("services.guestRequest")}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-[#18211d]">
                  {getServiceTitle(selectedService)}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#5e6a62]">
                  {getServiceDescription(selectedService)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRequestModal}
                className="vs-touch-button rounded-full bg-[#eef3ee] px-3 py-1 text-sm font-bold text-[#5e6a62]"
              >
                {t("common.close")}
              </button>
            </div>
            {isQuantityEnabled(selectedService) ? (
              <div className="mb-5 rounded-xl border border-[color:rgba(198,197,213,0.45)] bg-[var(--surface-container-low)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">
                    {t("services.quantity")}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--secondary)] shadow-sm">
                    {selectedService.maxQuantity === null
                      ? t("services.quantityMinimum", { min: selectedService.minQuantity })
                      : `${selectedService.minQuantity}-${selectedService.maxQuantity}`}
                  </span>
                </div>
                <div className="grid grid-cols-[48px_minmax(0,1fr)_48px] items-center overflow-hidden rounded-xl border border-[color:rgba(198,197,213,0.65)] bg-white shadow-sm focus-within:border-[var(--primary)]">
                  <button
                    type="button"
                    onClick={() => updateQuantityBy(-1)}
                    disabled={
                      Number(requestQuantity) <= selectedService.minQuantity
                    }
                    className="flex min-h-12 items-center justify-center border-r border-[color:rgba(198,197,213,0.45)] text-xl font-semibold text-[var(--primary)] transition duration-500 hover:bg-[var(--surface-container-low)] disabled:cursor-not-allowed disabled:text-[var(--on-surface-variant)] disabled:opacity-45"
                    aria-label={t("services.quantityDecrease")}
                  >
                    -
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={requestQuantity}
                    onChange={(event) =>
                      setRequestQuantity(event.target.value.replace(/\D/g, ""))
                    }
                    className="min-h-12 w-full border-0 bg-white px-3 text-center text-lg font-bold text-[var(--primary)] outline-none"
                    aria-label={t("services.quantity")}
                  />
                  <button
                    type="button"
                    onClick={() => updateQuantityBy(1)}
                    disabled={
                      selectedService.maxQuantity !== null &&
                      Number(requestQuantity) >= selectedService.maxQuantity
                    }
                    className="flex min-h-12 items-center justify-center border-l border-[color:rgba(198,197,213,0.45)] text-xl font-semibold text-[var(--primary)] transition duration-500 hover:bg-[var(--surface-container-low)] disabled:cursor-not-allowed disabled:text-[var(--on-surface-variant)] disabled:opacity-45"
                    aria-label={t("services.quantityIncrease")}
                  >
                    +
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mb-4 rounded-xl border border-[color:rgba(198,197,213,0.45)] bg-[var(--surface-container-low)] p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setRequestPriority("NORMAL")}
                  className={`min-h-11 rounded-lg px-3 text-sm font-bold transition duration-500 ${requestPriority === "NORMAL" ? "bg-white text-[var(--primary)] shadow-sm" : "text-[var(--on-surface-variant)] hover:text-[var(--primary)]"}`}
                >
                  {t("requests.normal")}
                </button>
                <button
                  type="button"
                  onClick={() => setRequestPriority("URGENT")}
                  className={`min-h-11 rounded-lg px-3 text-sm font-bold transition duration-500 ${requestPriority === "URGENT" ? "bg-[var(--error-container)] text-[var(--error)] shadow-sm" : "text-[var(--on-surface-variant)] hover:text-[var(--error)]"}`}
                >
                  {t("requests.urgent")}
                </button>
              </div>
            </div>
            <textarea
              rows={4}
              value={requestNote}
              onChange={(event) => setRequestNote(event.target.value)}
              placeholder={t("services.note")}
              wrap="soft"
              className="w-full resize-y overflow-x-hidden break-words rounded-xl border border-[color:rgba(198,197,213,0.55)] bg-[var(--surface-container-low)] p-4 text-sm leading-6 outline-none [overflow-wrap:anywhere] [word-break:break-word] focus:border-[var(--primary)]"
            />
            {requestError ? (
              <p className="mt-3 text-sm font-semibold text-[var(--error)]">
                {requestError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={isRequestSubmitting}
              className="vs-touch-button mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#25483f] py-4 text-sm font-bold text-white shadow-[0_16px_36px_rgba(37,72,63,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <VsIcon name="send" className="text-xl" />
              {isRequestSubmitting ? t("qr.wait") : t("services.send")}
            </button>
          </form>
        </div>
      ) : null}

      <VsBottomNav active="services" />
    </div>
  );
}
