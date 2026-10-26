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
import {
  kbttDailyMovementsQuerySchema,
  kbttDailyMovementsResponseSchema,
} from "@/features/kbtt/types/kbtt-contract";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ hotelId: string }>;
};

const hotelIdSchema = z.string().trim().min(1, "Mã khách sạn không hợp lệ.");

export async function GET(request: Request, context: RouteContext) {
  const { hotelId: rawHotelId } = await context.params;
  const hotelIdResult = hotelIdSchema.safeParse(rawHotelId);
  if (!hotelIdResult.success) {
    return validationErrorResponse(
      hotelIdResult.error.issues[0]?.message ?? "Mã khách sạn không hợp lệ.",
    );
  }
  const hotelId = hotelIdResult.data;

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());
  const queryResult = kbttDailyMovementsQuerySchema.safeParse(rawQuery);
  if (!queryResult.success) {
    return validationErrorResponse(
      queryResult.error.issues[0]?.message ?? "Tham số truy vấn không hợp lệ.",
    );
  }
  const { date, kind, q, page, limit } = queryResult.data;

  try {
    const result = await executeHotelOpsBackendRequest(
      "list kbtt daily movements",
      async (accessToken) => {
        const query = new URLSearchParams({
          date,
          kind,
          page: String(page),
          limit: String(limit),
        });
        if (q) query.set("q", q);
        const backendPath = `/hotels/${encodeURIComponent(hotelId)}/kbtt/daily-movements?${query.toString()}`;
        const response = await httpServer.request<unknown>(
          "GET",
          backendPath,
          undefined,
          { accessToken, headers: { "Cache-Control": "no-store" } },
        );
        const rawData =
          response && typeof response === "object" && "data" in response
            ? (response as { data: unknown }).data
            : response;

        return kbttDailyMovementsResponseSchema.parse(rawData);
      },
    );

    if (result instanceof Response) {
      result.headers.set("Cache-Control", "no-store");
      return result;
    }

    return NextResponse.json(
      {
        status: 200,
        error: null,
        message: "OK",
        data: result,
      },
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
