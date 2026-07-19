import "server-only";

import type { Session } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { HttpError } from "@/core/http/http-error";
import { hasAppRole } from "@/lib/rbac";
import { requireRefreshableServerSession } from "@/lib/server-session-tokens";

export async function requireOwnerServerTokens(callbackUrl: `/${string}`) {
  return requireRefreshableServerSession(callbackUrl, "owner-auth");
}

export function redirectOwnerToLogin(callbackUrl: `/${string}`, reason: string): never {
  console.info("[AUTH_REDIRECT_LOGIN_SOURCE]", {
    source: "owner-auth",
    reason,
    pathname: callbackUrl,
  });

  redirect(`/login?reauth=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
}

export function assertCanAccessOwner(session: Session | null, callbackUrl: `/${string}`): asserts session is Session {
  if (!session?.user) {
    redirectOwnerToLogin(callbackUrl, "no_session");
  }

  if (session.authError) {
    redirectOwnerToLogin(callbackUrl, "auth_error");
  }

  if (!session.activeRoleCode) {
    redirectOwnerToLogin(callbackUrl, "active_role_missing");
  }

  if (!hasAppRole([session.activeRoleCode], "tenant_owner")) {
    notFound();
  }
}

export function ownerAccessMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 403) {
      return "Không có quyền truy cập.";
    }

    if (error.status === 404) {
      return "Không tìm thấy khách sạn hoặc bạn không có quyền truy cập.";
    }
  }

  return "Không thể tải dữ liệu. Vui lòng thử lại.";
}
