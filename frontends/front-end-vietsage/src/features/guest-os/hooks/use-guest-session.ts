"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { HttpError } from "@/core/http/http-error";
import { defaultGuestLocale, normalizeGuestLocale } from "@/features/guest-os/i18n/config";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { useGuestStore } from "@/features/guest-os/store/guest-store";
import type { GuestCurrentSessionResult } from "@/features/guest-os/types/guest-os-contract";
import {
  decideGuestSessionValidationError,
  isCurrentGuestSessionValidation,
} from "@/features/guest-os/utils/guest-session-bootstrap-policy";
import { clearStoredGuestSession } from "@/features/guest-os/utils/guest-session-storage";

export type GuestSessionState = {
  sessionToken: string | null;
  currentSession: GuestCurrentSessionResult | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  close: () => Promise<void>;
};

export function useGuestSession(): GuestSessionState {
  const router = useRouter();
  const sessionToken = useGuestStore((state) => state.sessionToken);
  const language = useGuestStore((state) => state.language);
  const clearSession = useGuestStore((state) => state.clearSession);
  const refreshSessionSnapshot = useGuestStore((state) => state.refreshSessionSnapshot);
  const locale = normalizeGuestLocale(language ?? defaultGuestLocale);
  const [currentSession, setCurrentSession] = useState<GuestCurrentSessionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await guestOsService.getCurrentSession(sessionToken, locale);
      if (!isCurrentGuestSessionValidation(sessionToken, useGuestStore.getState().sessionToken)) return;
      refreshSessionSnapshot(result);
      setCurrentSession(result);
    } catch (caught) {
      if (!isCurrentGuestSessionValidation(sessionToken, useGuestStore.getState().sessionToken)) return;
      const status = caught instanceof HttpError ? caught.status : 0;
      if (decideGuestSessionValidationError(status) === "logout") {
        clearSession();
        clearStoredGuestSession();
        router.replace("/");
      } else {
        setError("Unable to verify the guest session. Please retry.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [clearSession, locale, refreshSessionSnapshot, router, sessionToken]);

  const close = useCallback(async () => {
    if (sessionToken) {
      try { await guestOsService.closeSession(sessionToken, locale); } catch { /* Always finish local close. */ }
    }
    clearSession();
    clearStoredGuestSession();
    setCurrentSession(null);
    router.replace("/");
  }, [clearSession, locale, router, sessionToken]);

  return { sessionToken, currentSession, isLoading, error, refresh, close };
}
