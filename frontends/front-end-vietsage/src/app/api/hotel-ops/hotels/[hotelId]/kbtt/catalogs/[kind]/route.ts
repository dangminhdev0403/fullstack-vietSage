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
  kbttCatalogKindSchema,
  kbttCatalogListSchema,
} from "@/features/kbtt/types/kbtt-contract";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ hotelId: string; kind: string }>;
};

const paramsSchema = z.object({
  hotelId: z.string().trim().min(1, "Mã khách sạn không hợp lệ."),
  kind: kbttCatalogKindSchema,
});

export async function GET(request: Request, context: RouteContext) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0]?.message ?? "Danh mục không hợp lệ.");
  }

  const parentCode = new URL(request.url).searchParams.get("parentCode")?.trim();
  const query = parentCode ? `?parentCode=${encodeURIComponent(parentCode)}` : "";

  try {
    const result = await executeHotelOpsBackendRequest("kbtt_catalog", async (accessToken) => {
      const response = await httpServer.request<unknown>(
        "GET",
        `/hotels/${encodeURIComponent(parsed.data.hotelId)}/kbtt/catalogs/${parsed.data.kind}${query}`,
        undefined,
        { accessToken, headers: { "Cache-Control": "no-store" } },
      );
      return response && typeof response === "object" && "data" in response
        ? (response as { data: unknown }).data
        : response;
    });
    if (result instanceof NextResponse) return result;
    return NextResponse.json({
      status: 200,
      error: null,
      message: "OK",
      data: kbttCatalogListSchema.parse(result),
    });
  } catch (error) {
    if (error instanceof HttpError) return hotelOpsHttpErrorResponse(error);
    return unknownServerErrorResponse(error);
  }
}
