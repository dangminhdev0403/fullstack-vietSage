import { RoomQRCodeStatus, RoomStatus } from "@prisma/client";
import { z } from "zod";

export const createRoomBodySchema = z
  .object({
    roomNumber: z.string({ message: "Số phòng là bắt buộc" }).trim().min(1, "Số phòng không được để trống").max(40, "Số phòng tối đa 40 ký tự"),
    floor: z.string().trim().max(40, "Tên tầng tối đa 40 ký tự").optional(),
    type: z.string().trim().max(80, "Loại phòng tối đa 80 ký tự").optional(),
    price: z.coerce.number({ message: "Giá phòng phải là số" }).nonnegative("Giá phòng không được là số âm").optional(),
    maxActiveGuestDevices: z.coerce.number({ message: "Số thiết bị phải là số" }).int("Số thiết bị phải là số nguyên").min(1, "Tối thiểu 1 thiết bị").optional(),
  })
  .strict();

export const createRoomsBodySchema = z
  .object({
    items: z.array(createRoomBodySchema, { message: "Danh sách phòng là bắt buộc" }).min(1, "Cần ít nhất một phòng").max(100, "Tối đa 100 phòng"),
  })
  .strict();

export const updateRoomBodySchema = z
  .object({
    roomNumber: z.string().trim().min(1, "Số phòng không được để trống").max(40, "Số phòng tối đa 40 ký tự").optional(),
    floor: z.string().trim().max(40, "Tên tầng tối đa 40 ký tự").nullable().optional(),
    type: z.string().trim().max(80, "Loại phòng tối đa 80 ký tự").nullable().optional(),
    price: z.coerce.number({ message: "Giá phòng phải là số" }).nonnegative("Giá phòng không được là số âm").nullable().optional(),
    maxActiveGuestDevices: z.coerce.number({ message: "Số thiết bị phải là số" }).int("Số thiết bị phải là số nguyên").min(1, "Tối thiểu 1 thiết bị").nullable().optional(),
    status: z.nativeEnum(RoomStatus, { message: "Trạng thái phòng không hợp lệ" }).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cần ít nhất một trường thông tin phòng để cập nhật",
  });

export const listRoomsQuerySchema = z
  .object({
    status: z.nativeEnum(RoomStatus, { message: "Trạng thái phòng không hợp lệ" }).optional(),
    page: z.coerce.number({ message: "Trang phải là số" }).int("Trang phải là số nguyên").min(1, "Trang tối thiểu là 1").optional(),
    limit: z.coerce.number({ message: "Số lượng phải là số" }).int("Số lượng phải là số nguyên").min(1, "Số lượng tối thiểu là 1").max(100, "Số lượng tối đa là 100").optional(),
    q: z.string().max(80, "Từ khóa quá dài").optional(),
    floor: z.string().max(40, "Tên tầng quá dài").optional(),
    type: z.string().max(80, "Loại phòng quá dài").optional(),
    vipOnly: z.preprocess((val) => val === "true" || val === true, z.boolean()).optional(),
  })
  .strict();

export const createStayBodySchema = z
  .object({
    roomId: z.string({ message: "Mã phòng là bắt buộc" }).trim().min(1, "Mã phòng không được để trống"),
    guestDisplayName: z.string({ message: "Tên khách hàng là bắt buộc" }).trim().min(2, "Tên khách hàng phải từ 2 ký tự").max(120, "Tên khách hàng tối đa 120 ký tự"),
    guestPhone: z.string().trim().max(40, "Số điện thoại tối đa 40 ký tự").optional(),
    plannedCheckInAt: z.coerce.date({ message: "Ngày nhận phòng không hợp lệ" }),
    plannedCheckOutAt: z.coerce.date({ message: "Ngày trả phòng không hợp lệ" }),
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
      .refine((value) => value === RoomStatus.AVAILABLE || value === RoomStatus.MAINTENANCE, {
        message: "Trạng thái phòng kế tiếp phải là Sẵn sàng (AVAILABLE) hoặc Bảo trì (MAINTENANCE)",
      })
      .optional(),
  })
  .strict();

export const qrReasonBodySchema = z
  .object({
    reason: z.string().trim().min(3, "Lý do phải từ 3 ký tự trở lên").max(255, "Lý do tối đa 255 ký tự").optional(),
  })
  .strict();

export const qrStatusQuerySchema = z
  .object({
    status: z.nativeEnum(RoomQRCodeStatus, { message: "Trạng thái mã QR không hợp lệ" }).optional(),
  })
  .strict();

export type CreateRoomBodyInput = z.infer<typeof createRoomBodySchema>;
export type CreateRoomsBodyInput = z.infer<typeof createRoomsBodySchema>;
export type UpdateRoomBodyInput = z.infer<typeof updateRoomBodySchema>;
export type ListRoomsQueryInput = z.infer<typeof listRoomsQuerySchema>;
export type CreateStayBodyInput = z.infer<typeof createStayBodySchema>;
export type CheckOutBodyInput = z.infer<typeof checkOutBodySchema>;
export type QrReasonBodyInput = z.infer<typeof qrReasonBodySchema>;
