import { z } from "zod";

export const kbttCredentialsSchema = z
  .object({
    username: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, ""))
      .pipe(z.string().min(1).max(120)),
    password: z.string().min(1).max(256),
  })
  .strict();

export const kbttConnectionSchema = z.object({
  configured: z.boolean(),
  status: z.enum(["CONNECTED", "AUTH_FAILED", "DISCONNECTED"]),
  maskedUsername: z.string().nullable(),
  csltId: z.string().nullable(),
  csltKhuVuc: z.number().nullable(),
  csltDonVi: z.number().nullable(),
  maTTCuaCslt: z.string().nullable(),
  maPxCuaCslt: z.string().nullable(),
  isCsltChinh: z.boolean().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastConnectedAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
});

export type KbttCredentials = z.infer<typeof kbttCredentialsSchema>;
export type KbttConnection = z.infer<typeof kbttConnectionSchema>;

export const kbttCatalogKindSchema = z.enum([
  "NATIONALITY",
  "PROVINCE",
  "WARD",
  "STAY_REASON",
  "DOCUMENT_TYPE",
  "RESIDENCE_PLACE",
]);
export type KbttCatalogKind = z.infer<typeof kbttCatalogKindSchema>;

export const kbttCatalogItemSchema = z.object({
  id: z.string(),
  kind: kbttCatalogKindSchema,
  code: z.string(),
  parentCode: z.string().nullable(),
  nameVi: z.string(),
  nameEn: z.string().nullable(),
  isActive: z.boolean(),
  fetchedAt: z.string(),
});
export const kbttCatalogListSchema = z.array(kbttCatalogItemSchema);
export type KbttCatalogItem = z.infer<typeof kbttCatalogItemSchema>;

export const citizenshipKindSchema = z.enum(["VIETNAMESE", "FOREIGN"]);
export type CitizenshipKind = z.infer<typeof citizenshipKindSchema>;

export const kbttDeclarationStatusSchema = z.enum([
  "DRAFT",
  "READY",
  "SENDING",
  "SUBMITTED",
  "FAILED",
  "UNKNOWN",
  "CANCELLED",
]);
export type KbttDeclarationStatus = z.infer<typeof kbttDeclarationStatusSchema>;

export const kbttDerivedStatusSchema = z.enum([
  "MISSING_PROFILE",
  ...kbttDeclarationStatusSchema.options,
]);
export type KbttDerivedStatus = z.infer<typeof kbttDerivedStatusSchema>;

export const kbttPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type KbttPaginationQuery = z.infer<typeof kbttPaginationQuerySchema>;

