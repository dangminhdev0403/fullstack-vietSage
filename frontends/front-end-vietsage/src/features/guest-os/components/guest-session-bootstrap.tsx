"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { useGuestStore, useGuestStoreHydrated } from "@/features/guest-os/store/guest-store";
import {
  decideGuestSessionValidationError,
  isCurrentGuestSessionValidation,
  isProtectedGuestRoute,
} from "@/features/guest-os/utils/guest-session-bootstrap-policy";
import { clearStoredGuestSession, migrateLegacyGuestSession } from "@/features/guest-os/utils/guest-session-storage";
import { defaultGuestLocale, normalizeGuestLocale } from "@/features/guest-os/i18n/config";

export function GuestSessionBootstrap({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isHydrated = useGuestStoreHydrated();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const language = useGuestStore((state) => state.language);
  const importSessionToken = useGuestStore((state) => state.importSessionToken);
  const refreshSessionSnapshot = useGuestStore((state) => state.refreshSessionSnapshot);
  const clearSession = useGuestStore((state) => state.clearSession);
  const inFlightRef = useRef<{ token: string; request: Promise<void> } | null>(null);
  const migratedRef = useRef(false);
  const [needsRetry, setNeedsRetry] = useState(false);
  const [validatedToken, setValidatedToken] = useState<string | null>(null);
  const protectedRoute = isProtectedGuestRoute(pathname);

  const validate = useCallback(() => {
    const token = useGuestStore.getState().sessionToken;
    if (!token) {
      if (protectedRoute) router.replace("/");
      return Promise.resolve();
    }
    if (inFlightRef.current?.token === token) return inFlightRef.current.request;

    const request = guestOsService.getCurrentSession(token, normalizeGuestLocale(language ?? defaultGuestLocale))
      .then((result) => {
        if (!isCurrentGuestSessionValidation(token, useGuestStore.getState().sessionToken)) return;
        refreshSessionSnapshot(result);
        setNeedsRetry(false);
        setValidatedToken(token);
      })
      .catch((error: unknown) => {
        if (!isCurrentGuestSessionValidation(token, useGuestStore.getState().sessionToken)) return;
        const status = error instanceof HttpError ? error.status : 0;
        if (decideGuestSessionValidationError(status) === "logout") {
          clearSession();
          clearStoredGuestSession();
          setNeedsRetry(false);
          router.replace("/");
          return;
        }
        setNeedsRetry(true);
        setValidatedToken(token);
      })
      .finally(() => {
        if (inFlightRef.current?.token === token) inFlightRef.current = null;
      });
    inFlightRef.current = { token, request };
    return request;
  }, [clearSession, language, protectedRoute, refreshSessionSnapshot, router]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!migratedRef.current) {
      migratedRef.current = true;
      const migratedToken = migrateLegacyGuestSession(window.localStorage, sessionToken);
      if (migratedToken) {
        importSessionToken(migratedToken);
        return;
      }
    }
    if (!protectedRoute) return;
    void validate();
  }, [importSessionToken, isHydrated, protectedRoute, sessionToken, validate]);

  useEffect(() => {
    if (!isHydrated || !protectedRoute) return;
    const revalidate = () => void validate();
    const onVisibilityChange = () => { if (document.visibilityState === "visible") revalidate(); };
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isHydrated, protectedRoute, validate]);

  if (!protectedRoute) return children;
  if (!isHydrated || sessionToken === null || validatedToken !== sessionToken) {
    return <div className="min-h-screen bg-[var(--background)]" aria-busy="true" />;
  }
  if (!needsRetry) return children;
  return (
    <>
      {children}
      <div className="fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-2xl border border-[#d7bd61]/50 bg-[#fffdfa] p-4 text-sm text-[#18211d] shadow-xl" role="status">
        <span>Unable to verify your guest session. Your session is preserved.</span>
        <button type="button" onClick={() => void validate()} className="min-h-11 rounded-xl bg-[#25483f] px-4 font-semibold text-white">Retry</button>
      </div>
    </>
  );
}
