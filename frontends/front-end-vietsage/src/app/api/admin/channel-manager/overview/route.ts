import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { ApiEnvelope } from "@/core/http/api-envelope";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpError } from "@/core/http/http-error";
import { httpServer } from "@/core/http/http-server";
import { readServerSessionTokens } from "@/libs/server-session-tokens";
import { hasAppRole } from "@/libs/rbac";
import {
  httpErrorResponse,
  unauthorizedResponse,
  unknownServerErrorResponse,
} from "../../_utils";
import type {
  AdminChannelOverviewResponse,
} from "@/features/channel-manager/admin/types/admin-channel-manager.types";
import { sanitizeOverviewQuery } from "@/features/channel-manager/admin/api/admin-channel-manager.repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return unauthorizedResponse();
  }

  if (
    !session.activeRoleCode ||
    !hasAppRole([session.activeRoleCode], "admin")
  ) {
    return NextResponse.json(
      {
        status: 403,
        message: "FORBIDDEN",
        data: {
          detail:
            "Chỉ Super Admin / Quản trị viên nền tảng mới có quyền xem tổng quan hạm đội kênh phân phối.",
        },
      },
      { status: 403 },
    );
  }

  const tokens = await readServerSessionTokens();
  if (!tokens.accessToken) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);

    // Forwarding only validated q, state, page, and limit via shared tested sanitizer
    const sanitized = sanitizeOverviewQuery({
      q: searchParams.get("q") ?? undefined,
      state: searchParams.get("state") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const backendQuery: Record<string, string | number> = {
      page: sanitized.page ?? 1,
      limit: sanitized.limit ?? 25,
    };
    if (sanitized.q) backendQuery.q = sanitized.q;
    if (sanitized.state) backendQuery.state = sanitized.state;

    const result = await httpServer.request<
      ApiEnvelope<AdminChannelOverviewResponse>,
      unknown
    >("GET", "/api/v1/channel-manager/admin/overview", undefined, {
      accessToken: tokens.accessToken,
      query: backendQuery,
      timeoutMs: 60_000,
    });

    const envelope = unwrapApiEnvelope<AdminChannelOverviewResponse>(result);

    return NextResponse.json(
      {
        status: envelope.status,
        error: null,
        message: envelope.message,
        data: envelope.data,
      },
      {
        status: envelope.status,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return httpErrorResponse(error);
    }
    return unknownServerErrorResponse(error);
  }
}