export const kbttDeclarationSummarySchema = z.object({
  id: z.string(),
  revision: z.number(),
  status: kbttDeclarationStatusSchema,
  declarationKind: citizenshipKindSchema,
  providerCode: z.string().nullable(),
  providerMessage: z.string().nullable(),
  submittedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KbttDeclarationSummary = z.infer<
  typeof kbttDeclarationSummarySchema
>;

export const kbttDeclarationListItemSchema = z.object({
  occupantId: z.string(),
  stayId: z.string(),
  hotelId: z.string(),
  roomId: z.string().nullable(),
  roomNumber: z.string().nullable(),
  isPrimary: z.boolean(),
  fullName: z.string(),
  phone: z.string().nullable(),
  identityNumber: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  gender: z.string().nullable(),
  nationality: z.string().nullable(),
  documentType: z.number().nullable().optional(),
  residencePlace: z.string().nullable(),
  citizenshipKind: citizenshipKindSchema.nullable(),
  derivedStatus: kbttDerivedStatusSchema,
  stayStatus: z.string(),
  reservationCode: z.string().nullable(),
  checkedInAt: z.string().nullable(),
  plannedCheckInAt: z.string(),
  plannedCheckOutAt: z.string(),
  declaration: kbttDeclarationSummarySchema.nullable(),
});
export type KbttDeclarationListItem = z.infer<
  typeof kbttDeclarationListItemSchema
>;
export const kbttDeclarationListSchema = z.array(kbttDeclarationListItemSchema);

export const kbttOccupantDetailSchema = z.object({
  id: z.string(),
  stayId: z.string(),
  hotelId: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  identityNumber: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  gender: z.string().nullable(),
  nationality: z.string().nullable(),
  residencePlace: z.string().nullable(),
  isPrimary: z.boolean(),
  citizenshipKind: citizenshipKindSchema.nullable(),
});
export type KbttOccupantDetail = z.infer<typeof kbttOccupantDetailSchema>;

export const kbttDeclarationRecordSchema = z.object({
  id: z.string(),
  hotelId: z.string(),
  stayId: z.string(),
  occupantId: z.string(),
  declarationKind: citizenshipKindSchema,
  revision: z.number(),
  status: kbttDeclarationStatusSchema,
  draftPayload: z.record(z.string(), z.unknown()).nullable(),
  providerCode: z.string().nullable(),
  providerMessage: z.string().nullable(),
  submittedAt: z.string().nullable(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KbttDeclarationRecord = z.infer<typeof kbttDeclarationRecordSchema>;

export const kbttOccupantDeclarationDetailSchema = z.object({
  occupant: kbttOccupantDetailSchema,
  declaration: kbttDeclarationRecordSchema.nullable(),
  derivedStatus: kbttDerivedStatusSchema,
});
export type KbttOccupantDeclarationDetail = z.infer<
  typeof kbttOccupantDeclarationDetailSchema
>;

export const KBTT_FORBIDDEN_KEYS = [
  "AccessToken",
  "RefreshToken",
  "TokenType",
  "token",
  "password",
  "providerResponseJson",
  "submittedPayloadJson",
  "submittedPayloadFingerprint",
  "providerCode",
  "providerMessage",
  "submittedAt",
  "status",
  "revision",
  "version",
  "createdAt",
  "updatedAt",
  "id",
] as const;

export const kbttVietnameseDraftDataSchema = z
  .object({
    hoTen: z.string().trim().min(1).max(160).optional(),
    gioiTinh: z.enum(["M", "F"]).optional(),
    soDienThoai: z.string().trim().max(40).optional().nullable(),
    ngayThangNamSinhStr: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày sinh phải là YYYY-MM-DD")
      .optional(),
    ghiChu: z.string().trim().max(500).optional().nullable(),
    noiCuTru: z.number().int().nonnegative().optional().nullable(),
    maTT: z.string().trim().max(32).optional().nullable(),
    maPX: z.string().trim().max(32).optional().nullable(),
    diaChi: z.string().trim().max(255).optional().nullable(),
    ngayDenCsltStr: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "Định dạng ngày đến phải là YYYY-MM-DD HH:mm:ss",
      )
      .optional(),
    ngayDiDuKienStr: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "Định dạng ngày đi phải là YYYY-MM-DD HH:mm:ss",
      )
      .optional(),
    soPhong: z.string().trim().max(32).optional().nullable(),
    lyDoCuTru: z.number().int().positive().optional(),
    lyDoChiTiet: z.string().trim().max(255).optional().nullable(),
    loaiGiayTo: z.number().int().min(1).max(8).optional(),
    soGiayTo: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9]+$/,
        "Số giấy tờ không được chứa khoảng trắng hoặc ký tự đặc biệt",
      )
      .max(32)
      .optional(),
  })
  .strict();
export type KbttVietnameseDraftData = z.infer<
  typeof kbttVietnameseDraftDataSchema
>;

export const kbttForeignDraftDataSchema = z
  .object({
    hoTen: z.string().trim().min(1).max(160).optional(),
    quocTich: z.string().trim().min(1).max(32).optional(),
    soHoChieu: z
      .string()
      .trim()
      .regex(
        /^[A-Za-z0-9]+$/,
        "Số hộ chiếu không được chứa khoảng trắng hoặc ký tự đặc biệt",
      )
      .max(32)
      .optional(),
    gioiTinh: z.enum(["M", "F"]).optional(),
    loaiNgayThangNamSinh: z.enum(["D", "Y"]).optional(),
    ngayThangNamSinhStr: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng ngày sinh phải là YYYY-MM-DD")
      .optional(),
    ngayDenCsltStr: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "Định dạng ngày đến phải là YYYY-MM-DD HH:mm:ss",
      )
      .optional(),
    ngayDiDuKienStr: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "Định dạng ngày đi phải là YYYY-MM-DD HH:mm:ss",
      )
      .optional(),
    soPhong: z.string().trim().max(32).optional().nullable(),
    thoiHanTamTruStr: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "Định dạng thời hạn tạm trú phải là YYYY-MM-DD HH:mm:ss",
      )
      .optional(),
  })
  .strict();
