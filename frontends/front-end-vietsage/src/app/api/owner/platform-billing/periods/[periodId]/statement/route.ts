import { resolveConfiguredBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  const resolvedParams = await context.params;
  const periodId = resolvedParams.periodId;
  const tokens = await readServerSessionTokens();
  const backendBaseUrl = resolveConfiguredBackendApiBaseUrl({
    AUTH_API_BASE_URL: process.env.AUTH_API_BASE_URL,
    NEXT_PUBLIC_AUTH_API_BASE_URL: process.env.NEXT_PUBLIC_AUTH_API_BASE_URL,
  });

  const url = `${backendBaseUrl}/platform-billing/owner/periods/${periodId}/statement`;
  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }

  const res = await fetch(url, { method: "GET", headers });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
