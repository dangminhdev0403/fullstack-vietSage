import { executeOwnerBackendRequest, ownerHttpErrorResponse, unknownServerErrorResponse } from "../../../../../_utils";
import { HttpError } from "@/core/http/http-error";
import { getBackendApiBaseUrl } from "@/core/http/backend-api-config";

type Params = {
  params: Promise<{ hotelId: string }>;
};

export async function GET(_request: Request, context: Params) {
  const { hotelId } = await context.params;
  try {
    const csvContent = await executeOwnerBackendRequest("hotel service catalog template", async (token) => {
      const response = await fetch(
        `${getBackendApiBaseUrl()}/hotels/${encodeURIComponent(hotelId)}/service-catalog/import/template`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new HttpError({
          message: "Failed to download template",
          status: response.status,
          requestUrl: response.url,
          data: await response.text(),
        });
      }
      return response.text();
    });

    if (csvContent instanceof Response) return csvContent;
    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="hotel_services_catalog_template.csv"',
      },
    });
  } catch (error) {
    return error instanceof HttpError ? ownerHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
