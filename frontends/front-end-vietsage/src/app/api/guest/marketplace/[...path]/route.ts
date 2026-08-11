import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import type { CreateMarketplaceOrderInput, MarketplaceCategory, MarketplaceOrder, MarketplaceServicesPage } from "@/features/marketplace/types/marketplace-contract";
import { getBearerToken, guestHttpErrorResponse, guestSuccessResponse, guestUnknownErrorResponse, guestValidationErrorResponse, readJsonBody } from "../../_utils";

const allowed = new Set(["categories", "services", "orders"]);
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  const key = (await context.params).path.join("/");
  if (!allowed.has(key)) return guestValidationErrorResponse("unsupported marketplace path");
  try {
    const data = key === "categories"
      ? await guestOsService.listMarketplaceCategories<MarketplaceCategory[]>(token)
      : key === "orders"
        ? await guestOsService.listMarketplaceOrders<MarketplaceOrder[]>(token)
        : await guestOsService.listMarketplaceServices<MarketplaceServicesPage>(token, new URL(request.url).searchParams.get("categoryId") || undefined);
    return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}

export async function POST(request: Request, context: Context) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  if ((await context.params).path.join("/") !== "orders") return guestValidationErrorResponse("unsupported marketplace path");
  const body = await readJsonBody(request) as CreateMarketplaceOrderInput | null;
  if (!body) return guestValidationErrorResponse("invalid JSON body");
  try {
    const data = await guestOsService.createMarketplaceOrder<MarketplaceOrder, CreateMarketplaceOrderInput>(token, body);
    return guestSuccessResponse({ status: 201, error: null, message: "OK", data }, 201);
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}
