import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "../../../../../_utils";

type Params = {
  params: Promise<{ hotelId: string }>;
};

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  let body: { spreadsheetUrl?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await executeOwnerBackendRequest(
      "preview owner service catalog import from Google Sheets",
      (accessToken) =>
        hotelOpsService.previewServiceCatalogImport(
          hotelId,
          { spreadsheetUrl: body.spreadsheetUrl!, mode: body.mode },
          { accessToken },
        ),
    );

    if (result instanceof Response) return result;
    return successResponse(result, 200, "Preview service catalog import successfully");
  } catch (error) {
    if (error instanceof HttpError) return ownerHttpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
