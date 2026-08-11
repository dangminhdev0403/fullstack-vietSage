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

export const passwordPolicyZodSchema = z
  .string()
  .min(8, "Mật khẩu phải có tối thiểu 8 ký tự")
  .max(128, "Mật khẩu không được vượt quá 128 ký tự")
  .refine((val) => /[A-Z]/.test(val), "Mật khẩu phải chứa ít nhất 1 chữ hoa")
  .refine((val) => /[a-z]/.test(val), "Mật khẩu phải chứa ít nhất 1 chữ thường")
  .refine((val) => /\d/.test(val), "Mật khẩu phải chứa ít nhất 1 chữ số")
  .refine(
    (val) => /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(val),
    "Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt",
  );

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, "Mật khẩu hiện tại là bắt buộc"),
    newPassword: passwordPolicyZodSchema,
  })
  .strict();

export type ChangePasswordBodyInput = z.infer<typeof changePasswordBodySchema>;
