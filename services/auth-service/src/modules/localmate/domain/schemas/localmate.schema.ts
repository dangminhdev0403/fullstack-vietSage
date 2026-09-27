import { z } from "zod";

const coordinateSchema = z.number();

function requireCoordinatePair(
  value: Record<string, unknown>,
  context: z.RefinementCtx,
  latitudeKey: string,
  longitudeKey: string,
) {
  const hasLatitude = Object.prototype.hasOwnProperty.call(value, latitudeKey);
  const hasLongitude = Object.prototype.hasOwnProperty.call(value, longitudeKey);
  const latitude = value[latitudeKey];
  const longitude = value[longitudeKey];
  if (
    hasLatitude !== hasLongitude ||
    (hasLatitude && hasLongitude && (latitude == null) !== (longitude == null))
  ) {
    context.addIssue({
      code: "custom",
      path: [hasLatitude ? longitudeKey : latitudeKey],
      message: "Vĩ độ và kinh độ phải được cung cấp cùng nhau",
    });
  }
}

export const localMateStatusEnumSchema = z.enum(["PENDING", "QUALIFIED", "SUSPENDED"]);

const nullableLatitudeOpenApiSchema = {
  type: "number",
  minimum: -90,
  maximum: 90,
  nullable: true,
};
const nullableLongitudeOpenApiSchema = {
  type: "number",
  minimum: -180,
  maximum: 180,
  nullable: true,
};

const localMateGuideFields = {
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
  serviceLatitude: coordinateSchema.min(-90).max(90).nullish(),
  serviceLongitude: coordinateSchema.min(-180).max(180).nullish(),
  dailyRateVnd: z.coerce.number().int().min(0, "Giá thuê theo ngày không thể âm").default(1000000),
  position: z.string().trim().max(80).default("GUIDE").optional(),
  userId: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
};

export const createLocalMateGuideSchema = z
  .object(localMateGuideFields)
  .superRefine((value, context) =>
    requireCoordinatePair(value, context, "serviceLatitude", "serviceLongitude"),
  );
export type CreateLocalMateGuideDto = z.infer<typeof createLocalMateGuideSchema>;

export const updateLocalMateGuideSchema = z
  .object(localMateGuideFields)
  .partial()
  .superRefine((value, context) =>
    requireCoordinatePair(value, context, "serviceLatitude", "serviceLongitude"),
  );
export type UpdateLocalMateGuideDto = z.infer<typeof updateLocalMateGuideSchema>;

const localMateGuideOpenApiProperties = {
  guideCode: { type: "string", minLength: 2, maxLength: 40 },
  fullName: { type: "string", minLength: 2, maxLength: 120 },
  phone: { type: "string", minLength: 8, maxLength: 40 },
  email: { type: "string", format: "email" },
  avatarUrl: { type: "string", format: "uri" },
  status: { type: "string", enum: ["PENDING", "QUALIFIED", "SUSPENDED"] },
  position: { type: "string", maxLength: 80 },
  languages: { type: "array", items: { type: "string" }, minItems: 1 },
  operatingRegions: { type: "array", items: { type: "string" }, minItems: 1 },
  specialties: { type: "array", items: { type: "string" } },
  bio: { type: "string", maxLength: 1000 },
  serviceLatitude: nullableLatitudeOpenApiSchema,
  serviceLongitude: nullableLongitudeOpenApiSchema,
  dailyRateVnd: { type: "integer", minimum: 0 },
  userId: { type: "string" },
  tenantId: { type: "string" },
};

export const createLocalMateGuideOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fullName", "phone", "avatarUrl", "languages", "operatingRegions"],
  properties: localMateGuideOpenApiProperties,
};

export const updateLocalMateGuideOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  properties: localMateGuideOpenApiProperties,
};

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

const localMateTourFields = {
  tourCode: z.string().trim().min(2).max(80).optional(),
  title: z.string().trim().min(2, "Tiêu đề tour phải có ít nhất 2 ký tự").max(255),
  duration: z.string().trim().min(1, "Thời lượng tour không được để trống").max(80),
  highlights: z.array(z.string().trim()).default([]),
  content: z.string().trim().min(5, "Nội dung lịch trình tour phải có ít nhất 5 ký tự"),
  sourceFileName: z.string().trim().max(255).optional(),
  provinceCode: z.string().trim().max(40).optional(),
  province: z.string().trim().max(80).optional(),
  tourScope: tourScopeEnumSchema.optional(),
  latitude: coordinateSchema.min(-90).max(90).nullish(),
  longitude: coordinateSchema.min(-180).max(180).nullish(),
};

export const createLocalMateTourSchema = z
  .object(localMateTourFields)
  .superRefine((value, context) => requireCoordinatePair(value, context, "latitude", "longitude"));
export type CreateLocalMateTourDto = z.infer<typeof createLocalMateTourSchema>;

export const updateLocalMateTourSchema = z
  .object(localMateTourFields)
  .partial()
  .superRefine((value, context) => requireCoordinatePair(value, context, "latitude", "longitude"));
export type UpdateLocalMateTourDto = z.infer<typeof updateLocalMateTourSchema>;

const localMateTourOpenApiProperties = {
  tourCode: { type: "string", minLength: 2, maxLength: 80 },
  title: { type: "string", minLength: 2, maxLength: 255 },
  duration: { type: "string", minLength: 1, maxLength: 80 },
  highlights: { type: "array", items: { type: "string" } },
  content: { type: "string", minLength: 5 },
  sourceFileName: { type: "string", maxLength: 255 },
  provinceCode: { type: "string", maxLength: 40 },
  province: { type: "string", maxLength: 80 },
  tourScope: {
    type: "string",
    enum: ["LOCAL", "REGIONAL_DAYTRIP", "INTERPROVINCIAL"],
  },
  latitude: nullableLatitudeOpenApiSchema,
  longitude: nullableLongitudeOpenApiSchema,
};

export const createLocalMateTourOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "duration", "content"],
  properties: localMateTourOpenApiProperties,
};

export const updateLocalMateTourOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  properties: localMateTourOpenApiProperties,
};

export const queryLocalMateKnowledgeSchema = z.object({
  query: z.string().trim().optional(),
  destination: z.string().trim().optional(),
  hotelId: z.string().trim().optional(),
  radiusKm: z.coerce.number().min(1).max(300).default(50),
  provinceCode: z.string().trim().optional(),
  scope: tourScopeEnumSchema.optional(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});
export type QueryLocalMateKnowledgeDto = z.infer<typeof queryLocalMateKnowledgeSchema>;

export const queryLocalMateKnowledgeOpenApiSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    query: { type: "string" },
    destination: { type: "string" },
    hotelId: {
      type: "string",
      description: "Trusted hotel anchor supplied by the authenticated GuestOS BFF.",
    },
    radiusKm: { type: "number", minimum: 1, maximum: 300, default: 50 },
    provinceCode: { type: "string" },
    scope: {
      type: "string",
      enum: ["LOCAL", "REGIONAL_DAYTRIP", "INTERPROVINCIAL"],
    },
    limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
  },
};

export const listLocalMateToursQuerySchema = z.object({
  search: z.string().trim().optional(),
  query: z.string().trim().optional(),
  destination: z.string().trim().optional(),
  provinceCode: z.string().trim().optional(),
  scope: tourScopeEnumSchema.optional(),
  hotelId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListLocalMateToursQueryDto = z.infer<typeof listLocalMateToursQuerySchema>;
