import type { ApiEnvelope } from "@/core/http/api-envelope";
import { unwrapApiEnvelope } from "@/core/http/api-envelope";
import { HttpError } from "@/core/http/http-error";
import type { HttpMethod, HttpQuery } from "@/core/http/http-client";
import { httpServer } from "@/core/http/http-server";
import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
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

export async function proxyChannelManagerRequest<T>(input: {
  operation: string;
  method: HttpMethod;
  path: string;
  body?: unknown;
  query?: HttpQuery;
}): Promise<Response> {
  try {
    const result = await executeOwnerBackendRequest(
      input.operation,
      (accessToken) =>
        httpServer.request<ApiEnvelope<T>, unknown>(
          input.method,
          input.path,
          input.body,
          {
            accessToken,
            query: input.query,
            timeoutMs: 60_000,
          },
        ),
      ["tenant_owner", "admin", "staff"],
    );
    if (result instanceof Response) return result;

    const envelope = unwrapApiEnvelope<T>(result);
    return successResponse(envelope.data, envelope.status, envelope.message);
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}

export function channelManagerBackendPath(
  hotelId: string,
  suffix: string,
): string {
  return `/api/v1/channel-manager/hotels/${encodeURIComponent(hotelId)}/${suffix}`;
}
