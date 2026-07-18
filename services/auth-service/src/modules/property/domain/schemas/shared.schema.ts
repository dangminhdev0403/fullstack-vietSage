import { z } from "zod";

export const jsonRecordSchema = z.record(z.string(), z.unknown());

export const hotelIdParamSchema = z.string().trim().min(1, "hotelId là bắt buộc");
export const roomIdParamSchema = z.string().trim().min(1, "roomId là bắt buộc");
export const stayIdParamSchema = z.string().trim().min(1, "stayId là bắt buộc");
export const reservationIdParamSchema = z.string().trim().min(1, "reservationId là bắt buộc");
export const requestIdParamSchema = z.string().trim().min(1, "requestId là bắt buộc");
export const serviceCategoryIdParamSchema = z.string().trim().min(1, "categoryId là bắt buộc");
export const serviceItemIdParamSchema = z.string().trim().min(1, "itemId là bắt buộc");
