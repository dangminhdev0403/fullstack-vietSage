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

const bulkReservationSchema = z
  .object({
    leadGuestName: z
      .string()
      .trim()
      .min(2, "Tên người đại diện / trưởng đoàn tối thiểu 2 ký tự")
      .max(120),
    checkInDate: z.string().trim().min(1, "Ngày nhận phòng không hợp lệ"),
    checkOutDate: z.string().trim().min(1, "Ngày trả phòng không hợp lệ"),
    roomIds: z
      .array(z.string().trim().min(1, "Mã phòng không hợp lệ"))
      .min(2, "Cần chọn tối thiểu 2 phòng để đặt hàng loạt")
      .max(50, "Chỉ được chọn tối đa 50 phòng trong một lần đặt")
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Danh sách phòng không được trùng lặp",
      }),
  })
  .strict()
  .refine(
    (data) => {
      const inTime = new Date(data.checkInDate).getTime();
      const outTime = new Date(data.checkOutDate).getTime();
      return !isNaN(inTime) && !isNaN(outTime) && inTime < outTime;
    },
    {
      message: "Thời gian nhận phòng phải trước thời gian trả phòng",
      path: ["checkOutDate"],
    },
  );

export async function POST(request: Request, context: Params) {
  const { hotelId } = await context.params;
  if (!hotelId) return validationErrorResponse("hotelId is required");

  const parsed = bulkReservationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error.issues[0]?.message ||
        "Thông tin đặt phòng hàng loạt không hợp lệ",
    );
  }

  try {
    const data = await executeHotelOpsBackendRequest(
      "create bulk reservations",
      async (accessToken) => {
        return await hotelOpsService.createBulkReservations(
          hotelId,
          {
            leadGuestName: parsed.data.leadGuestName,
            checkInDate: parsed.data.checkInDate,
            checkOutDate: parsed.data.checkOutDate,
            roomIds: parsed.data.roomIds,
          },
          accessToken,
        );
      },
    );

    if (data instanceof Response) return data;
    return successResponse(data, 201, "Đã tạo đặt phòng hàng loạt thành công");
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      const errorData =
        error.data && typeof error.data === "object"
          ? (error.data as Record<string, unknown>)
          : {};
      const rawRoomIds =
        errorData.unavailableRoomIds ??
        errorData.conflictRoomIds ??
        errorData.roomIds ??
        [];
      const unavailableRoomIds = Array.isArray(rawRoomIds) ? rawRoomIds : [];
      const detail =
        (errorData.detail as string) ||
        (errorData.message as string) ||
        "Một số phòng đã chọn không khả dụng hoặc bị xung đột lịch trong khoảng thời gian này.";

      return Response.json(
        {
          status: 409,
          message: "BULK_RESERVATION_CONFLICT",
          data: {
            detail,
            code: "BULK_RESERVATION_CONFLICT",
            actionable: true,
            suggestedAction: "CHANGE_ROOMS_OR_DATES",
            unavailableRoomIds,
            ...errorData,
          },
        },
        { status: 409 },
      );
    }

    return error instanceof HttpError
      ? hotelOpsHttpErrorResponse(error)
      : unknownServerErrorResponse(error);
  }
}
