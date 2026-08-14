import { HttpError } from "@/core/http/http-error";
import { guestOsService } from "@/features/guest-os/service/guest-os-service-instance";
import { normalizeGuestLocale } from "@/features/guest-os/i18n/config";
import type {
  CreateMarketplaceOrderInput,
  MarketplaceCategory,
  MarketplaceOrder,
  MarketplaceServiceItem,
  MarketplaceServicesPage,
} from "@/features/marketplace/types/marketplace-contract";
import {
  getBearerToken,
  guestHttpErrorResponse,
  guestSuccessResponse,
  guestUnknownErrorResponse,
  guestValidationErrorResponse,
  readJsonBody,
} from "../../_utils";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  const pathParts = (await context.params).path;
  const key = pathParts.join("/");
  const locale = normalizeGuestLocale(request.headers.get("x-lang") ?? request.headers.get("accept-language"));

  try {
    if (key === "categories") {
      const data = await guestOsService.listMarketplaceCategories<MarketplaceCategory[]>(token, locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    }

    if (key === "services") {
      const categoryId = new URL(request.url).searchParams.get("categoryId") || undefined;
      const data = await guestOsService.listMarketplaceServices<MarketplaceServicesPage>(token, categoryId, locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    }

    if (pathParts[0] === "services" && pathParts[1]) {
      const data = await guestOsService.getMarketplaceServiceDetail<MarketplaceServiceItem>(token, pathParts[1], locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    }

    if (key === "orders") {
      const data = await guestOsService.listMarketplaceOrders<MarketplaceOrder[]>(token, locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    }

    if (pathParts[0] === "orders" && pathParts[1]) {
      const data = await guestOsService.getMarketplaceOrderDetail<MarketplaceOrder>(token, pathParts[1], locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    }

    if (pathParts[0] === "cart") {
      const subpath = pathParts.slice(1).join("/");
      const data = subpath
        ? await guestOsService.mutateMarketplaceCart(token, "GET", subpath, undefined, locale)
        : await guestOsService.getMarketplaceCart(token, locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    }

    return guestValidationErrorResponse("unsupported marketplace path");
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}

export async function POST(request: Request, context: Context) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  const pathParts = (await context.params).path;
  const key = pathParts.join("/");
  const locale = normalizeGuestLocale(request.headers.get("x-lang") ?? request.headers.get("accept-language"));

  try {
    if (key === "orders") {
      const body = (await readJsonBody(request)) as CreateMarketplaceOrderInput | null;
      if (!body) return guestValidationErrorResponse("invalid JSON body");
      const data = await guestOsService.createMarketplaceOrder<MarketplaceOrder, CreateMarketplaceOrderInput>(token, body, locale);
      return guestSuccessResponse({ status: 201, error: null, message: "OK", data }, 201);
    }

    if (key === "cart/checkout") {
      const body = await readJsonBody(request);
      const data = await guestOsService.checkoutMarketplaceCart(token, body, locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    }

    if (pathParts[0] === "cart") {
      const body = await readJsonBody(request);
      const subpath = pathParts.slice(1).join("/");
      const data = await guestOsService.mutateMarketplaceCart(token, "POST", subpath, body, locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    }

    return guestValidationErrorResponse("unsupported marketplace path");
  } catch (error) {
    return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
  }
}

export async function PUT(request: Request, context: Context) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  const pathParts = (await context.params).path;
  const locale = normalizeGuestLocale(request.headers.get("x-lang") ?? request.headers.get("accept-language"));

  if (pathParts[0] === "cart") {
    try {
      const body = await readJsonBody(request);
      const subpath = pathParts.slice(1).join("/");
      const data = await guestOsService.mutateMarketplaceCart(token, "PUT", subpath, body, locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    } catch (error) {
      return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
    }
  }
  return guestValidationErrorResponse("unsupported marketplace path");
}

export async function PATCH(request: Request, context: Context) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  const pathParts = (await context.params).path;
  const locale = normalizeGuestLocale(request.headers.get("x-lang") ?? request.headers.get("accept-language"));

  if (pathParts[0] === "cart") {
    try {
      const body = await readJsonBody(request);
      const subpath = pathParts.slice(1).join("/");
      const data = await guestOsService.mutateMarketplaceCart(token, "PATCH", subpath, body, locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    } catch (error) {
      return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
    }
  }
  return guestValidationErrorResponse("unsupported marketplace path");
}

export async function DELETE(request: Request, context: Context) {
  const token = getBearerToken(request);
  if (!token) return guestValidationErrorResponse("sessionToken is required");
  const pathParts = (await context.params).path;
  const locale = normalizeGuestLocale(request.headers.get("x-lang") ?? request.headers.get("accept-language"));

  if (pathParts[0] === "cart") {
    try {
      const subpath = pathParts.slice(1).join("/");
      const data = await guestOsService.mutateMarketplaceCart(token, "DELETE", subpath, undefined, locale);
      return guestSuccessResponse({ status: 200, error: null, message: "OK", data });
    } catch (error) {
      return error instanceof HttpError ? guestHttpErrorResponse(error) : guestUnknownErrorResponse();
    }
  }
  return guestValidationErrorResponse("unsupported marketplace path");
}
