import { z } from "zod";
import { executeHotelOpsBackendRequest } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { adminService } from "@/features/admin/service/admin-service-instance";
import { marketplaceAdminClient } from "@/features/marketplace-admin/client";
import type { MarketplaceAdminAction } from "@/features/marketplace-admin/types";
import { httpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../_utils";

const category = z.object({ action: z.literal("category"), input: z.object({ nameVi: z.string().trim().min(2).max(120), nameEn: z.string().trim().min(2).max(120), sortOrder: z.number().int(), isActive: z.boolean() }) });
const tenant = z.object({ action: z.literal("tenant"), input: z.object({ name: z.string().trim().min(2).max(160), displayName: z.string().trim().min(2).max(160), owner: z.object({ email: z.string().email(), fullName: z.string().trim().min(2).max(120), password: z.string().min(8).max(128) }) }) });
const link = z.object({ action: z.literal("link"), hotelId: z.string().min(1), serviceTenantId: z.string().min(1) });
const actionSchema = z.discriminatedUnion("action", [category, tenant, link]);

export async function GET() {
  try {
    const data = await executeHotelOpsBackendRequest("marketplace admin data", async (token) => {
      const [categories, tenants, hotelsPage] = await Promise.all([marketplaceAdminClient.categories(token), marketplaceAdminClient.tenants(token), adminService.listHotels({ query: { page: 1, limit: 100 }, accessToken: token })]);
      const links = (await Promise.all(hotelsPage.items.map((hotel) => marketplaceAdminClient.links(token, hotel.id)))).flat();
      return { categories, tenants, hotels: hotelsPage.items, links };
    });
    return data instanceof Response ? data : successResponse(data);
  } catch (error) { return error instanceof HttpError ? httpErrorResponse(error) : unknownServerErrorResponse(); }
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Marketplace payload is invalid");
  const action: MarketplaceAdminAction = parsed.data;
  try {
    const data = await executeHotelOpsBackendRequest("marketplace admin mutation", (token) => action.action === "category" ? marketplaceAdminClient.category(token, action.input) : action.action === "tenant" ? marketplaceAdminClient.tenant(token, action.input) : marketplaceAdminClient.link(token, action.hotelId, action.serviceTenantId));
    return data instanceof Response ? data : successResponse(data, 201);
  } catch (error) { return error instanceof HttpError ? httpErrorResponse(error) : unknownServerErrorResponse(); }
}
