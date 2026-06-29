"use client";

import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { requestInternalApiEnvelope } from "@/core/http/internal-api-client";

const REFRESH_GATE_EARLY_MS = 10_000;
const AUTH_LOGOUT_REQUIRED_EVENT = "vietsage:auth:logout-required";

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
  const refreshStartedRef = useRef(false);
  const logoutStartedRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    function handleLogoutRequired(event: Event) {
      if (logoutStartedRef.current) {
        return;
      }

      logoutStartedRef.current = true;
      setIsRefreshing(true);

      const detail = event instanceof CustomEvent ? event.detail : null;
      console.warn("[AUTH_LOGOUT_REQUIRED]", {
        pathname,
        reason: detail && typeof detail.reason === "string" ? detail.reason : "unknown",
        sourcePathname: detail && typeof detail.pathname === "string" ? detail.pathname : null,
        timestamp: Date.now(),
      });

      void logoutToLogin(pathname);
    }

    window.addEventListener(AUTH_LOGOUT_REQUIRED_EVENT, handleLogoutRequired);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_REQUIRED_EVENT, handleLogoutRequired);
    };
  }, [pathname]);

  useEffect(() => {
    const shouldRefresh =
      typeof accessTokenExpiresAt === "number" &&
      accessTokenExpiresAt <= Date.now() + REFRESH_GATE_EARLY_MS;

    if (!shouldRefresh || refreshStartedRef.current) {
      return;
    }

    refreshStartedRef.current = true;
    setIsRefreshing(true);

    async function refreshSession() {
      console.info("[AUTH_REFRESH_GATE_START]", {
        pathname,
        accessTokenExpiresAt,
        timestamp: Date.now(),
      });

      try {
        const payload = await requestInternalApiEnvelope<{ accessTokenExpiresAt: number }>("/api/auth/refresh-session", {
          method: "POST",
        });

        if ((payload as { ok?: unknown }).ok !== true) {
          throw new Error(`Session refresh failed with status ${payload.status}`);
        }

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
      } finally {
        setIsRefreshing(false);
      }
    }

    void refreshSession();
  }, [accessTokenExpiresAt, pathname, router]);

  if (isRefreshing) {
    return null;
  }

  return <>{children}</>;
}
