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
import { kbttStaySubmissionResultSchema } from "@/features/kbtt/types/kbtt-contract";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  hotelId: z.string().trim().min(1),
  stayId: z.string().trim().min(1),
});

type RouteContext = {
  params: Promise<{ hotelId: string; stayId: string }>;
};

function rawData(response: unknown): unknown {
  return response && typeof response === "object" && "data" in response
    ? (response as { data: unknown }).data
    : response;
}

export async function POST(_request: Request, context: RouteContext) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success)
    return validationErrorResponse(
      "Mã khách sạn hoặc lượt lưu trú không hợp lệ.",
    );
  const { hotelId, stayId } = parsed.data;

  try {
    const result = await executeHotelOpsBackendRequest(
      "submit all kbtt guests in stay",
      async (accessToken) => {
        const response = await httpServer.request<unknown>(
          "POST",
          `/hotels/${encodeURIComponent(hotelId)}/kbtt/stays/${encodeURIComponent(stayId)}/submit`,
          undefined,
          { accessToken, headers: { "Cache-Control": "no-store" } },
        );
        return kbttStaySubmissionResultSchema.parse(rawData(response));
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
