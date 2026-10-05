import { NextResponse } from "next/server";
import { z } from "zod";

import { CHAT_UPSTREAM_TIMEOUT_MS, getChatUpstreamError } from "@/app/api/guest/chat/chat-upstream";
import { consumePublicChatQuota } from "./rate-limit";
import { parsePublicChatAction } from "./public-chat-action";
import { payloadSchema } from "./payload-schema";

const upstreamSchema = z.object({
  status: z.coerce.number().optional(),
  reply: z.string().trim().min(1),
  suggestions: z
    .array(z.object({ label: z.string().trim().min(1), query: z.string().trim().min(1) }))
    .max(3)
    .optional()
    .default([]),
  knowledgeVersion: z.string().optional().default("unknown"),
  cached: z.boolean().optional().default(false),
  action: z.unknown().optional(),
});

function clientKey(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim();
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 16_384) {
    return NextResponse.json({ status: 413, message: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const quota = consumePublicChatQuota(clientKey(request));
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

  const webhookUrl = process.env.LOCALMATE_PUBLIC_N8N_WEBHOOK_URL?.trim();
  const webhookSecret = process.env.LOCALMATE_N8N_WEBHOOK_SECRET?.trim();
  if (!webhookUrl || !webhookSecret) {
    return NextResponse.json({ status: 503, message: "CHAT_SERVICE_UNAVAILABLE" }, { status: 503 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VietSage-Chat-Key": webhookSecret,
      },
      body: JSON.stringify(parsed.data),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({ status: 502, message: "CHAT_UPSTREAM_ERROR" }, { status: 502 });
    }

    const data = upstreamSchema.safeParse(await upstream.json().catch(() => null));
    if (!data.success) {
      return NextResponse.json({ status: 502, message: "CHAT_UPSTREAM_INVALID_RESPONSE" }, { status: 502 });
    }

    return NextResponse.json({
      status: 200,
      ...data.data,
      action: parsePublicChatAction(data.data.action),
    });
  } catch (error) {
    const upstreamError = getChatUpstreamError(error);
    return NextResponse.json(
      upstreamError ?? { status: 502, message: "CHAT_UPSTREAM_ERROR" },
      { status: upstreamError?.status ?? 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
