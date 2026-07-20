import { HttpError } from "@/core/http/http-error";
import { staffManagementService } from "@/features/staff-management/service/staff-management-service-instance";
import { httpErrorResponse, successResponse, unknownServerErrorResponse, validationErrorResponse } from "../../../../_utils";

type Context = { params: Promise<{ hotelId: string; userId: string }> };

async function mutate(method: "assign" | "revoke", context: Context) {
  const { hotelId, userId } = await context.params;
  if (!hotelId.trim() || !userId.trim()) return validationErrorResponse("Phạm vi phân công chưa hợp lệ");
  try {
    const data = method === "assign"
      ? await staffManagementService.assignHotel(hotelId, userId)
      : await staffManagementService.revokeHotel(hotelId, userId);
    return successResponse(data, method === "assign" ? 201 : 200);
  } catch (error) {
    if (error instanceof HttpError) return httpErrorResponse(error);
    return unknownServerErrorResponse();
  }
}

export async function PUT(_request: Request, context: Context) { return mutate("assign", context); }
export async function DELETE(_request: Request, context: Context) { return mutate("revoke", context); }
