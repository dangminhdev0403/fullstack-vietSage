import { z } from "zod";
import { isValidCalendarDateTime } from "./kbtt.schema";

const localDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    "Thời gian phải đúng định dạng YYYY-MM-DD HH:mm:ss",
  )
  .refine(isValidCalendarDateTime, "Thời gian không phải là thời điểm lịch hợp lệ");

export const kbttDomesticDepartureChangeSchema = z
  .object({
    loai: z.enum(["TS", "GH"]),
    soGiayTo: z.string().regex(/^[A-Za-z0-9]+$/, "Số giấy tờ chỉ được chứa chữ cái và chữ số"),
    loaiGiayTo: z.number().int().min(1).max(8),
    thoiGianStr: localDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.loai === "GH" && !value.thoiGianStr) {
      ctx.addIssue({ code: "custom", path: ["thoiGianStr"], message: "Gia hạn cần ngày đi mới" });
    }
    let message: string | undefined;
    if ([1, 8].includes(value.loaiGiayTo) && !/^\d{12}$/.test(value.soGiayTo)) {
      message = "CCCD / Căn Cước phải có đúng 12 chữ số";
    } else if (value.loaiGiayTo === 2 && !/^(?:\d{9}|\d{12})$/.test(value.soGiayTo)) {
      message = "CMND phải có đúng 9 hoặc 12 chữ số";
    } else if ([3, 6].includes(value.loaiGiayTo) && value.soGiayTo.length > 20) {
      message = "Số giấy tờ không được vượt quá 20 ký tự";
    } else if (value.loaiGiayTo === 4 && value.soGiayTo.length > 10) {
      message = "Hộ chiếu không được vượt quá 10 ký tự";
    }
    if (message) ctx.addIssue({ code: "custom", path: ["soGiayTo"], message });
  });

export const kbttForeignDepartureChangeSchema = z
  .object({
    loai: z.enum(["TS", "GH"]),
    soHc: z.string().min(1),
    quocTich: z.string().min(1),
    thoiGianStr: localDateTimeSchema.optional(),
    thoiHanTamTruVnStr: localDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.loai === "GH" && !value.thoiGianStr) {
      ctx.addIssue({ code: "custom", path: ["thoiGianStr"], message: "Gia hạn cần ngày đi mới" });
    }
  });

export type KbttDomesticDepartureChange = z.infer<typeof kbttDomesticDepartureChangeSchema>;
export type KbttForeignDepartureChange = z.infer<typeof kbttForeignDepartureChangeSchema>;
