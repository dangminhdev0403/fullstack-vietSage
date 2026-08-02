import { auth } from "@/auth";
import { resolveConfiguredBackendApiBaseUrl } from "@/core/http/backend-api-config";
import { readServerSessionTokens } from "@/libs/server-session-tokens";

export const dynamic = "force-dynamic";

async function proxyToNest(request: Request, params: { path: string[] }) {
  const session = await auth();
  const tokens = await readServerSessionTokens();
  const subPath = params.path.join("/");
  const backendBaseUrl = resolveConfiguredBackendApiBaseUrl({
    AUTH_API_BASE_URL: process.env.AUTH_API_BASE_URL,
    NEXT_PUBLIC_AUTH_API_BASE_URL: process.env.NEXT_PUBLIC_AUTH_API_BASE_URL,
  });

  const url = `${backendBaseUrl}/platform-billing/${subPath}`;
  const headers = new Headers();
  headers.set("Accept", "application/json");

  if (tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("Content-Type", "application/json");
    body = await request.text();
  }

  const res = await fetch(url, {
    method: request.method,
    headers,
    body: body ? body : undefined,
  });

  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await context.params;
  return proxyToNest(request, resolvedParams);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await context.params;
  return proxyToNest(request, resolvedParams);
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await context.params;
  return proxyToNest(request, resolvedParams);
}
