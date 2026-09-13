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
  kbttDeclarationRecordSchema,
  kbttOccupantDeclarationDetailSchema,
  saveKbttDraftPayloadSchema,
} from "@/features/kbtt/types/kbtt-contract";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    hotelId: string;
    occupantId: string;
    action: string;
  }>;
};

const routeParamsSchema = z.object({
  hotelId: z.string().trim().min(1, "Mã khách sạn không hợp lệ."),
  occupantId: z.string().trim().min(1, "Mã khách lưu trú không hợp lệ."),
  action: z.enum(["draft", "ready", "detail"]),
});

function getRawData(response: unknown): unknown {
  return response && typeof response === "object" && "data" in response
    ? (response as { data: unknown }).data
    : response;
}

export async function GET(_request: Request, context: RouteContext) {
  const resolved = await context.params;
  const parsed = routeParamsSchema.safeParse(resolved);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  }
  const { hotelId, occupantId, action } = parsed.data;

  if (action !== "draft" && action !== "detail") {
    return validationErrorResponse("Thao tác GET không hợp lệ cho hành động này.");
  }

  try {
    const result = await executeHotelOpsBackendRequest("get kbtt declaration detail", async (accessToken) => {
      const response = await httpServer.request<unknown>(
        "GET",
        `/hotels/${encodeURIComponent(hotelId)}/kbtt/declarations/${encodeURIComponent(occupantId)}`,
        undefined,
        { accessToken, headers: { "Cache-Control": "no-store" } },
      );
      return kbttOccupantDeclarationDetailSchema.parse(getRawData(response));
    });

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

export async function PUT(request: Request, context: RouteContext) {
  const resolved = await context.params;
  const parsed = routeParamsSchema.safeParse(resolved);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  }
  const { hotelId, occupantId, action } = parsed.data;

  if (action !== "draft") {
    return validationErrorResponse("Chỉ hỗ trợ lưu bản nháp qua hành động draft.");
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return validationErrorResponse("Dữ liệu gửi lên không đúng định dạng JSON.");
  }

  const bodyResult = saveKbttDraftPayloadSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    const issues = bodyResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return validationErrorResponse(`Dữ liệu bản nháp không hợp lệ: ${issues}`);
  }

  try {
    const result = await executeHotelOpsBackendRequest("save kbtt draft", async (accessToken) => {
      const response = await httpServer.request<unknown>(
        "PUT",
        `/hotels/${encodeURIComponent(hotelId)}/kbtt/declarations/${encodeURIComponent(occupantId)}/draft`,
        bodyResult.data,
        { accessToken, headers: { "Cache-Control": "no-store" } },
      );
      return kbttDeclarationRecordSchema.parse(getRawData(response));
    });

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

export async function POST(_request: Request, context: RouteContext) {
  const resolved = await context.params;
  const parsed = routeParamsSchema.safeParse(resolved);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0]?.message ?? "Tham số không hợp lệ.");
  }
  const { hotelId, occupantId, action } = parsed.data;

  if (action !== "ready") {
    return validationErrorResponse("Chỉ hỗ trợ chuyển trạng thái READY qua hành động ready.");
  }

  try {
    const result = await executeHotelOpsBackendRequest("mark kbtt ready", async (accessToken) => {
      const response = await httpServer.request<unknown>(
        "POST",
        `/hotels/${encodeURIComponent(hotelId)}/kbtt/declarations/${encodeURIComponent(occupantId)}/ready`,
        undefined,
        { accessToken, headers: { "Cache-Control": "no-store" } },
      );
      return kbttDeclarationRecordSchema.parse(getRawData(response));
    });

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
