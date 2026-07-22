import { z } from "zod";

export const loginCredentialsSchema = z
  .object({
    email: z
      .string()
      .transform((val) => val.replace(/\s+/g, ""))
      .pipe(
        z
          .string()
          .min(1, "email là bắt buộc")
          .max(320, "email không được vượt quá 320 ký tự")
          .email("email phải là địa chỉ email hợp lệ"),
      ),
    password: z
      .string()
      .min(1, "password là bắt buộc")
      .max(256, "password không được vượt quá 256 ký tự"),
  })
  .strict();

export const refreshTokenBodySchema = z
  .object({
    refreshToken: z.unknown().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (typeof data.refreshToken !== "string" || data.refreshToken.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["refreshToken"],
        message: "refreshToken là bắt buộc",
      });
    }
  })
  .transform((data) => ({
    refreshToken: (data.refreshToken as string).trim(),
  }));

export type LoginCredentialsInput = z.infer<typeof loginCredentialsSchema>;
export type RefreshTokenBodyInput = z.infer<typeof refreshTokenBodySchema>;
