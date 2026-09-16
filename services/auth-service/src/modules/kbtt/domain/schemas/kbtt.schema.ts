import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
export { hotelIdParamSchema } from "../../../property/property-public";

export const kbttCredentialsSchema = z
  .object({
    username: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, ""))
      .pipe(
        z
          .string()
          .min(1)
          .max(120)
          .refine(
            (value) =>
              ![...value].some((character) => {
                const code = character.charCodeAt(0);
                return code < 32 || code === 127;
              }),
          ),
      ),
    password: z.string().min(1).max(256),
  })
  .strict();

const providerId = z.string().regex(/^\d{1,32}$/);

export const kbttSessionSchema = z.object({
  AccessToken: z.string().min(1).max(8192),
  RefreshToken: z.string().min(1).max(8192),
  TokenType: z.literal("bearer"),
  Exp: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER / 1000),
  Authorities: z
    .array(z.string().max(120))
    .max(100)
    .refine((authorities) => authorities.includes("kbtt:create-3th")),
  ClientId: z.number().int().nonnegative(),
  LoaiTK: z.literal("CSLT"),
  CsltId: providerId,
  CsltKhuVuc: z.number().int().nonnegative().max(2147483647),
  CsltDonVi: z.number().int().nonnegative().max(2147483647),
  MaTTCuaCslt: providerId,
  MaPxCuaCslt: providerId,
  IsCsltChinh: z.boolean(),
});

export type KbttCredentials = z.infer<typeof kbttCredentialsSchema>;
export type KbttSession = z.infer<typeof kbttSessionSchema>;

export function kbttMetadata(session: KbttSession) {
  return {
    csltId: session.CsltId,
    csltKhuVuc: session.CsltKhuVuc,
    csltDonVi: session.CsltDonVi,
    maTTCuaCslt: session.MaTTCuaCslt,
    maPxCuaCslt: session.MaPxCuaCslt,
    isCsltChinh: session.IsCsltChinh,
  };
}

export const occupantIdParamSchema = z.string().trim().min(1).max(128);
export const stayIdParamSchema = z.string().trim().min(1).max(128);

export const kbttPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type KbttPaginationQuery = z.infer<typeof kbttPaginationQuerySchema>;

export function isValidCalendarDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isValidCalendarDateTime(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) return false;
  const [datePart, timePart] = str.split(" ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm, ss] = timePart.split(":").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return false;
  const date = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === hh &&
    date.getUTCMinutes() === mm &&
    date.getUTCSeconds() === ss
  );
}

