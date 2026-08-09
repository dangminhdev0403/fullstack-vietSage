import { z } from "zod";
import { executeHotelOpsBackendRequest, hotelOpsHttpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "@/app/api/hotel-ops/_utils";
import { HttpError } from "@/core/http/http-error";
import { localPartnersServerClient } from "@/features/local-partners/service/local-partners.client-instance";

const inputSchema = z.object({ categoryId: z.string().min(1), name: z.string().trim().min(2), address: z.string().trim().min(3), description: z.string().trim().optional(), distanceMeters: z.number().int().nonnegative().optional(), phone: z.string().trim().optional(), zaloUrl: z.url().optional(), websiteUrl: z.url().optional(), googleMapUrl: z.url().optional(), coverImageUrl: z.url().optional(), operatingHours: z.string().trim().optional(), isFeatured: z.boolean().optional() }).strict();
type Params = { params: Promise<{ hotelId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { hotelId } = await params;
  try {
    const data = await executeHotelOpsBackendRequest("list local partners", (token) => localPartnersServerClient.list(hotelId, token));
    return data instanceof Response ? data : successResponse(data);
  } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}

export async function POST(request: Request, { params }: Params) {
  const { hotelId } = await params;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Thông tin đối tác không hợp lệ.");
  try {
    const data = await executeHotelOpsBackendRequest("create local partner", (token) => localPartnersServerClient.create(hotelId, parsed.data, token));
    return data instanceof Response ? data : successResponse(data, 201);
  } catch (error) { return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse(); }
}
