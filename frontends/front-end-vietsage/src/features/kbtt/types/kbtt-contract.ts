import { z } from "zod";

export const kbttCredentialsSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
}).strict();

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

const errorMessages: Record<string, string> = {
  KBTT_NOT_CONFIGURED: "Chưa cấu hình tài khoản khai báo tạm trú.",
  KBTT_AUTH_FAILED: "Tài khoản hoặc mật khẩu không đúng. Vui lòng đăng nhập lại.",
  KBTT_MISSING_AUTHORITY: "Tài khoản chưa được cấp quyền khai báo tạm trú.",
  KBTT_PROVIDER_UNAVAILABLE: "Không thể kết nối hệ thống Bộ Công an. Vui lòng thử lại.",
  KBTT_PROVIDER_INVALID_RESPONSE: "Không thể kiểm tra kết nối. Vui lòng liên hệ hỗ trợ.",
  KBTT_CREDENTIAL_DECRYPT_FAILED: "Không thể kiểm tra kết nối. Vui lòng liên hệ hỗ trợ.",
};

export function kbttErrorMessage(code: string | null): string {
  return code && Object.hasOwn(errorMessages, code)
    ? errorMessages[code]
    : "Không thể xử lý kết nối. Vui lòng thử lại hoặc liên hệ hỗ trợ.";
}

export function kbttErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const candidate of [record.code, record.message, record.error]) {
    if (typeof candidate === "string" && Object.hasOwn(errorMessages, candidate)) return candidate;
  }
  for (const candidate of [record.data, record.error]) {
    if (!candidate || typeof candidate !== "object") continue;
    const detail = candidate as Record<string, unknown>;
    for (const code of [detail.code, detail.message]) {
      if (typeof code === "string" && Object.hasOwn(errorMessages, code)) return code;
    }
  }
  return null;
}
