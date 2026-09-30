import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { ApiEnvelope } from "@/core/http/api-envelope";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpError } from "@/core/http/http-error";
import type { HttpMethod, HttpQuery } from "@/core/http/http-client";
import { httpServer } from "@/core/http/http-server";
import { readServerSessionTokens } from "@/libs/server-session-tokens";
import { hasAppRole } from "@/libs/rbac";
import {
  httpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "../../../_utils";

export { validationErrorResponse };

export async function readJsonBody(
  request: Request,
): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return validationErrorResponse("Invalid JSON payload");
  }
}

export async function proxyAdminChannelManagerRequest<T>(input: {
  operation: string;
  method: HttpMethod;
  path: string;
  body?: unknown;
  query?: HttpQuery;
}): Promise<Response> {
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
            "Chỉ Super Admin / Quản trị viên nền tảng mới có quyền cấu hình Channel Manager.",
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
    const result = await httpServer.request<ApiEnvelope<T>, unknown>(
      input.method,
      input.path,
      input.body,
      {
        accessToken: tokens.accessToken,
        query: input.query,
        timeoutMs: 60_000,
      },
    );
    const envelope = unwrapApiEnvelope<T>(result);
    return successResponse(envelope.data, envelope.status, envelope.message);
  } catch (error) {
    if (error instanceof HttpError) return httpErrorResponse(error);
    return unknownServerErrorResponse(error);
  }
}

export function channelManagerBackendPath(
  hotelId: string,
  suffix: string,
): string {
  return `/api/v1/channel-manager/hotels/${encodeURIComponent(hotelId)}/${suffix}`;
}
