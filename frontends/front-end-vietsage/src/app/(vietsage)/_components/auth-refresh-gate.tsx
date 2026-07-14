"use client";

import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { type ReactNode, useEffect, useRef } from "react";

import {
  AUTH_LOGOUT_REQUIRED_EVENT_NAME,
  refreshInternalSession,
} from "@/core/http/internal-session-refresh";

const REFRESH_GATE_EARLY_MS = 2_000;

type AuthRefreshGateProps = {
  accessTokenExpiresAt: number | null;
  children: ReactNode;
};

function loginUrl(pathname: string): string {
  return `/login?reauth=1&callbackUrl=${encodeURIComponent(pathname)}`;
}

async function logoutToLogin(pathname: string): Promise<void> {
  await signOut({
    callbackUrl: loginUrl(pathname),
  });
}

export function AuthRefreshGate({
  accessTokenExpiresAt,
  children,
}: AuthRefreshGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const logoutStartedRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleLogoutRequired(event: Event) {
      if (logoutStartedRef.current) {
        return;
      }

      logoutStartedRef.current = true;

      const detail = event instanceof CustomEvent ? event.detail : null;
      console.warn("[AUTH_LOGOUT_REQUIRED]", {
        pathname,
        reason: detail && typeof detail.reason === "string" ? detail.reason : "unknown",
        sourcePathname: detail && typeof detail.pathname === "string" ? detail.pathname : null,
        timestamp: Date.now(),
      });

      void logoutToLogin(pathname);
    }

    window.addEventListener(AUTH_LOGOUT_REQUIRED_EVENT_NAME, handleLogoutRequired);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_REQUIRED_EVENT_NAME, handleLogoutRequired);
    };
  }, [pathname]);

  useEffect(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (typeof accessTokenExpiresAt !== "number") {
      return;
    }

    async function refreshSession() {
      console.info("[AUTH_REFRESH_GATE_START]", {
        pathname,
        accessTokenExpiresAt,
        timestamp: Date.now(),
      });

      try {
        await refreshInternalSession();
        console.info("[AUTH_REFRESH_GATE_SUCCESS]", {
          pathname,
          timestamp: Date.now(),
        });

        router.refresh();
      } catch (error) {
        console.warn("[AUTH_REFRESH_GATE_FAILED]", {
          pathname,
          errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
          timestamp: Date.now(),
        });

        await logoutToLogin(pathname);
      }
    }

    const delayMs = Math.max(0, accessTokenExpiresAt - Date.now() - REFRESH_GATE_EARLY_MS);
    refreshTimerRef.current = setTimeout(() => {
      void refreshSession();
    }, delayMs);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [accessTokenExpiresAt, pathname, router]);

  return <>{children}</>;
}
