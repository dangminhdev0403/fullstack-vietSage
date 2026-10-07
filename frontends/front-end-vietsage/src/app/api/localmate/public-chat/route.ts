import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { CHAT_UPSTREAM_TIMEOUT_MS, getChatUpstreamError } from "@/app/api/guest/chat/chat-upstream";
import { httpServer } from "@/core/http/http-server";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { LOCALMATE_COOKIE_OPTIONS, LOCALMATE_SESSION_COOKIE } from "../_lib/session-cookie";
import { consumePublicChatQuotas, resolvePublicChatRateKey } from "./rate-limit";
import {
  mintedProposalsSchema,
  n8nResponseSchema,
  payloadSchema,
  selectedProposalSchema,
} from "./payload-schema";

async function ensureSession(location: string) {
  const cookieStore = await cookies();
  const previousToken = cookieStore.get(LOCALMATE_SESSION_COOKIE)?.value;
  const response = await httpServer.post<unknown>(
    "/public/localmate/sessions",
    { location },
    previousToken ? { headers: { "x-public-localmate-token": previousToken } } : undefined,
  );
  const session = unwrapApiEnvelope<{ token: string; sessionId: string; expiresAt: string }>(
    response,
  ).data;
  cookieStore.set(LOCALMATE_SESSION_COOKIE, session.token, LOCALMATE_COOKIE_OPTIONS);
  return session.token;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 16_384) {
    return NextResponse.json({ status: 413, message: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const cookieStore = await cookies();
  const cookieSessionToken = cookieStore.get(LOCALMATE_SESSION_COOKIE)?.value;
  const quota = consumePublicChatQuotas([
    resolvePublicChatRateKey(request),
    resolvePublicChatRateKey(request, cookieSessionToken),
  ]);
  if (!quota.allowed) {
    return NextResponse.json(
      { status: 429, message: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSeconds) } },
    );
  }

  const rawBody = await request.text();
  if (rawBody.length > 16_384) {
    return NextResponse.json({ status: 413, message: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(rawBody);
  } catch {}
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: 400, message: "INVALID_CHAT_PAYLOAD" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_UPSTREAM_TIMEOUT_MS);
  try {
    const sessionToken = await ensureSession(parsed.data.location);

    if (parsed.data.actionType === "SELECT_PROPOSAL" && parsed.data.selection?.proposalKey) {
      const selected = selectedProposalSchema.safeParse(
        unwrapApiEnvelope<unknown>(
          await httpServer.post(
            `/public/localmate/proposals/${encodeURIComponent(parsed.data.selection.proposalKey)}/select`,
            {},
            { headers: { "x-public-localmate-token": sessionToken } },
          ),
        ).data,
      );
      if (!selected.success) {
        console.error("[public-chat] Selected proposal validation error:", selected.error.issues);
        return NextResponse.json(
          { status: 502, message: "INVALID_PROPOSAL_SELECTION_RESPONSE" },
          { status: 502, headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        {
          status: 200,
          reply: "Dạ, em đã ghi nhận lịch trình Quý khách chọn. Kính mời Quý khách chọn Hướng dẫn viên đồng hành bên dưới để hoàn tất đặt tour ạ:",
          suggestions: [],
          action: null,
          stage: selected.data.stage,
          proposals: [selected.data.proposal],
          actions: selected.data.actions,
          knowledgeVersion: "server",
          cached: false,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const webhookUrl = process.env.LOCALMATE_PUBLIC_N8N_WEBHOOK_URL?.trim();
    const webhookSecret = process.env.LOCALMATE_N8N_WEBHOOK_SECRET?.trim();
    if (!webhookUrl || !webhookSecret) {
      return NextResponse.json(
        { status: 503, message: "CHAT_SERVICE_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VietSage-Chat-Key": webhookSecret,
      },
      body: JSON.stringify({
        message: parsed.data.message,
        location: parsed.data.location,
        language: parsed.data.language,
        history: parsed.data.history,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { status: 502, message: "CHAT_UPSTREAM_ERROR" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const data = n8nResponseSchema.safeParse(await upstream.json().catch(() => null));
    if (!data.success) {
      console.error("[public-chat] Upstream validation error:", data.error.issues);
      return NextResponse.json(
        { status: 502, message: "CHAT_UPSTREAM_INVALID_RESPONSE" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const minted = mintedProposalsSchema.safeParse(
      unwrapApiEnvelope<unknown>(
        await httpServer.post(
          "/public/localmate/proposals",
          {
            query: parsed.data.message,
            tourCodes: data.data.proposalRefs.map((item) => item.tourCode),
          },
          { headers: { "x-public-localmate-token": sessionToken } },
        ),
      ).data,
    );
    if (!minted.success) {
      console.error("[public-chat] Minted proposals validation error:", minted.error.issues);
      return NextResponse.json(
        { status: 502, message: "INVALID_PROPOSAL_RESPONSE" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const hasProposals = minted.data.proposals && minted.data.proposals.length > 0;
    return NextResponse.json(
      {
        status: 200,
        reply: hasProposals ? "" : data.data.reply,
        suggestions: data.data.suggestions,
        action: null,
        stage: minted.data.stage,
        proposals: minted.data.proposals,
        actions: minted.data.actions,
        knowledgeVersion: minted.data.knowledgeVersion,
        cached: data.data.cached,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const upstreamError = getChatUpstreamError(error);
    return NextResponse.json(
      upstreamError ?? { status: 502, message: "CHAT_UPSTREAM_ERROR" },
      {
        status: upstreamError?.status ?? 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
