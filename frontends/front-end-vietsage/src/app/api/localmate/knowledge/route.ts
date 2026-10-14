import { NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";

export const dynamic = "force-dynamic";

const KNOWLEDGE_KEY_HEADER = "x-vietsage-knowledge-key";

function resolveKnowledgeKey(request: Request): string | undefined {
  return (
    request.headers.get(KNOWLEDGE_KEY_HEADER) ||
    request.headers.get("X-VietSage-Knowledge-Key") ||
    process.env.LOCALMATE_KNOWLEDGE_API_KEY
  );
}

export async function POST(request: Request) {
  const apiKey = resolveKnowledgeKey(request);
  if (!apiKey) {
    return NextResponse.json(
      {
        status: 401,
        message: "UNAUTHORIZED",
        data: { detail: "Thiếu header X-VietSage-Knowledge-Key" },
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const backendUrl = `${getBackendApiBaseUrl()}/localmate/knowledge`;

  try {
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VietSage-Knowledge-Key": apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);
    return NextResponse.json(data, {
      status: res.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 502,
        message: "UPSTREAM_ERROR",
        data: { detail: error instanceof Error ? error.message : "Backend unavailable" },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function GET(request: Request) {
  const apiKey = resolveKnowledgeKey(request);
  if (!apiKey) {
    return NextResponse.json(
      {
        status: 401,
        message: "UNAUTHORIZED",
        data: { detail: "Thiếu header X-VietSage-Knowledge-Key" },
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const backendUrl = new URL(`${getBackendApiBaseUrl()}/localmate/knowledge`);
  backendUrl.search = url.search;

  try {
    const res = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: {
        "X-VietSage-Knowledge-Key": apiKey,
      },
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);
    return NextResponse.json(data, {
      status: res.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 502,
        message: "UPSTREAM_ERROR",
        data: { detail: error instanceof Error ? error.message : "Backend unavailable" },
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
