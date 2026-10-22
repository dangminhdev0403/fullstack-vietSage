import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const getHotelReportsQuerySchema = z
  .object({
    range: z
      .enum(["7d", "14d", "30d", "90d", "this_month", "last_month", "this_year"])
      .optional()
      .default("30d"),
    from: z
      .string()
      .trim()
      .regex(DATE_REGEX, "Ngày bắt đầu (from) phải có định dạng YYYY-MM-DD")
      .optional(),
    to: z
      .string()
      .trim()
      .regex(DATE_REGEX, "Ngày kết thúc (to) phải có định dạng YYYY-MM-DD")
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.from && data.to) {
        return data.from <= data.to;
      }
      return true;
    },
    {
      message: "Ngày bắt đầu (from) không được lớn hơn ngày kết thúc (to)",
      path: ["from"],
    },
  );

export type GetHotelReportsQuery = z.infer<typeof getHotelReportsQuerySchema>;