export function getVietnamTodayStartStr(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day} 00:00:00`;
}

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
  "DRAFT",
  "READY",
  "SENDING",
  "SUBMITTED",
  "FAILED",
  "UNKNOWN",
  "CANCELLED",
]);
export type KbttDerivedStatus = z.infer<typeof kbttDerivedStatusSchema>;

export const kbttVietnameseDraftDataSchema = z
  .object({
    hoTen: z.string().trim().min(1).max(160).regex(/^[\p{L}]+(?:\s+[\p{L}]+)*$/u, "Họ tên chỉ được chứa chữ cái và khoảng trắng").optional(),
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
      .regex(/^[A-Za-z0-9]+$/, "Số giấy tờ không được chứa khoảng trắng hoặc ký tự đặc biệt")
      .max(32)
      .optional(),
  })
  .strict();

export const kbttForeignDraftDataSchema = z
  .object({
    hoTen: z.string().trim().min(1).max(160).regex(/^[\p{L}]+(?:\s+[\p{L}]+)*$/u, "Họ tên chỉ được chứa chữ cái và khoảng trắng").optional(),
    quocTich: z.string().trim().min(1).max(32).optional(),
    soHoChieu: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]+$/, "Số hộ chiếu không được chứa khoảng trắng hoặc ký tự đặc biệt")
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

export const kbttVietnameseReadySchema = z
  .object({
    hoTen: z.string({ message: "Họ tên là bắt buộc" }).trim().min(1, "Họ tên là bắt buộc").regex(/^[\p{L}]+(?:\s+[\p{L}]+)*$/u, "Họ tên chỉ được chứa chữ cái và khoảng trắng"),
    gioiTinh: z.enum(["M", "F"], { message: "Giới tính phải là M hoặc F" }),
    soDienThoai: z.string().trim().max(40).optional().nullable(),
    ngayThangNamSinhStr: z
      .string({ message: "Ngày sinh là bắt buộc" })
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày sinh phải đúng định dạng YYYY-MM-DD"),
    ghiChu: z.string().trim().max(500).optional().nullable(),
    noiCuTru: z.number().int().nonnegative().optional().nullable(),
    maTT: z.string().trim().max(32).optional().nullable(),
    maPX: z.string().trim().max(32).optional().nullable(),
    diaChi: z.string().trim().max(255).optional().nullable(),
    ngayDenCsltStr: z
      .string({ message: "Ngày đến là bắt buộc" })
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "Ngày đến phải đúng định dạng YYYY-MM-DD HH:mm:ss",
      ),
    ngayDiDuKienStr: z
      .string({ message: "Ngày đi dự kiến là bắt buộc" })
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "Ngày đi dự kiến phải đúng định dạng YYYY-MM-DD HH:mm:ss",
      ),
    soPhong: z
      .string({ message: "Số phòng là bắt buộc" })
      .trim()
      .min(1, "Số phòng là bắt buộc")
      .max(32),
    lyDoCuTru: z
      .number({ message: "Lý do cư trú là bắt buộc" })
      .int()
      .positive("Lý do cư trú là bắt buộc"),
    lyDoChiTiet: z.string().trim().max(255).optional().nullable(),
    loaiGiayTo: z
      .number({ message: "Loại giấy tờ là bắt buộc" })
      .int()
      .min(1)
      .max(8, "Loại giấy tờ phải từ 1 đến 8"),
    soGiayTo: z
      .string({ message: "Số giấy tờ là bắt buộc" })
      .trim()
      .regex(/^[A-Za-z0-9]+$/, "Số giấy tờ không hợp lệ"),
  })
  .superRefine((val, ctx) => {
    if (!isValidCalendarDate(val.ngayThangNamSinhStr)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ngày sinh không phải là ngày lịch hợp lệ",
        path: ["ngayThangNamSinhStr"],
      });
    }
    if (!isValidCalendarDateTime(val.ngayDenCsltStr)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ngày đến không phải là thời điểm lịch hợp lệ",
        path: ["ngayDenCsltStr"],
      });
    }
    if (!isValidCalendarDateTime(val.ngayDiDuKienStr)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ngày đi dự kiến không phải là thời điểm lịch hợp lệ",
        path: ["ngayDiDuKienStr"],
      });
    }
    if (
      isValidCalendarDateTime(val.ngayDenCsltStr) &&
      isValidCalendarDateTime(val.ngayDiDuKienStr) &&
      val.ngayDiDuKienStr < val.ngayDenCsltStr
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ngày đi dự kiến phải lớn hơn hoặc bằng ngày đến",
        path: ["ngayDiDuKienStr"],
      });
    }
    if (val.lyDoCuTru === 20 && (!val.lyDoChiTiet || !val.lyDoChiTiet.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Lý do chi tiết là bắt buộc khi lý do cư trú là 20",
        path: ["lyDoChiTiet"],
      });
    }
    if (val.loaiGiayTo === 1 || val.loaiGiayTo === 8) {
      if (!/^\d{12}$/.test(val.soGiayTo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CCCD / Căn Cước phải có đúng 12 chữ số",
          path: ["soGiayTo"],
        });
      }
    } else if (val.loaiGiayTo === 2) {
      if (!/^(?:\d{9}|\d{12})$/.test(val.soGiayTo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CMND phải có đúng 9 hoặc 12 chữ số",
          path: ["soGiayTo"],
        });
      }
    } else if (val.loaiGiayTo === 3 || val.loaiGiayTo === 6) {
      if (val.soGiayTo.length > 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Số giấy tờ không được vượt quá 20 ký tự",
          path: ["soGiayTo"],
        });
      }
    } else if (val.loaiGiayTo === 4) {
      if (val.soGiayTo.length > 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Hộ chiếu không được vượt quá 10 ký tự",
          path: ["soGiayTo"],
        });
      }
    }
  });

export const kbttForeignReadySchema = z
  .object({
    hoTen: z.string({ message: "Họ tên là bắt buộc" }).trim().min(1, "Họ tên là bắt buộc").regex(/^[\p{L}]+(?:\s+[\p{L}]+)*$/u, "Họ tên chỉ được chứa chữ cái và khoảng trắng"),
    quocTich: z
      .string({ message: "Quốc tịch là bắt buộc" })
      .trim()
      .min(1, "Quốc tịch là bắt buộc")
      .max(32),
    soHoChieu: z
      .string({ message: "Số hộ chiếu là bắt buộc" })
      .trim()
      .regex(/^[A-Za-z0-9]+$/, "Số hộ chiếu không hợp lệ")
      .min(1, "Số hộ chiếu là bắt buộc")
      .max(32),
    gioiTinh: z.enum(["M", "F"], { message: "Giới tính phải là M hoặc F" }),
    loaiNgayThangNamSinh: z.enum(["D", "Y"], { message: "Loại ngày sinh phải là D hoặc Y" }),
    ngayThangNamSinhStr: z
      .string({ message: "Ngày sinh là bắt buộc" })
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày sinh phải đúng định dạng YYYY-MM-DD"),
    ngayDenCsltStr: z
      .string({ message: "Ngày đến là bắt buộc" })
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "Ngày đến phải đúng định dạng YYYY-MM-DD HH:mm:ss",
      ),
    ngayDiDuKienStr: z
      .string({ message: "Ngày đi dự kiến là bắt buộc" })
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "Ngày đi dự kiến phải đúng định dạng YYYY-MM-DD HH:mm:ss",
      ),
    thoiHanTamTruStr: z
      .string({ message: "Thời hạn tạm trú là bắt buộc" })
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
        "Thời hạn tạm trú phải đúng định dạng YYYY-MM-DD HH:mm:ss",
      ),
    soPhong: z
      .string({ message: "Số phòng là bắt buộc" })
      .trim()
      .min(1, "Số phòng là bắt buộc")
      .max(32),
  })
  .superRefine((val, ctx) => {
    if (!isValidCalendarDate(val.ngayThangNamSinhStr)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ngày sinh không phải là ngày lịch hợp lệ",
        path: ["ngayThangNamSinhStr"],
      });
    } else if (val.loaiNgayThangNamSinh === "Y" && !val.ngayThangNamSinhStr.endsWith("-01-01")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Khi loại ngày sinh là Y, ngày sinh phải có định dạng YYYY-01-01",
        path: ["ngayThangNamSinhStr"],
      });
    }

    if (!isValidCalendarDateTime(val.ngayDenCsltStr)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ngày đến không phải là thời điểm lịch hợp lệ",
        path: ["ngayDenCsltStr"],
      });
    }

    if (!isValidCalendarDateTime(val.ngayDiDuKienStr)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ngày đi dự kiến không phải là thời điểm lịch hợp lệ",
        path: ["ngayDiDuKienStr"],
      });
    }

    if (
      isValidCalendarDateTime(val.ngayDenCsltStr) &&
      isValidCalendarDateTime(val.ngayDiDuKienStr) &&
      val.ngayDiDuKienStr < val.ngayDenCsltStr
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ngày đi dự kiến phải lớn hơn hoặc bằng ngày đến",
        path: ["ngayDiDuKienStr"],
      });
    }

    if (!isValidCalendarDateTime(val.thoiHanTamTruStr)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Thời hạn tạm trú không phải là thời điểm lịch hợp lệ",
        path: ["thoiHanTamTruStr"],
      });
    } else {
      if (
        isValidCalendarDateTime(val.ngayDenCsltStr) &&
        val.thoiHanTamTruStr < val.ngayDenCsltStr
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Thời hạn tạm trú không được trước ngày đến",
          path: ["thoiHanTamTruStr"],
        });
      }
      const todayStart = getVietnamTodayStartStr();
      if (val.thoiHanTamTruStr < todayStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Thời hạn tạm trú không được trước ngày hôm nay",
          path: ["thoiHanTamTruStr"],
        });
      }
    }
  });

const forbiddenKeys = new Set([
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
]);

export function validateNoForbiddenFields(raw: Record<string, unknown>) {
  for (const key of Object.keys(raw)) {
    if (forbiddenKeys.has(key)) {
      throw new BadRequestException(`Trường dữ liệu không hợp lệ: ${key}`);
    }
  }
}

export const saveKbttDraftSchema = z
  .object({
    citizenshipKind: citizenshipKindSchema,
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export function parseDraftPayload(body: unknown): {
  citizenshipKind: CitizenshipKind;
  data: Record<string, unknown>;
  allowSubmittedEdit?: boolean;
} {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Dữ liệu bản nháp không hợp lệ");
  }
  const raw = body as Record<string, unknown>;
  validateNoForbiddenFields(raw);

  const citizenshipKindRaw = raw.citizenshipKind;
  if (citizenshipKindRaw !== "VIETNAMESE" && citizenshipKindRaw !== "FOREIGN") {
    throw new BadRequestException(
      "Loại quốc tịch (citizenshipKind) là bắt buộc và phải là VIETNAMESE hoặc FOREIGN",
    );
  }
  const citizenshipKind = citizenshipKindRaw;
  const allowSubmittedEdit = Boolean(raw.allowSubmittedEdit ?? raw.forceDevEdit);

  const {
    citizenshipKind: _,
    allowSubmittedEdit: __,
    forceDevEdit: ___,
    data: nestedData,
    ...flatData
  } = raw;
  const targetData: Record<string, unknown> =
    nestedData && typeof nestedData === "object"
      ? { ...flatData, ...(nestedData as Record<string, unknown>) }
      : flatData;

  validateNoForbiddenFields(targetData);

  if (citizenshipKind === "VIETNAMESE") {
    const parsed = kbttVietnameseDraftDataSchema.safeParse(targetData);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new BadRequestException(`Dữ liệu khai báo Việt Nam không hợp lệ: ${issues}`);
    }
    return { citizenshipKind, data: parsed.data, allowSubmittedEdit };
  } else {
    const parsed = kbttForeignDraftDataSchema.safeParse(targetData);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new BadRequestException(`Dữ liệu khai báo người nước ngoài không hợp lệ: ${issues}`);
    }
    return { citizenshipKind, data: parsed.data, allowSubmittedEdit };
  }
}

export const kbttCatalogKindSchema = z.enum([
  "NATIONALITY",
  "PROVINCE",
  "WARD",
  "STAY_REASON",
  "DOCUMENT_TYPE",
  "RESIDENCE_PLACE",
]);
export type KbttCatalogKind = z.infer<typeof kbttCatalogKindSchema>;

export const kbttCatalogQuerySchema = z.object({
  parentCode: z.string().trim().optional(),
  includeInactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export type KbttCatalogQuery = z.infer<typeof kbttCatalogQuerySchema>;

export const kbttProviderCountrySchema = z.object({
  maQT: z.string().trim().min(1),
  tenQT: z.string().trim().min(1),
  tenQTEn: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
});
export type KbttProviderCountry = z.infer<typeof kbttProviderCountrySchema>;

export const kbttProviderProvinceSchema = z.object({
  maTT: z.string().trim().min(1),
  tenTT: z.string().trim().min(1),
  tenTTEn: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
  maTTChu: z.string().trim().optional().nullable(),
});
export type KbttProviderProvince = z.infer<typeof kbttProviderProvinceSchema>;

export const kbttProviderWardSchema = z.object({
  maPhuongXa: z.string().trim().min(1),
  tenPhuongXa: z.string().trim().min(1),
  tenPhuongXaEn: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null),
  trucThuocTinh: z.string().trim().optional().nullable(),
});
export type KbttProviderWard = z.infer<typeof kbttProviderWardSchema>;

export const kbttProviderNamedItemSchema = z.object({
  id: z.union([z.number(), z.string()]).transform((v) => String(v)),
  name: z.string().trim().min(1),
});
export type KbttProviderNamedItem = z.infer<typeof kbttProviderNamedItemSchema>;

export interface KbttCatalogItemView {
  id: string;
  kind: KbttCatalogKind;
  code: string;
  parentCode: string | null;
  nameVi: string;
  nameEn: string | null;
  isActive: boolean;
  fetchedAt: string;
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

export const kbttAutoSubmitTestQuerySchema = z.object({
  mode: z.enum(["dry-run", "live"]).default("dry-run"),
  dryRun: z
    .union([z.literal(true), z.literal("true"), z.literal("1")])
    .optional()
    .transform(() => true),
}).transform(({ mode }) => ({ dryRun: mode !== "live" }));
export type KbttAutoSubmitTestQuery = z.infer<typeof kbttAutoSubmitTestQuerySchema>;

export const kbttAutoSubmitScheduleSchema = z.object({
  mode: z.enum(["dry-run", "live"]).default("dry-run"),
});
export type KbttAutoSubmitSchedule = z.infer<typeof kbttAutoSubmitScheduleSchema>;

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
export type KbttDevOccupantUpdateItem = z.infer<typeof kbttDevOccupantUpdateItemSchema>;

export const kbttDevUpdateOccupantsSchema = z.object({
  occupants: z.array(kbttDevOccupantUpdateItemSchema).min(1),
});
export type KbttDevUpdateOccupants = z.infer<typeof kbttDevUpdateOccupantsSchema>;
