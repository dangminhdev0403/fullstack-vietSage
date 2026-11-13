import { RoomQRCodeStatus, RoomStatus } from "@prisma/client";
import { z } from "zod";
import { todayYmd } from "../../../../common/time/vietnam-temporal";

function preprocessRoomStatus(val: unknown): unknown {
  if (typeof val !== "string" || !val.trim()) return val;
  const upper = val.trim().toUpperCase();
  if (
    upper === "CLEAN" ||
    upper === "CLEANED" ||
    upper === "READY" ||
    upper === "TRỐNG" ||
    upper === "AVAILABLE"
  )
    return RoomStatus.AVAILABLE;
  if (upper === "DIRTY" || upper === "CHỜ DỌN" || upper === "CLEANING" || upper === "PROCESSING")
    return RoomStatus.PROCESSING;
  if (upper === "BẢO TRÌ" || upper === "MAINTENANCE") return RoomStatus.MAINTENANCE;
  if (upper === "KHÓA" || upper === "ĐÃ KHÓA" || upper === "BLOCKED")
    return RoomStatus.BLOCKED;
  if (upper === "OUT_OF_SERVICE") return RoomStatus.OUT_OF_SERVICE;
  return upper;
}

export function normalizeDateStringToIso(str?: string | null): string | undefined {
  const value = str?.trim();
  if (!value) return undefined;
  const candidates: string[] = [];
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(value);
  const dmy = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(value);
  if (iso) candidates.push(`${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`);
  if (dmy) candidates.push(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
  if (/^\d{8}$/.test(value)) {
    candidates.push(`${value.slice(4)}-${value.slice(2, 4)}-${value.slice(0, 2)}`);
    candidates.push(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`);
  }
  return candidates.find((candidate) => z.string().date().safeParse(candidate).success);
}

export const birthDateSchema = z.string().trim().max(20, "Ngày sinh tối đa 20 ký tự")
  .optional()
  .transform((value) => value
    ? (/^\d{4}$/.test(value) ? value : (normalizeDateStringToIso(value) ?? value))
    : undefined)
  .pipe(z.union([
    z.string().date("Ngày sinh không hợp lệ"),
    z.string().regex(/^\d{4}$/, "Năm sinh không hợp lệ").refine((value) => Number(value) >= 1900, "Năm sinh không hợp lệ"),
  ])
    .refine((value) => value <= (value.length === 4 ? todayYmd().slice(0, 4) : todayYmd()), "Ngày sinh không được ở tương lai")
    .optional());

export const roomStatusSchema = z.preprocess(
  preprocessRoomStatus,
  z.nativeEnum(RoomStatus, { message: "Trạng thái phòng không hợp lệ" }),
);

export const roomTypeNameSchema = z.string().trim().min(1).max(80);
export const basePriceSchema = z.number().finite().positive().max(9_999_999_999.99);
export const roomMaxOccupancySchema = z.coerce
  .number({ message: "Sức chứa phải là số" })
  .int("Sức chứa phải là số nguyên")
  .min(1, "Sức chứa tối thiểu là 1 người")
  .max(50, "Sức chứa tối đa là 50 người");

export const createRoomTypeBodySchema = z
  .object({
    name: roomTypeNameSchema,
    basePrice: basePriceSchema,
    maxOccupancy: roomMaxOccupancySchema.nullable().optional(),
  })
  .strict();
export const updateRoomTypePriceBodySchema = z
  .object({
    basePrice: basePriceSchema.optional(),
    maxOccupancy: roomMaxOccupancySchema.nullable().optional(),
  })
  .strict()
  .refine((data) => data.basePrice !== undefined || data.maxOccupancy !== undefined, {
    message: "Cần ít nhất giá cơ sở hoặc sức chứa để cập nhật",
  });

export const createRoomBodySchema = z
  .object({
    roomNumber: z
      .string({ message: "Số phòng là bắt buộc" })
      .trim()
      .min(1, "Số phòng không được để trống")
      .max(40, "Số phòng tối đa 40 ký tự"),
    floor: z.string().trim().max(40, "Tên tầng tối đa 40 ký tự").optional(),
    zone: z.string().trim().max(80, "Tên khu vực tối đa 80 ký tự").nullable().optional(),
    type: roomTypeNameSchema.optional(),
    roomTypeId: z.string().trim().min(1).optional(),
    newRoomType: createRoomTypeBodySchema.optional(),
    price: z.coerce
      .number({ message: "Giá phòng phải là số" })
      .finite()
      .nonnegative("Giá phòng không được là số âm")
      .max(9_999_999_999.99)
      .optional(),
    maxActiveGuestDevices: z.coerce
      .number({ message: "Số thiết bị phải là số" })
      .int("Số thiết bị phải là số nguyên")
      .min(1, "Tối thiểu 1 thiết bị")
      .optional(),
  })
  .strict()
  .refine(
    (value) => [value.type, value.roomTypeId, value.newRoomType].filter(Boolean).length === 1,
    {
      message: "Chọn một loại phòng có sẵn hoặc nhập tên và giá loại phòng mới",
      path: ["roomTypeId"],
    },
  );

export const createRoomsBodySchema = z
  .object({
    items: z
      .array(createRoomBodySchema, { message: "Danh sách phòng là bắt buộc" })
      .min(1, "Cần ít nhất một phòng")
      .max(100, "Tối đa 100 phòng"),
  })
  .strict();

export const updateRoomBodySchema = z
  .object({
    roomNumber: z
      .string()
      .trim()
      .min(1, "Số phòng không được để trống")
      .max(40, "Số phòng tối đa 40 ký tự")
      .optional(),
    floor: z.string().trim().max(40, "Tên tầng tối đa 40 ký tự").nullable().optional(),
    zone: z.string().trim().max(80, "Tên khu vực tối đa 80 ký tự").nullable().optional(),
    type: z.string().trim().max(80, "Loại phòng tối đa 80 ký tự").nullable().optional(),
    roomTypeId: z.string().trim().min(1).optional(),
    price: z.coerce
      .number({ message: "Giá phòng phải là số" })
      .finite()
      .nonnegative("Giá phòng không được là số âm")
      .max(9_999_999_999.99)
      .nullable()
      .optional(),
    maxActiveGuestDevices: z.coerce
      .number({ message: "Số thiết bị phải là số" })
      .int("Số thiết bị phải là số nguyên")
      .min(1, "Tối thiểu 1 thiết bị")
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => !(value.type !== undefined && value.roomTypeId !== undefined), {
    message: "Chỉ chọn một cách xác định loại phòng",
    path: ["roomTypeId"],
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cần ít nhất một trường thông tin phòng để cập nhật",
  });

export const updateRoomStatusBodySchema = z
  .object({
    status: roomStatusSchema,
    expectedUpdatedAt: z.coerce.date({ message: "Phiên bản trạng thái phòng không hợp lệ" }),
  })
  .strict();

export const confirmRoomReadyBodySchema = z
  .object({
    expectedUpdatedAt: z.coerce.date({ message: "Phiên bản trạng thái phòng không hợp lệ" }),
  })
  .strict();

export const roomFilterStatusSchema = z.preprocess(
  (val) => {
    if (typeof val !== "string" || !val.trim()) return val;
    const upper = val.trim().toUpperCase();
    if (
      upper === "CLEAN" ||
      upper === "CLEANED" ||
      upper === "READY" ||
      upper === "TRỐNG" ||
      upper === "AVAILABLE"
    )
      return "AVAILABLE";
    if (upper === "DIRTY" || upper === "CHỜ DỌN" || upper === "CLEANING" || upper === "PROCESSING")
      return "PROCESSING";
    if (upper === "BẢO TRÌ" || upper === "MAINTENANCE" || upper === "OUT_OF_SERVICE")
      return "MAINTENANCE";
    if (upper === "KHÓA" || upper === "ĐÃ KHÓA" || upper === "BLOCKED") return "BLOCKED";
    if (upper === "OCCUPIED" || upper === "ĐANG Ở" || upper === "RESERVED") return "OCCUPIED";
    if (upper === "IN_HOUSE" || upper === "ĐANG LƯU TRÚ") return "IN_HOUSE";
    if (upper === "OVERDUE" || upper === "QUÁ HẠN" || upper === "QUÁ HẠN TRẢ") return "OVERDUE";
    return upper;
  },
  z.enum(["AVAILABLE", "OCCUPIED", "IN_HOUSE", "PROCESSING", "MAINTENANCE", "BLOCKED", "OVERDUE"]),
);

export const listRoomsQuerySchema = z
  .object({
    status: roomFilterStatusSchema.optional(),
    page: z.coerce
      .number({ message: "Trang phải là số" })
      .int("Trang phải là số nguyên")
      .min(1, "Trang tối thiểu là 1")
      .optional(),
    limit: z.coerce
      .number({ message: "Số lượng phải là số" })
      .int("Số lượng phải là số nguyên")
      .min(1, "Số lượng tối thiểu là 1")
      .max(100, "Số lượng tối đa là 100")
      .optional(),
    q: z.string().max(80, "Từ khóa quá dài").optional(),
    floor: z.string().max(40, "Tên tầng quá dài").optional(),
    zone: z.string().max(80, "Tên khu vực quá dài").optional(),
    type: z.string().max(80, "Loại phòng quá dài").optional(),
    vipOnly: z.preprocess((val) => val === "true" || val === true, z.boolean()).optional(),
    unassignedOnly: z.preprocess((val) => val === "true" || val === true, z.boolean()).optional(),
    businessDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "businessDate phải có định dạng YYYY-MM-DD")
      .optional(),
  })
  .strict();

export const identityNumberSchema = z
  .string()
  .trim()
  .transform((val) => val.toUpperCase())
  .pipe(
    z
      .string()
      .min(1, "Số CCCD/Hộ chiếu không được để trống")
      .max(32, "Số CCCD/Hộ chiếu tối đa 32 ký tự")
      .regex(/^[A-Z0-9]+$/, "Số CCCD/Hộ chiếu chỉ bao gồm chữ cái và chữ số"),
  );

export const stayOccupantInputSchema = z.object({
  fullName: z
    .string({ message: "Họ tên khách là bắt buộc" })
    .trim()
    .min(2, "Họ tên khách phải từ 2 ký tự")
    .max(120, "Họ tên khách tối đa 120 ký tự"),
  phone: z.string().trim().max(40, "Số điện thoại tối đa 40 ký tự").optional(),
  identityNumber: identityNumberSchema.optional(),
  dateOfBirth: birthDateSchema,
  gender: z.string().trim().max(20, "Giới tính tối đa 20 ký tự").optional(),
  nationality: z.string().trim().max(80, "Quốc tịch tối đa 80 ký tự").optional(),
  residencePlace: z.string().trim().max(500, "Địa chỉ tối đa 500 ký tự").optional(),
  isPrimary: z.boolean().default(false),
});

export const createStayBodySchema = z
  .object({
    roomId: z
      .string({ message: "Mã phòng là bắt buộc" })
      .trim()
      .min(1, "Mã phòng không được để trống"),
    guestDisplayName: z
      .string({ message: "Tên khách hàng là bắt buộc" })
      .trim()
      .min(2, "Tên khách hàng phải từ 2 ký tự")
      .max(120, "Tên khách hàng tối đa 120 ký tự"),
    groupCode: z.string().trim().max(80).optional(),
    groupLeadGuestName: z.string().trim().max(120).optional(),
    groupLeadGuestPhone: z.string().trim().max(40).optional(),
    guestPhone: z.string().trim().max(40, "Số điện thoại tối đa 40 ký tự").optional(),
    guestIdentityNumber: identityNumberSchema.optional(),
    guestDateOfBirth: birthDateSchema,
    guestGender: z.string().trim().max(20, "Giới tính tối đa 20 ký tự").optional(),
    guestNationality: z.string().trim().max(80, "Quốc tịch tối đa 80 ký tự").optional(),
    guestResidencePlace: z.string().trim().max(500, "Địa chỉ tối đa 500 ký tự").optional(),
    plannedCheckInAt: z.coerce.date({ message: "Ngày nhận phòng không hợp lệ" }),
    plannedCheckOutAt: z.coerce.date({ message: "Ngày trả phòng không hợp lệ" }),
    nightlyRateSnapshot: z.coerce
      .number()
      .finite()
      .nonnegative("Giá phòng không được là số âm")
      .max(999_999_999_999.99)
      .optional(),
    occupants: z.array(stayOccupantInputSchema).optional(),
    reservationCode: z.string().trim().max(80).optional(),
  })
  .strict()
  .refine((value) => value.plannedCheckOutAt > value.plannedCheckInAt, {
    message: "Thời gian trả phòng phải sau thời gian nhận phòng",
    path: ["plannedCheckOutAt"],
  });

export const checkOutBodySchema = z
  .object({
    nextRoomStatus: z
      .nativeEnum(RoomStatus, { message: "Trạng thái phòng kế tiếp không hợp lệ" })
      .refine((value) => value === RoomStatus.PROCESSING || value === RoomStatus.MAINTENANCE, {
        message: "Trạng thái phòng kế tiếp phải là Chờ dọn (PROCESSING) hoặc Bảo trì (MAINTENANCE)",
      })
      .optional(),
    cleaningPriority: z.enum(["NORMAL", "URGENT"]).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

export const updateStayBodySchema = z
  .object({
    plannedCheckOutAt: z.coerce.date({ message: "Ngày trả phòng không hợp lệ" }).optional(),
    guestDisplayName: z
      .string()
      .trim()
      .min(2, "Tên khách hàng phải từ 2 ký tự")
      .max(120, "Tên khách hàng tối đa 120 ký tự")
      .optional(),
    guestPhone: z.string().trim().max(40, "Số điện thoại tối đa 40 ký tự").optional(),
    expectedUpdatedAt: z.coerce.date({ message: "Mốc cập nhật không hợp lệ" }).optional(),
  })
  .strict();

export const qrReasonBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(3, "Lý do phải từ 3 ký tự trở lên")
      .max(255, "Lý do tối đa 255 ký tự")
      .optional(),
  })
  .strict();

export const qrStatusQuerySchema = z
  .object({
    status: z.nativeEnum(RoomQRCodeStatus, { message: "Trạng thái mã QR không hợp lệ" }).optional(),
  })
  .strict();

export type CreateRoomBodyInput = z.infer<typeof createRoomBodySchema>;
export type CreateRoomTypeBodyInput = z.infer<typeof createRoomTypeBodySchema>;
export type CreateRoomsBodyInput = z.infer<typeof createRoomsBodySchema>;
export type UpdateRoomBodyInput = z.infer<typeof updateRoomBodySchema>;
export type UpdateRoomStatusBodyInput = z.infer<typeof updateRoomStatusBodySchema>;
export type ConfirmRoomReadyBodyInput = z.infer<typeof confirmRoomReadyBodySchema>;
export type ListRoomsQueryInput = z.infer<typeof listRoomsQuerySchema>;
export type CreateStayBodyInput = z.infer<typeof createStayBodySchema>;
export type CheckOutBodyInput = z.infer<typeof checkOutBodySchema>;
export type UpdateStayBodyInput = z.infer<typeof updateStayBodySchema>;
export type QrReasonBodyInput = z.infer<typeof qrReasonBodySchema>;
