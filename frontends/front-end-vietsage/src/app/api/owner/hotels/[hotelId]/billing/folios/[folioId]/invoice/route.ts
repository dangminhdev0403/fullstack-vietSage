import { billingService } from "@/features/billing/service/billing-service-instance";
import {
  executeOwnerBackendRequest,
  ownerHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
} from "@/app/api/owner/_utils";
import { HttpError } from "@/core/http/http-error";

type Params = {
  params: Promise<{ hotelId: string; folioId: string }> | { hotelId: string; folioId: string };
};

export async function POST(_request: Request, context: Params) {
  try {
    const { hotelId, folioId } = await Promise.resolve(context.params);
    const invoice = await executeOwnerBackendRequest("issue owner billing invoice", (accessToken) =>
      billingService.issueInvoice(hotelId, folioId, { accessToken }),
    );

    return successResponse(invoice, 201, "Invoice issued successfully");
  } catch (error) {
    if (error instanceof HttpError) {
      return ownerHttpErrorResponse(error);
    }

    return unknownServerErrorResponse();
  }
}
