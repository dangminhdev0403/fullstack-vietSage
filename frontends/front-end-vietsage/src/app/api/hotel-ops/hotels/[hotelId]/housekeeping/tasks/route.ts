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

type Params = { params: Promise<{ hotelId: string }> };

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(100),
  status: z.enum(["QUEUED", "CLAIMED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]).optional(),
  priority: z.enum(["NORMAL", "URGENT"]).optional(),
  roomId: z.string().trim().min(1).optional(),
  assignedToUserId: z.string().trim().min(1).optional(),
}).strict();

const createSchema = z.object({
  roomId: z.string().trim().min(1),
  priority: z.enum(["NORMAL", "URGENT"]).optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export async function GET(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("Thiếu mã khách sạn");
  const raw = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return validationErrorResponse("Tham số công việc buồng phòng không hợp lệ");
  try {
    const data = await executeHotelOpsBackendRequest("list housekeeping tasks", (accessToken) =>
      hotelOpsService.listHousekeepingTasks(hotelId, { query: parsed.data, accessToken }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Lấy danh sách công việc buồng phòng thành công");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!hotelId || !parsed.success) return validationErrorResponse("Dữ liệu tạo công việc buồng phòng không hợp lệ");
  try {
    const data = await executeHotelOpsBackendRequest("create housekeeping task", (accessToken) =>
      hotelOpsService.createHousekeepingTask(hotelId, parsed.data, accessToken),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 201, "Tạo công việc buồng phòng thành công");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
