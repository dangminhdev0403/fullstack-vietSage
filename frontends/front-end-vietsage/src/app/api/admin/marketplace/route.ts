import { z } from "zod";
import { executeHotelOpsBackendRequest } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";

import { marketplaceAdminClient } from "@/features/marketplace-admin/client";
import type { MarketplaceAdminAction } from "@/features/marketplace-admin/types";
import { httpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../_utils";

const category = z.object({ action: z.literal("category"), input: z.object({ nameVi: z.string().trim().min(2).max(120), sortOrder: z.number().int(), isActive: z.boolean(), translations: z.record(z.string(), z.string().trim().min(1).max(120)).optional() }) });
const tenant = z.object({ action: z.literal("tenant"), input: z.object({ displayName: z.string().trim().min(2).max(160), categoryId: z.string().min(1), googleSheetsUrl: z.string().trim().max(500).optional(), owner: z.object({ email: z.string().email(), fullName: z.string().trim().min(2).max(120), password: z.string().min(8).max(128) }) }) });
const updateCategory = z.object({ action: z.literal("updateCategory"), id: z.string().min(1), input: z.object({ nameVi: z.string().trim().min(1).max(120).optional(), isActive: z.boolean().optional(), translations: z.record(z.string(), z.string().trim().min(1).max(120)).optional() }) });
const updateTenant = z.object({ action: z.literal("updateTenant"), id: z.string().min(1), input: z.object({ displayName: z.string().trim().min(1).max(160).optional(), categoryId: z.string().min(1).optional(), googleSheetsUrl: z.string().trim().max(500).optional(), status: z.string().trim().min(1).max(40).optional(), owner: z.object({ email: z.string().email().optional(), fullName: z.string().trim().min(2).max(120).optional(), password: z.string().min(8).max(128).optional() }).optional() }) });
const previewImport = z.object({ action: z.literal("previewImport"), spreadsheetUrl: z.string().trim().url() });
const commitImport = z.object({ action: z.literal("commitImport"), spreadsheetUrl: z.string().trim().url(), expectedHash: z.string().regex(/^[a-f0-9]{64}$/) });
const deleteCategory = z.object({ action: z.literal("deleteCategory"), id: z.string().min(1) });
const actionSchema = z.discriminatedUnion("action", [category, tenant, updateCategory, deleteCategory, updateTenant, previewImport, commitImport]);

export async function GET() {
  try {
    const data = await executeHotelOpsBackendRequest("marketplace admin data", async (token) => {
      const [categories, tenants] = await Promise.all([marketplaceAdminClient.categories(token), marketplaceAdminClient.tenants(token)]);
      return { categories, tenants };
    });
    return data instanceof Response ? data : successResponse(data);
  } catch (error) { return error instanceof HttpError ? httpErrorResponse(error) : unknownServerErrorResponse(); }
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Marketplace payload is invalid");
  const action: MarketplaceAdminAction = parsed.data;
  try {
    const data = await executeHotelOpsBackendRequest("marketplace admin mutation", (token) => {
      switch (action.action) {
        case "category": return marketplaceAdminClient.category(token, action.input);
        case "tenant": return marketplaceAdminClient.tenant(token, action.input);
        case "updateCategory": return marketplaceAdminClient.updateCategory(token, action.id, action.input);
        case "deleteCategory": return marketplaceAdminClient.deleteCategory(token, action.id);
        case "updateTenant": return marketplaceAdminClient.updateTenant(token, action.id, action.input);
        case "previewImport": return marketplaceAdminClient.previewImport(token, action.spreadsheetUrl);
        case "commitImport": return marketplaceAdminClient.commitImport(token, action.spreadsheetUrl, action.expectedHash);
      }
    });
    return data instanceof Response ? data : successResponse(data, 200);
  } catch (error) { return error instanceof HttpError ? httpErrorResponse(error) : unknownServerErrorResponse(); }
}
