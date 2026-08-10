import { resolveConfiguredBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ hotelId: string }> },
) {
  const resolvedParams = await context.params;
  const hotelId = resolvedParams.hotelId;
  const tokens = await readServerSessionTokens();
  const backendBaseUrl = resolveConfiguredBackendApiBaseUrl({
    AUTH_API_BASE_URL: process.env.AUTH_API_BASE_URL,
    NEXT_PUBLIC_AUTH_API_BASE_URL: process.env.NEXT_PUBLIC_AUTH_API_BASE_URL,
  });

  const searchParams = new URL(request.url).search;
  const url = `${backendBaseUrl}/platform-billing/owner/analytics/${hotelId}${searchParams}`;
  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }

  const res = await fetch(url, { method: "GET", headers });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
