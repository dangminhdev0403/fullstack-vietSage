"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, m, useReducedMotion } from "motion/react";

import { VsIcon } from "../../_components/vs-icon";
import { HttpError } from "@/core/http/http-error";
import { guestMotionTokens } from "@/features/guest-os/components/motion/guest-motion-tokens";
import { GuestStateCard } from "@/features/guest-os/components/shared/guest-state-card";
import { useGuestI18n } from "@/features/guest-os/i18n/use-guest-i18n";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";

function getQrCodeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const RESERVED_GUEST_ROUTES = new Set(["home", "language", "requests", "services"]);

const GUEST_QR_ERROR_KEYS: Record<number, string> = {
  401: "qr.expired",
  403: "qr.unavailable",
  404: "qr.notFound",
  500: "qr.interrupted",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringField(payload: unknown, fieldName: string): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const value = payload[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberField(payload: unknown, fieldName: string): number | null {
  if (!isRecord(payload)) {
    return null;
  }

  const value = payload[fieldName];
  return typeof value === "number" ? value : null;
}

function readNestedData(payload: unknown): unknown {
  return isRecord(payload) ? payload.data : null;
}

function isSessionSwitchRequired(error: unknown): boolean {
  if (!(error instanceof HttpError)) {
    return false;
  }

  const data = readNestedData(error.data);
  return error.status === 409 && readStringField(data, "code") === "GUEST_SESSION_SWITCH_REQUIRED";
}

function inferGuestQrErrorStatus(error: unknown): number {
  if (error instanceof HttpError) {
    const backendStatus = readNumberField(error.data, "status");
    return backendStatus ?? error.status;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.trim().toLowerCase();

  if (/\b401\b/.test(normalized) || normalized.includes("unauthorized") || normalized.includes("session expired")) {
    return 401;
  }

  if (/\b403\b/.test(normalized) || normalized.includes("forbidden") || normalized.includes("invalid qr")) {
    return 403;
  }

  if (/\b404\b/.test(normalized) || normalized.includes("not found")) {
    return 404;
  }

  return 500;
}

function getGuestQrErrorKey(error: unknown): string {
  if (error instanceof HttpError && isRecord(error.data)) {
    const backendMessage = readStringField(error.data, "message");
    const backendDetail = isRecord(error.data.data) ? readStringField(error.data.data, "detail") : null;
    const text = `${backendMessage ?? ""} ${backendDetail ?? ""}`.toLowerCase();

    if (text.includes("session expired")) {
      return GUEST_QR_ERROR_KEYS[401];
    }

    if (text.includes("invalid qr") || text.includes("forbidden")) {
      return GUEST_QR_ERROR_KEYS[403];
    }
  }

  const status = inferGuestQrErrorStatus(error);
  return GUEST_QR_ERROR_KEYS[status] ?? GUEST_QR_ERROR_KEYS[500];
}

function QrSwitchCard({ onConfirm, title, message, confirmLabel }: { onConfirm: () => void; title: string; message: string; confirmLabel: string }) {
  return (
    <GuestStateCard
      title={title}
      message={message}
      icon={<VsIcon name="meeting_room" className="text-3xl" />}
      action={
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-11 rounded-full bg-[#25483f] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(31,61,53,0.2)] transition-colors hover:bg-[#1d3932] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b18b26]"
        >
          {confirmLabel}
        </button>
      }
    />
  );
}

export default function GuestQrEntryPage() {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const { locale, t } = useGuestI18n();
  const params = useParams<{ qrCode?: string | string[] }>();
  const qrCode = useMemo(() => getQrCodeParam(params.qrCode).trim(), [params.qrCode]);
  const reservedRoute = useMemo(() => qrCode.toLowerCase(), [qrCode]);
  const isHydrated = useGuestStoreHydrated();
  const language = useGuestStore((state) => state.language);
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const setGuestSession = useGuestStore((state) => state.setGuestSession);
  const clearSession = useGuestStore((state) => state.clearSession);
  const hasScannedRef = useRef(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [needsSwitchConfirmation, setNeedsSwitchConfirmation] = useState(false);

  const scanRoomQr = useCallback((forceSwitch = false) => {
    setScanError(null);
    setNeedsSwitchConfirmation(false);

    guestOsService
      .scanQr({ qrCode, currentSessionToken: sessionToken ?? undefined, forceSwitch, locale })
      .then((session) => {
        setGuestSession(session);
        router.replace(language ? "/g/home" : "/g/language");
      })
      .catch((error: unknown) => {
        if (isSessionSwitchRequired(error)) {
          setNeedsSwitchConfirmation(true);
          return;
        }

        if (forceSwitch) {
          clearSession();
        }
        setScanError(getGuestQrErrorKey(error));
      });
  }, [clearSession, language, locale, qrCode, router, sessionToken, setGuestSession]);

  useEffect(() => {
    if (!isHydrated || !qrCode || hasScannedRef.current) {
      return;
    }

    if (RESERVED_GUEST_ROUTES.has(reservedRoute)) {
      router.replace(`/g/${reservedRoute}`);
      return;
    }

    hasScannedRef.current = true;
    void Promise.resolve().then(() => scanRoomQr(false));
  }, [isHydrated, qrCode, reservedRoute, router, scanRoomQr]);

  if (!isHydrated) {
    return <div className="min-h-screen bg-[#fffdfa]" />;
  }

  if (RESERVED_GUEST_ROUTES.has(reservedRoute)) {
    return <div className="min-h-screen bg-[#fffdfa]" />;
  }

  const stateKey = !qrCode ? "missing" : scanError ? "error" : needsSwitchConfirmation ? "switch" : "loading";

  return (
    <AnimatePresence mode="wait">
      <m.div key={stateKey} className="min-h-screen" exit={{ opacity: 0 }} transition={{ duration: guestMotionTokens.duration.fast }}>
        {!qrCode ? (
          <GuestStateCard title={t("qr.unavailable")} message={t("qr.retryMessage")} icon={<VsIcon name="qr_code_scanner" className="text-3xl" />} live="assertive" />
        ) : scanError ? (
          <GuestStateCard title={t(scanError)} message={t("qr.errorMessage")} icon={<VsIcon name="qr_code_scanner" className="text-3xl" />} live="assertive" />
        ) : needsSwitchConfirmation ? (
          <QrSwitchCard onConfirm={() => scanRoomQr(true)} title={t("qr.switchTitle")} message={t("qr.switchMessage")} confirmLabel={t("qr.switchConfirm")} />
        ) : (
          <GuestStateCard
            title={t("qr.opening")}
            message={t("qr.wait")}
            icon={
              <m.span
                animate={prefersReducedMotion ? { opacity: [0.65, 1] } : { rotate: 360 }}
                transition={prefersReducedMotion ? { duration: 0.3 } : { duration: 1.4, repeat: Infinity, ease: "linear" }}
              >
                <VsIcon name="sync" className="text-3xl" />
              </m.span>
            }
            live="polite"
          />
        )}
      </m.div>
    </AnimatePresence>
  );
}
