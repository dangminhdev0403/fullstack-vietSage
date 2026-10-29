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

const bulkAllocationSchema = z
  .object({
    roomTypeId: z.string().trim().min(1, "Mã loại phòng không hợp lệ"),
    quantity: z
      .number()
      .int("Số lượng phòng phải là số nguyên")
      .min(1, "Số lượng phòng tối thiểu là 1")
      .max(50, "Số lượng phòng tối đa là 50"),
    rate: z.union([z.number(), z.string()]).nullable().optional(),
    nightlyRateSnapshot: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .strict();

const chargeLineSchema = z.object({
  lineType: z.enum(["ROOM_NIGHT", "EXTRA"]),
  serviceDate: z.string().trim().optional(),
  serviceItemId: z.string().trim().optional(),
  nameSnapshot: z.string().trim().min(1),
  codeSnapshot: z.string().trim().optional(),
  quantity: z.number().int().min(1).default(1),
  unitPriceSnapshot: z.number().nonnegative(),
  taxAmountSnapshot: z.number().nonnegative().default(0),
  discountAmountSnapshot: z.number().nonnegative().default(0),
  totalSnapshot: z.number().nonnegative(),
  currency: z.string().trim().default("VND"),
});

const bulkReservationSchema = z
  .object({
    leadGuestName: z
      .string()
      .trim()
      .min(2, "Tên người đại diện / trưởng đoàn tối thiểu 2 ký tự")
      .max(120),
    leadGuestPhone: z.string().trim().max(40).optional(),
    checkInDate: z.string().trim().min(1, "Ngày nhận phòng không hợp lệ"),
    checkOutDate: z.string().trim().min(1, "Ngày trả phòng không hợp lệ"),
    roomIds: z
      .array(z.string().trim().min(1, "Mã phòng không hợp lệ"))
      .min(1, "Cần chọn tối thiểu 1 phòng")
      .max(50, "Chỉ được chọn tối đa 50 phòng trong một lần đặt")
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Danh sách phòng không được trùng lặp",
      })
      .optional(),
    allocations: z.array(bulkAllocationSchema).min(1).max(20).optional(),
    autoAssign: z.boolean().optional(),
    rate: z.union([z.number(), z.string()]).nullable().optional(),
    nightlyRateSnapshot: z.union([z.number(), z.string()]).nullable().optional(),
    roomRates: z.record(z.string(), z.union([z.number(), z.string()]).nullable()).optional(),
    groupCode: z.string().trim().max(80).optional(),
    groupName: z.string().trim().max(120).optional(),
    notes: z.string().optional(),
    chargeLines: z.array(chargeLineSchema).optional(),
    sourceCategory: z.enum(["DIRECT", "OTA", "TA", "TRAVEL_AGENCY", "CORPORATE", "OTHER"]).optional(),
    sourcePartnerId: z.string().trim().min(1).nullable().optional(),
    bookingOwnerUserId: z.string().trim().min(1).nullable().optional(),
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
  )
  .refine(
    (data) => {
      const hasRoomIds = Boolean(data.roomIds && data.roomIds.length > 0);
      const hasAllocations = Boolean(data.allocations && data.allocations.length > 0);
      return hasRoomIds || hasAllocations;
    },
    {
      message: "Cần chọn phòng cụ thể hoặc nhập số lượng theo loại phòng",
      path: ["roomIds"],
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
            ...(parsed.data.leadGuestPhone ? { leadGuestPhone: parsed.data.leadGuestPhone } : {}),
            checkInDate: parsed.data.checkInDate.includes("T")
              ? parsed.data.checkInDate
              : `${parsed.data.checkInDate}T14:00:00+07:00`,
            checkOutDate: parsed.data.checkOutDate.includes("T")
              ? parsed.data.checkOutDate
              : `${parsed.data.checkOutDate}T12:00:00+07:00`,
            ...(parsed.data.roomIds ? { roomIds: parsed.data.roomIds } : {}),
            ...(parsed.data.allocations ? { allocations: parsed.data.allocations } : {}),
            ...(parsed.data.autoAssign !== undefined ? { autoAssign: parsed.data.autoAssign } : {}),
            ...(parsed.data.rate !== undefined ? { rate: parsed.data.rate } : {}),
            ...(parsed.data.nightlyRateSnapshot !== undefined
              ? { nightlyRateSnapshot: parsed.data.nightlyRateSnapshot }
              : {}),
            ...(parsed.data.roomRates ? { roomRates: parsed.data.roomRates } : {}),
            ...(parsed.data.groupCode ? { groupCode: parsed.data.groupCode } : {}),
            ...(parsed.data.groupName ? { groupName: parsed.data.groupName } : {}),
            ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
            ...(parsed.data.chargeLines ? { chargeLines: parsed.data.chargeLines } : {}),
            ...(parsed.data.sourceCategory ? { sourceCategory: parsed.data.sourceCategory } : {}),
            ...(parsed.data.sourcePartnerId ? { sourcePartnerId: parsed.data.sourcePartnerId } : {}),
            ...(parsed.data.bookingOwnerUserId ? { bookingOwnerUserId: parsed.data.bookingOwnerUserId } : {}),
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
