import { z } from "zod";
import { HttpError } from "@/core/http/http-error";
import { hotelOpsService } from "@/features/hotel-ops/service/hotel-ops-service-instance";
import { addDaysYmd, getVietnamToday } from "@/libs/vietnam-temporal";
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

const listArrivalsQuerySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  includeOverdue: z.preprocess((val) => val === "true" || val === true, z.boolean().optional()),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export async function GET(request: Request, context: Params) {
  const paramsResult = paramsSchema.safeParse(await context.params);
  if (!paramsResult.success) {
    return validationErrorResponse(paramsResult.error.issues[0]?.message || "Thiếu mã khách sạn (hotelId)");
  }
  const { hotelId } = paramsResult.data;

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());
  const parsed = listArrivalsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error.issues[0]?.message || "Tham số truy vấn danh sách khách đặt trước không hợp lệ");
  }

  const { from, to, includeOverdue, q, page, limit } = parsed.data;

  const todayVn = getVietnamToday();
  const resolvedTo = to || (!q ? addDaysYmd(todayVn, 7) : undefined);

  try {
    const data = await executeHotelOpsBackendRequest("list arrivals", (accessToken) =>
      hotelOpsService.listArrivals(hotelId, {
        query: {
          ...(from
            ? { from }
            : !includeOverdue && !q
              ? { from: todayVn }
              : {}),
          ...(resolvedTo ? { to: resolvedTo } : {}),
          ...(includeOverdue ? { includeOverdue: true } : {}),
          ...(q ? { q } : {}),
          page,
          limit,
        },
        accessToken,
      }),
    );
    if (data instanceof Response) return data;
    return successResponse(data, 200, "Lấy danh sách khách đặt trước thành công");
  } catch (error) {
    return error instanceof HttpError ? hotelOpsHttpErrorResponse(error) : unknownServerErrorResponse();
  }
}
