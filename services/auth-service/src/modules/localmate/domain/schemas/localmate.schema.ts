import { z } from "zod";

export const localMateStatusEnumSchema = z.enum(["PENDING", "QUALIFIED", "SUSPENDED"]);

export const createLocalMateGuideSchema = z.object({
  guideCode: z.string().trim().min(2).max(40).optional(),
  fullName: z.string().trim().min(2, "Họ tên phải có ít nhất 2 ký tự").max(120),
  phone: z.string().trim().min(8, "Số điện thoại không hợp lệ").max(40),
  email: z.string().trim().email("Email không hợp lệ").optional().or(z.literal("")),
  avatarUrl: z.string().trim().url("Ảnh đại diện phải là đường link hợp lệ"),
  status: localMateStatusEnumSchema.default("PENDING"),
  languages: z.array(z.string().trim()).min(1, "Cần chọn ít nhất 1 ngôn ngữ"),
  operatingRegions: z.array(z.string().trim()).min(1, "Cần chọn ít nhất 1 khu vực hoạt động"),
  specialties: z.array(z.string().trim()).default([]),
  bio: z.string().trim().max(1000).optional(),
  dailyRateVnd: z.coerce.number().int().min(0, "Giá thuê theo ngày không thể âm").default(1000000),
  position: z.string().trim().max(80).default("GUIDE").optional(),
  userId: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
});

export type CreateLocalMateGuideDto = z.infer<typeof createLocalMateGuideSchema>;

export const updateLocalMateGuideSchema = createLocalMateGuideSchema.partial();
export type UpdateLocalMateGuideDto = z.infer<typeof updateLocalMateGuideSchema>;

export const updateQualificationStatusSchema = z.object({
  status: localMateStatusEnumSchema,
  reason: z.string().trim().max(500).optional(),
});
export type UpdateQualificationStatusDto = z.infer<typeof updateQualificationStatusSchema>;

export const listLocalMateGuidesQuerySchema = z.object({
  status: localMateStatusEnumSchema.optional(),
  region: z.string().trim().optional(),
  language: z.string().trim().optional(),
  position: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListLocalMateGuidesQueryDto = z.infer<typeof listLocalMateGuidesQuerySchema>;

export const matchLocalMateRequestSchema = z.object({
  destination: z.string().trim().optional(),
  language: z.string().trim().optional(),
  preferences: z
    .union([z.array(z.string()), z.string()])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  durationDays: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(3),
});
export type MatchLocalMateRequestDto = z.infer<typeof matchLocalMateRequestSchema>;

export const idParamSchema = z.string().trim().min(1, "ID không được để trống");
export const guideCodeParamSchema = z
  .string()
  .trim()
  .min(1, "Mã hướng dẫn viên không được để trống");

export const tourScopeEnumSchema = z.enum(["LOCAL", "REGIONAL_DAYTRIP", "INTERPROVINCIAL"]);
export type TourScopeDto = z.infer<typeof tourScopeEnumSchema>;

export const createLocalMateTourSchema = z.object({
  tourCode: z.string().trim().min(2).max(80).optional(),
  title: z.string().trim().min(2, "Tiêu đề tour phải có ít nhất 2 ký tự").max(255),
  destination: z.string().trim().min(2, "Điểm đến không được để trống").max(120),
  duration: z.string().trim().min(1, "Thời lượng tour không được để trống").max(80),
  highlights: z.array(z.string().trim()).default([]),
  content: z.string().trim().min(5, "Nội dung lịch trình tour phải có ít nhất 5 ký tự"),
  sourceFileName: z.string().trim().max(255).optional(),
  provinceCode: z.string().trim().max(40).optional(),
  province: z.string().trim().max(80).optional(),
  tourScope: tourScopeEnumSchema.optional(),
});
export type CreateLocalMateTourDto = z.infer<typeof createLocalMateTourSchema>;

export const updateLocalMateTourSchema = createLocalMateTourSchema.partial();
export type UpdateLocalMateTourDto = z.infer<typeof updateLocalMateTourSchema>;

export const queryLocalMateKnowledgeSchema = z.object({
  query: z.string().trim().optional(),
  destination: z.string().trim().optional(),
  hotelId: z.string().trim().optional(),
  provinceCode: z.string().trim().optional(),
  scope: tourScopeEnumSchema.optional(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});
export type QueryLocalMateKnowledgeDto = z.infer<typeof queryLocalMateKnowledgeSchema>;

export const listLocalMateToursQuerySchema = z.object({
  destination: z.string().trim().optional(),
  provinceCode: z.string().trim().optional(),
  scope: tourScopeEnumSchema.optional(),
  hotelId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListLocalMateToursQueryDto = z.infer<typeof listLocalMateToursQuerySchema>;
