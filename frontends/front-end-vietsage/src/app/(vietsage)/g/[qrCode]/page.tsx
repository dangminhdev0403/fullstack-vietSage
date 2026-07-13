"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { VsIcon } from "../../_components/vs-icon";
import { HttpError } from "@/core/http/http-error";
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

function QrStateCard({ title, message, isLoading = false }: { title: string; message: string; isLoading?: boolean }) {
  return (
    <main className="vs-guest-readable grid min-h-screen place-items-center bg-[#fffdfa] px-5 text-center text-[#121a35]">
      <section className="max-w-md rounded-[28px] border border-[#e8edf5] bg-white p-8 shadow-[0_24px_70px_rgba(7,17,42,0.16)]">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#061437] text-[#f0b447]">
          <VsIcon name={isLoading ? "sync" : "qr_code_scanner"} className={`text-3xl ${isLoading ? "animate-spin [animation-duration:1.8s]" : ""}`} />
        </div>
        <h1 className="vs-display text-3xl font-semibold text-[#061437]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#667085]">{message}</p>
      </section>
    </main>
  );
}

function QrSwitchCard({ onConfirm, title, message, confirmLabel }: { onConfirm: () => void; title: string; message: string; confirmLabel: string }) {
  return (
    <main className="vs-guest-readable grid min-h-screen place-items-center bg-[#fffdfa] px-5 text-center text-[#121a35]">
      <section className="max-w-md rounded-[28px] border border-[#e8edf5] bg-white p-8 shadow-[0_24px_70px_rgba(7,17,42,0.16)]">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-[#061437] text-[#f0b447]">
          <VsIcon name="meeting_room" className="text-3xl" />
        </div>
        <h1 className="vs-display text-3xl font-semibold text-[#061437]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#667085]">{message}</p>
        <button
          type="button"
          onClick={onConfirm}
          className="mt-6 rounded-full bg-[#061437] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(6,20,55,0.24)]"
        >
          {confirmLabel}
        </button>
      </section>
    </main>
  );
}

export default function GuestQrEntryPage() {
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

  if (!qrCode) {
    return <QrStateCard title={t("qr.unavailable")} message={t("qr.retryMessage")} />;
  }

  if (scanError) {
    return <QrStateCard title={t(scanError)} message={t("qr.errorMessage")} />;
  }

  if (needsSwitchConfirmation) {
    return <QrSwitchCard onConfirm={() => scanRoomQr(true)} title={t("qr.switchTitle")} message={t("qr.switchMessage")} confirmLabel={t("qr.switchConfirm")} />;
  }

  return <QrStateCard title={t("qr.opening")} message={t("qr.wait")} isLoading />;
}
