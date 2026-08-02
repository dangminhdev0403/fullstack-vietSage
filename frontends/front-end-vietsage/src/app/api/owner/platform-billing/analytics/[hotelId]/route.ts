import { auth } from "@/auth";
import { resolveConfiguredBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ hotelId: string }> },
) {
  const resolvedParams = await context.params;
  const hotelId = resolvedParams.hotelId;
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const backendBaseUrl = resolveConfiguredBackendApiBaseUrl({
    AUTH_API_BASE_URL: process.env.AUTH_API_BASE_URL,
    NEXT_PUBLIC_AUTH_API_BASE_URL: process.env.NEXT_PUBLIC_AUTH_API_BASE_URL,
  });

  const url = `${backendBaseUrl}/platform-billing/owner/analytics/${hotelId}`;
  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }

  const res = await fetch(url, { method: "GET", headers });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
