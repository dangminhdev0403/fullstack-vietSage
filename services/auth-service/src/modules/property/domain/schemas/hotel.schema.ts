import { HotelStatus, MarketplaceLocationSource } from "@prisma/client";
import { z } from "zod";
import { jsonRecordSchema } from "./shared.schema";

const GOOGLE_SHEET_ID_PATTERN = /^[a-zA-Z0-9_-]{20,200}$/;

export function parseGoogleSheetId(value: string): string {
  const input = value.trim();
  if (!input) {
    throw new Error("Vui lòng nhập URL Google Sheets hoặc spreadsheet ID");
  }

  let spreadsheetId = input;
  if (input.includes("://")) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error("URL Google Sheets không hợp lệ");
    }

    if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
      throw new Error("URL phải thuộc https://docs.google.com/spreadsheets/");
    }

    const match = url.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
    if (!match?.[1]) {
      throw new Error("Không tìm thấy spreadsheet ID trong URL Google Sheets");
    }
    spreadsheetId = match[1];
  }

  if (!GOOGLE_SHEET_ID_PATTERN.test(spreadsheetId)) {
    throw new Error("Spreadsheet ID không đúng định dạng");
  }
  return spreadsheetId;
}

const googleSheetUrlSchema = z
  .string()
  .trim()
  .max(500)
  .transform((value, context) => {
    try {
      return parseGoogleSheetId(value);
    } catch (error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Google Sheets không hợp lệ",
      });
      return z.NEVER;
    }
  });

export const createHotelBodySchema = z
  .object({
    tenantId: z.string().max(80, "tenantId không được vượt quá 80 ký tự").optional(),
    name: z.string().trim().min(2).max(160),
    timezone: z.string().trim().min(1).max(80).optional(),
    brandSettings: jsonRecordSchema.optional(),
    googleSheetUrl: googleSheetUrlSchema.optional(),
  })
  .strict();

export const listHotelsQuerySchema = z
  .object({
    tenantId: z.string().max(80).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().max(120).optional(),
  })
  .strict();

export const updateHotelBodySchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    brandSettings: jsonRecordSchema.nullable().optional(),
    googleSheetUrl: googleSheetUrlSchema.nullable().optional(),
    status: z.nativeEnum(HotelStatus).optional(),
    googleMapsUrl: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    locationAccuracyMeters: z.number().nonnegative().nullable().optional(),
    locationSource: z.nativeEnum(MarketplaceLocationSource).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.latitude == null) !== (value.longitude == null)) context.addIssue({ code: "custom", message: "latitude và longitude phải đi cùng nhau" });
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cần ít nhất một trường khách sạn",
  });

export type CreateHotelBodyInput = z.infer<typeof createHotelBodySchema>;
export type ListHotelsQueryInput = z.infer<typeof listHotelsQuerySchema>;
export type UpdateHotelBodyInput = z.infer<typeof updateHotelBodySchema>;
