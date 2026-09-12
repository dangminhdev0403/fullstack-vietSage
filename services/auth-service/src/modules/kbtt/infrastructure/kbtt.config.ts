import { ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";

const base64 = z
  .string()
  .min(4)
  .max(4096)
  .refine((value) => Buffer.from(value, "base64").toString("base64") === value);
const configSchema = z
  .object({
    KBTT_LOGIN_BASIC_AUTH_VALUE: base64.optional(),
    KBTT_TOKEN_BASIC_AUTH_VALUE: base64.optional(),
    KBTT_CREDENTIAL_ENCRYPTION_KEY: base64
      .refine((value) => Buffer.from(value, "base64").length === 32)
      .optional(),
  })
  .refine(
    (config) =>
      [
        config.KBTT_LOGIN_BASIC_AUTH_VALUE,
        config.KBTT_TOKEN_BASIC_AUTH_VALUE,
        config.KBTT_CREDENTIAL_ENCRYPTION_KEY,
      ].filter(Boolean).length === 0 ||
      [
        config.KBTT_LOGIN_BASIC_AUTH_VALUE,
        config.KBTT_TOKEN_BASIC_AUTH_VALUE,
        config.KBTT_CREDENTIAL_ENCRYPTION_KEY,
      ].every(Boolean),
  );

export function loadKbttConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      "Invalid KBTT configuration: configure both Basic auth values and the 32-byte encryption key",
    );
  }
  return parsed.data;
}

export function kbttUnavailable() {
  return new ServiceUnavailableException({
    code: "KBTT_UNAVAILABLE",
    message: "Kết nối KBTT chưa sẵn sàng. Vui lòng liên hệ quản trị viên.",
  });
}
