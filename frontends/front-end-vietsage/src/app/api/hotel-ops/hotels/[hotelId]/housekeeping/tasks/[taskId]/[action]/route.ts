import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import {
  executeHotelOpsBackendRequest,
  hotelOpsHttpErrorResponse,
  successResponse,
  unknownServerErrorResponse,
  validationErrorResponse,
} from "@/app/api/hotel-ops/_utils";

type Params = { params: Promise<{ hotelId: string; taskId: string; action: string }> };
const bodySchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export async function POST(request: Request, context: Params) {
  const { hotelId, taskId, action } = await context.params;
  if (!hotelId || !taskId || !["claim", "start", "block", "complete", "reopen"].includes(action)) {
    return validationErrorResponse("Thao tác công việc buồng phòng không hợp lệ");
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || (action === "block" && !parsed.data.reason)) {
    return validationErrorResponse("Dữ liệu thao tác công việc buồng phòng không hợp lệ");
  }
  try {
    const data = await executeHotelOpsBackendRequest(`housekeeping task ${action}`, (accessToken) =>
      hotelOpsService.transitionHousekeepingTask(hotelId, taskId, action as "claim" | "start" | "block" | "complete" | "reopen", parsed.data, { accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Cập nhật công việc buồng phòng thành công");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
