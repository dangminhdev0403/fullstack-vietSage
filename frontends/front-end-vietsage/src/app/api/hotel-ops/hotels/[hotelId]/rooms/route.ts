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

type Params = {
  params: Promise<{ hotelId: string }>;
};

const paramsSchema = z.object({
  hotelId: z.string().trim().min(1, "Thiếu mã khách sạn (hotelId)"),
});

const listRoomsQuerySchema = z.object({
  page: z.coerce.number({ message: "Trang phải là số" }).int("Trang phải là số nguyên").positive("Trang phải lớn hơn 0").default(1),
  limit: z.coerce.number({ message: "Số lượng phải là số" }).int("Số lượng phải là số nguyên").positive("Số lượng phải lớn hơn 0").max(100, "Tối đa 100 phòng mỗi trang").default(20),
  q: z.string().trim().optional(),
  status: z.string().trim().optional(),
  floor: z.string().trim().optional(),
  type: z.string().trim().optional(),
  vipOnly: z.preprocess((val) => val === "true" || val === true, z.boolean().optional()),
});

export async function GET(request: Request, context: Params) {
  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return validationErrorResponse(paramsResult.error.issues[0]?.message || "Thiếu mã khách sạn (hotelId)");
  }
  const { hotelId } = paramsResult.data;

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());
  const parsed = listRoomsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0]?.message || "Tham số truy vấn danh sách phòng không hợp lệ");
  }

  const { page, limit, q, status, floor, type, vipOnly } = parsed.data;

  try {
    const data = await executeHotelOpsBackendRequest("list staff rooms", (accessToken) =>
      hotelOpsService.listRooms(hotelId, {
        query: {
          page,
          limit,
          ...(q ? { q } : {}),
          ...(status ? { status } : {}),
          ...(floor ? { floor } : {}),
          ...(type ? { type } : {}),
          ...(vipOnly ? { vipOnly } : {}),
        },
        accessToken,
      }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Lấy danh sách phòng thành công");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
