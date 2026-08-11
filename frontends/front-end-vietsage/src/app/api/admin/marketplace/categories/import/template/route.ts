import { executeHotelOpsBackendRequest } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { marketplaceAdminClient } from "@/features/marketplace-admin/client";
import { httpErrorResponse, unknownServerErrorResponse } from "../../../../_utils";

export async function GET() {
  try {
    const csvContent = await executeHotelOpsBackendRequest("marketplace import template", (token) =>
      marketplaceAdminClient.importTemplate(token),
    );
    if (csvContent instanceof Response) return csvContent;
    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="marketplace_categories_template.csv"',
      },
    });
  } catch (error) {
    return error instanceof HttpError ? httpErrorResponse(error) : unknownServerErrorResponse();
  }
}
