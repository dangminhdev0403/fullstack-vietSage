"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { defaultGuestLocale, normalizeGuestLocale } from "@/features/guest-os/i18n/config";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { useGuestStore } from "@/features/guest-os/store/guest-store";
import type { GuestCurrentSessionResult } from "@/features/guest-os/types/guest-os-contract";
import {
  clearStoredGuestSession,
  getStoredGuestSession,
  setStoredGuestSession,
  type StoredGuestSession,
} from "@/features/guest-os/utils/guest-session-storage";

export type GuestSessionState = {
  storedSession: StoredGuestSession | null;
  currentSession: GuestCurrentSessionResult | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  close: () => Promise<void>;
};

export function useGuestSession(options: { redirectOnMissing?: boolean; validateCurrentSession?: boolean } = {}): GuestSessionState {
  const { redirectOnMissing = true, validateCurrentSession = true } = options;
  const router = useRouter();
  const language = useGuestStore((state) => state.language);
  const locale = normalizeGuestLocale(language ?? defaultGuestLocale);
  const [storedSession, setStoredSession] = useState<StoredGuestSession | null>(null);
  const [currentSession, setCurrentSession] = useState<GuestCurrentSessionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const redirectToFallback = useCallback(() => {
    if (redirectOnMissing) {
      router.replace("/");
    }
  }, [redirectOnMissing, router]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const stored = getStoredGuestSession();
    if (!stored) {
      setStoredSession(null);
      setCurrentSession(null);
      setIsLoading(false);
      redirectToFallback();
      return;
    }

    if (!validateCurrentSession) {
      setStoredSession(stored);
      setCurrentSession(null);
      setIsLoading(false);
      return;
    }

    try {
      const result = await guestOsService.getCurrentSession(stored.sessionToken, locale);
      setStoredGuestSession(stored);
      setStoredSession(stored);
      setCurrentSession(result);
    } catch {
      clearStoredGuestSession();
      setStoredSession(null);
      setCurrentSession(null);
      setError("Phiên khách đã hết hạn hoặc không hợp lệ.");
      redirectToFallback();
    } finally {
      setIsLoading(false);
    }
  }, [locale, redirectToFallback, validateCurrentSession]);

  const close = useCallback(async () => {
    const stored = getStoredGuestSession();
    if (stored) {
      try {
        await guestOsService.closeSession(stored.sessionToken, locale);
      } catch {
        // Local cleanup is still the correct client-side action if the backend session is already invalid.
      }
    }

    clearStoredGuestSession();
    setStoredSession(null);
    setCurrentSession(null);
    router.replace("/");
  }, [locale, router]);

  useEffect(() => {
    void Promise.resolve().then(() => refresh());
  }, [refresh]);

  return {
    storedSession,
    currentSession,
    isLoading,
    error,
    refresh,
    close,
  };
}
