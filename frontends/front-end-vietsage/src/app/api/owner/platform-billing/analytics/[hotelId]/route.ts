import { resolveConfiguredBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { readServerSessionTokens } from "@/libs/server-session-tokens";
import { refreshAndSaveSessionTokens } from "@/libs/auth-session-refresh";
import { getOwnerAuthTokens } from "../../../_utils";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ hotelId: string }> },
) {
  const resolvedParams = await context.params;
  const hotelId = resolvedParams.hotelId;

  const ownerAuth = await getOwnerAuthTokens();
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  if (!(ownerAuth instanceof Response)) {
    accessToken = ownerAuth.accessToken;
    refreshToken = ownerAuth.refreshToken;
  } else {
    const directTokens = await readServerSessionTokens(request);
    accessToken = directTokens.accessToken;
    refreshToken = directTokens.refreshToken;
  }

  const backendBaseUrl = resolveConfiguredBackendApiBaseUrl({
    AUTH_API_BASE_URL: process.env.AUTH_API_BASE_URL,
    NEXT_PUBLIC_AUTH_API_BASE_URL: process.env.NEXT_PUBLIC_AUTH_API_BASE_URL,
  });

  const searchParams = new URL(request.url).search;
  const url = `${backendBaseUrl}/platform-billing/owner/analytics/${hotelId}${searchParams}`;
  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(url, { method: "GET", headers });

  if (res.status === 401 && refreshToken) {
    try {
      const refreshed = await refreshAndSaveSessionTokens(refreshToken);
      headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
      res = await fetch(url, { method: "GET", headers });
    } catch {
      // ignore retry failure and return original response
    }
  }

  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
