import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import { httpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../../../../_utils";

type Context = { params: Promise<{ hotelId: string; userId: string }> };
const scopeSchema = z.object({ mode: z.enum(["ALL", "FLOORS", "ROOMS"]), floors: z.array(z.string().trim().min(1)).max(100), roomIds: z.array(z.string().trim().min(1)).max(2000), label: z.string().trim().max(80).nullable() }).strict();

export async function PUT(request: Request, context: Context) {
  const { hotelId, userId } = await context.params;
  if (!hotelId?.trim() || !userId?.trim()) return validationErrorResponse("Phạm vi phân công chưa hợp lệ");
  const parsed = scopeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationErrorResponse("Phạm vi phân công chưa hợp lệ");
  try {
    const result = await staffManagementService.updateHousekeepingScope(hotelId, userId, parsed.data, undefined, request.headers.get("x-tenant-id")?.trim());
    return successResponse(result, 200, "Đã cập nhật phân công buồng phòng");
  } catch (error) {
    if (error instanceof HttpError) return httpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}
