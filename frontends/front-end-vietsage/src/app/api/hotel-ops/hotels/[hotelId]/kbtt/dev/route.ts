import { NextResponse } from "next/server";
import { z } from "zod";

import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { httpServer } from "@/core/http/http-server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ hotelId: string }>;
};

const hotelIdSchema = z.string().trim().min(1, "Mã khách sạn không hợp lệ.");

function getRawData(response: unknown): unknown {
  return response && typeof response === "object" && "data" in response
    ? (response as { data: unknown }).data
    : response;
}

export async function POST(request: Request, context: RouteContext) {
  const { hotelId: rawHotelId } = await context.params;
  const hotelIdResult = hotelIdSchema.safeParse(rawHotelId);
  if (!hotelIdResult.success) {
    return validationErrorResponse(
      hotelIdResult.error.issues[0]?.message ?? "Mã khách sạn không hợp lệ.",
    );
  }
  const hotelId = hotelIdResult.data;

  const url = new URL(request.url);
  const actionParam = url.searchParams.get("action");

  let rawBody: Record<string, unknown> = {};
  try {
    const json = await request.json();
    if (json && typeof json === "object") {
      rawBody = json as Record<string, unknown>;
    }
  } catch {
    // Empty body is acceptable for simple reset
  }

  const action = actionParam || (rawBody.action as string) || "reset";

  if (action === "reset") {
    try {
      const result = await executeHotelOpsBackendRequest(
        "dev reset kbtt declarations",
        async (accessToken) => {
          const response = await httpServer.request<unknown>(
            "POST",
            `/hotels/${encodeURIComponent(hotelId)}/kbtt/dev/reset-declarations`,
            {
              generateNewIdentityNumbers: Boolean(
                rawBody.generateNewIdentityNumbers,
              ),
            },
            { accessToken, headers: { "Cache-Control": "no-store" } },
          );
          return getRawData(response);
        },
      );

      if (result instanceof Response) {
        result.headers.set("Cache-Control", "no-store");
        return result;
      }

      return NextResponse.json(
        { status: 200, error: null, message: "OK", data: result },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof HttpError) {
        const response = hotelOpsHttpErrorResponse(error);
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      const response = unknownServerErrorResponse(error);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  }

  if (action === "update-occupants") {
    const occupants = rawBody.occupants;
    if (!Array.isArray(occupants) || occupants.length === 0) {
      return validationErrorResponse(
        "Danh sách khách cần can thiệp (occupants) không được để trống.",
      );
    }

    try {
      const result = await executeHotelOpsBackendRequest(
        "dev update kbtt occupants",
        async (accessToken) => {
          const response = await httpServer.request<unknown>(
            "POST",
            `/hotels/${encodeURIComponent(hotelId)}/kbtt/dev/update-occupants`,
            { occupants },
            { accessToken, headers: { "Cache-Control": "no-store" } },
          );
          return getRawData(response);
        },
      );

      if (result instanceof Response) {
        result.headers.set("Cache-Control", "no-store");
        return result;
      }

      return NextResponse.json(
        { status: 200, error: null, message: "OK", data: result },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof HttpError) {
        const response = hotelOpsHttpErrorResponse(error);
        response.headers.set("Cache-Control", "no-store");
        return response;
      }
      const response = unknownServerErrorResponse(error);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  }

  return validationErrorResponse(
    "Hành động không hợp lệ. Chỉ hỗ trợ 'reset' hoặc 'update-occupants'.",
  );
}