export type KbttForeignDraftData = z.infer<typeof kbttForeignDraftDataSchema>;

export const saveKbttDraftPayloadSchema = z
  .object({
    citizenshipKind: citizenshipKindSchema,
    data: z.record(z.string(), z.unknown()),
    allowSubmittedEdit: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    for (const key of Object.keys(val.data)) {
      if ((KBTT_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Trường dữ liệu không hợp lệ: ${key}`,
          path: ["data", key],
        });
      }
    }
    if (val.citizenshipKind === "VIETNAMESE") {
      const parsed = kbttVietnameseDraftDataSchema.safeParse(val.data);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            ...issue,
            path: ["data", ...issue.path],
          });
        }
      }
    } else {
      const parsed = kbttForeignDraftDataSchema.safeParse(val.data);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({
            ...issue,
            path: ["data", ...issue.path],
          });
        }
      }
    }
  });
export type SaveKbttDraftPayload = z.infer<typeof saveKbttDraftPayloadSchema>;

const KBTT_DATE_FIELDS = ["ngayThangNamSinhStr"] as const;
const KBTT_DATE_TIME_FIELDS = [
  "ngayDenCsltStr",
  "ngayDiDuKienStr",
  "thoiHanTamTruStr",
] as const;

export function formatKbttDraftForDisplay(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const formatted = { ...data };
  for (const field of KBTT_DATE_FIELDS) {
    const match =
      typeof formatted[field] === "string"
        ? formatted[field].match(/^(\d{4})-(\d{2})-(\d{2})$/)
        : null;
    if (match) formatted[field] = `${match[3]}/${match[2]}/${match[1]}`;
  }
  for (const field of KBTT_DATE_TIME_FIELDS) {
    const match =
      typeof formatted[field] === "string"
        ? formatted[field].match(
            /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2})$/,
          )
        : null;
    if (match)
      formatted[field] = `${match[4]} ${match[3]}/${match[2]}/${match[1]}`;
  }
  return formatted;
}

export function formatKbttDraftForProvider(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const formatted = { ...data };
  for (const field of KBTT_DATE_FIELDS) {
    const match =
      typeof formatted[field] === "string"
        ? formatted[field].match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
        : null;
    if (match) formatted[field] = `${match[3]}-${match[2]}-${match[1]}`;
  }
  for (const field of KBTT_DATE_TIME_FIELDS) {
    const match =
      typeof formatted[field] === "string"
        ? formatted[field].match(
            /^(\d{2}:\d{2}:\d{2}) (\d{2})\/(\d{2})\/(\d{4})$/,
          )
        : null;
    if (match)
      formatted[field] = `${match[4]}-${match[3]}-${match[2]} ${match[1]}`;
  }
  return formatted;
}

export type KbttTabKey =
  "vietnamese" | "foreign" | "needs_completion" | "submitted_or_error";

export function canSelectKbttDeclaration(
  row: Pick<KbttDeclarationListItem, "derivedStatus">,
): boolean {
  return ["MISSING_PROFILE", "DRAFT", "READY", "FAILED"].includes(row.derivedStatus);
}

export function getKbttListState(
  rows: readonly Pick<KbttDeclarationListItem, "derivedStatus">[],
  queryStatus: "pending" | "error" | "success",
) {
  if (queryStatus === "pending") return "loading";
  if (queryStatus === "error") return "error";
  if (rows.length === 0) return "empty";
  return rows.every((row) => row.derivedStatus === "SUBMITTED")
    ? "submitted"
    : "pending";
}

export function getRowPartitionTab(
  row: Pick<KbttDeclarationListItem, "derivedStatus" | "citizenshipKind">,
): KbttTabKey {
  if (row.derivedStatus === "SUBMITTED") {
    return "submitted_or_error";
  }
  if (row.derivedStatus === "MISSING_PROFILE" || !row.citizenshipKind) {
    return "needs_completion";
  }
  if (row.citizenshipKind === "FOREIGN") {
    return "foreign";
  }
  return "vietnamese";
}

const errorMessages: Record<string, string> = {
  INTERNAL_SERVER_ERROR: "Không thể tải dữ liệu từ máy chủ. Vui lòng thử lại.",
  KBTT_NOT_CONFIGURED: "Chưa cấu hình tài khoản khai báo tạm trú.",
  KBTT_AUTH_FAILED:
    "Tài khoản hoặc mật khẩu không đúng. Vui lòng đăng nhập lại.",
  KBTT_MISSING_AUTHORITY: "Tài khoản chưa được cấp quyền khai báo tạm trú.",
  KBTT_PROVIDER_UNAVAILABLE:
    "Không thể kết nối hệ thống Bộ Công an. Vui lòng thử lại.",
  KBTT_PROVIDER_INVALID_RESPONSE:
    "Không thể kiểm tra kết nối. Vui lòng liên hệ hỗ trợ.",
  KBTT_CREDENTIAL_DECRYPT_FAILED:
    "Không thể kiểm tra kết nối. Vui lòng liên hệ hỗ trợ.",
  KBTT_UNAVAILABLE: "Không thể kết nối dịch vụ KBTT. Vui lòng thử lại sau.",
  KBTT_PAYLOAD_INVALID: "Dữ liệu khai báo không hợp lệ hoặc thiếu thông tin bắt buộc.",
  KBTT_ALREADY_SUBMITTED: "Hồ sơ của khách này đã được gửi lên Bộ Công an.",
  KBTT_DECLARATION_LOCKED: "Hồ sơ đang gửi, cần đối soát hoặc đã hủy; không thể sửa hay gửi lại lúc này.",
  KBTT_ACTIVE_IDENTITY_CONFLICT: "Số giấy tờ này đang có hồ sơ lưu trú khác tại khách sạn.",
  KBTT_RATE_LIMITED: "Yêu cầu gửi quá nhanh. Vui lòng chờ giây lát rồi thử lại.",
  BUSINESS_REJECTION: "Cổng dịch vụ công Bộ Công an từ chối tiếp nhận hồ sơ.",
  VALIDATION_ERROR: "Thông tin khai báo chưa hợp lệ.",
  BAD_REQUEST: "Dữ liệu khai báo không hợp lệ.",
};

export function kbttErrorMessage(codeOrMessage: string | null): string {
  if (!codeOrMessage) {
    return "Không thể xử lý yêu cầu khai báo. Vui lòng thử lại hoặc liên hệ hỗ trợ.";
  }
  const trimmed = codeOrMessage.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.includes("token") ||
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("bearer")
  ) {
    return "Không thể xử lý yêu cầu khai báo. Vui lòng thử lại hoặc liên hệ hỗ trợ.";
  }
  if (Object.hasOwn(errorMessages, trimmed)) {
    return errorMessages[trimmed];
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const detail = sanitizeProviderDetail(parsed);
      if (detail) return detail;
    } catch {
      // ignore json parse error
    }
  }
  // Fallback to generic message only if it looks like an unmapped raw error code (e.g. KBTT_XXX, HTTP_500)
  if (/^[A-Z0-9_]{3,}$/.test(trimmed)) {
    return "Không thể xử lý yêu cầu khai báo. Vui lòng thử lại hoặc liên hệ hỗ trợ.";
  }
  return trimmed;
}

export function kbttErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const candidate of [record.code, record.message, record.error]) {
    if (
      typeof candidate === "string" &&
      Object.hasOwn(errorMessages, candidate)
    )
      return candidate;
  }
  for (const candidate of [record.data, record.error]) {
    if (!candidate || typeof candidate !== "object") continue;
    const detail = candidate as Record<string, unknown>;
    for (const code of [detail.code, detail.message]) {
      if (typeof code === "string" && Object.hasOwn(errorMessages, code))
        return code;
    }
  }
  return null;
}

export function sanitizeErrorMessage(
  codeOrMessage: string | null | undefined,
): string {
  if (!codeOrMessage) return kbttErrorMessage(null);
  const lower = codeOrMessage.toLowerCase();
  if (
    lower.includes("token") ||
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("bearer")
  ) {
    return kbttErrorMessage(null);
  }
  return kbttErrorMessage(codeOrMessage);
}

const GENERIC_HTTP_STATUS_TITLES = new Set([
  "BAD_REQUEST",
  "Bad Request",
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "Unauthorized",
  "FORBIDDEN",
  "Forbidden",
  "NOT_FOUND",
  "Not Found",
  "CONFLICT",
  "Conflict",
  "INTERNAL_SERVER_ERROR",
  "Internal Server Error",
  "BUSINESS_REJECTION",
  "REQUEST_FAILED",
  "Request failed",
  "OK",
]);

function isNonDescriptiveErrorText(text: string): boolean {
  return /^\d+$/.test(text) || GENERIC_HTTP_STATUS_TITLES.has(text);
}

export function sanitizeProviderDetail(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    const details = value
      .map((item) => sanitizeProviderDetail(item))
      .filter((item): item is string => item !== null && !isNonDescriptiveErrorText(item));
    if (details.length > 0) {
      return details.join("; ");
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    let fallbackNonDescriptive: string | null = null;
    for (const candidate of [
      record.detail,
      record.data,
      record.errors,
      record.issues,
      record.message,
      record.msg,
      record.error,
      record.description,
    ]) {
      const detail = sanitizeProviderDetail(candidate);
      if (detail) {
        if (!isNonDescriptiveErrorText(detail)) {
          return detail;
        }
        if (!fallbackNonDescriptive) {
          fallbackNonDescriptive = detail;
        }
      }
    }
    return fallbackNonDescriptive;
  }

  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, 5000);
  if (!text) return null;

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      const detail = sanitizeProviderDetail(parsed);
      if (detail) return detail;
    } catch {
      // not valid json
    }
  }

  const lower = text.toLowerCase();
  if (lower.includes("bearer ") || lower.includes("password=")) {
    return null;
  }
  return text;
}

export const kbttAutoSubmitConfigSchema = z.object({
  autoSubmitEnabled: z.boolean(),
  autoSubmitTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Giờ nộp tự động phải có định dạng HH:mm (00:00 - 23:59)")
    .nullable()
    .optional(),
});
export type KbttAutoSubmitConfig = z.infer<typeof kbttAutoSubmitConfigSchema>;

export const kbttAutoSubmitRunStatusSchema = z.enum([
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
]);
export type KbttAutoSubmitRunStatus = z.infer<typeof kbttAutoSubmitRunStatusSchema>;

export const kbttAutoSubmitRunSummarySchema = z.object({
  id: z.string(),
  hotelId: z.string(),
  scheduledFor: z.string(),
  startedAt: z.string().optional().nullable(),
  finishedAt: z.string().nullable().optional(),
  status: kbttAutoSubmitRunStatusSchema,
  dryRun: z.boolean().optional(),
  totalCount: z.number().int().nonnegative().optional(),
  totalEligible: z.number().int().nonnegative().optional(),
  successCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative().optional(),
  failureCount: z.number().int().nonnegative().optional(),
  unknownCount: z.number().int().nonnegative(),
  telegramSent: z.boolean().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type KbttAutoSubmitRunSummary = z.infer<typeof kbttAutoSubmitRunSummarySchema>;

export const kbttAutoSubmitStateSchema = z.object({
  autoSubmitEnabled: z.boolean(),
  autoSubmitTime: z.string().nullable().optional(),
  activeRun: kbttAutoSubmitRunSummarySchema.nullable().optional(),
  pendingSchedule: kbttAutoSubmitRunSummarySchema.nullable().optional(),
  recentRuns: z.array(kbttAutoSubmitRunSummarySchema).default([]),
});
export type KbttAutoSubmitState = z.infer<typeof kbttAutoSubmitStateSchema>;

export const kbttDevResetSchema = z.object({
  generateNewIdentityNumbers: z.boolean().optional().default(false),
});
export type KbttDevReset = z.infer<typeof kbttDevResetSchema>;

export const kbttDevOccupantUpdateItemSchema = z.object({
  occupantId: z.string().trim().min(1),
  identityNumber: z.string().trim().optional(),
  fullName: z.string().trim().optional(),
  nationality: z.string().trim().optional(),
  dateOfBirth: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  resetToDraft: z.boolean().optional().default(true),
});
export type KbttDevOccupantUpdateItem = z.infer<
  typeof kbttDevOccupantUpdateItemSchema
>;

export const kbttDevUpdateOccupantsSchema = z.object({
  occupants: z.array(kbttDevOccupantUpdateItemSchema).min(1),
});
export type KbttDevUpdateOccupants = z.infer<typeof kbttDevUpdateOccupantsSchema>;

export const kbttBatchSubmitSummarySchema = z.object({
  totalEligible: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative().optional().default(0),
  isDryRun: z.boolean().optional().default(false),
  scheduledTime: z.string().optional(),
});
export type KbttBatchSubmitSummary = z.infer<typeof kbttBatchSubmitSummarySchema>;


