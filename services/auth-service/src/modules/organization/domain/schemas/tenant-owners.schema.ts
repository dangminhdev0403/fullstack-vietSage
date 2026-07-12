import { TenantUserStatus, UserStatus } from "@prisma/client";
import { z } from "zod";

export const tenantOwnerIdParamSchema = z.string().trim().min(1, "id là bắt buộc");

export const listTenantOwnersQuerySchema = z
  .object({
    tenantId: z.string().trim().max(80, "tenantId không được vượt quá 80 ký tự").optional(),
    ownerStatus: z.nativeEnum(UserStatus).optional(),
    tenantUserStatus: z.nativeEnum(TenantUserStatus).optional(),
    page: z.coerce.number().int().min(1, "page phải lớn hơn hoặc bằng 1").optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1, "limit phải lớn hơn hoặc bằng 1")
      .max(100, "limit phải nhỏ hơn hoặc bằng 100")
      .optional(),
    q: z.string().trim().max(120, "q không được vượt quá 120 ký tự").optional(),
  })
  .strict();

export const createTenantOwnerBodySchema = z
  .object({
    owner: z
      .object({
        fullName: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(320),
        password: z.string().min(8).max(128),
      })
      .strict(),
    tenant: z
      .object({
        name: z.string().trim().min(2).max(160),
      })
      .strict(),
  })
  .strict();

export const updateTenantOwnerBodySchema = z
  .object({
    owner: z
      .object({
        fullName: z.string().trim().min(2).max(120).optional(),
        status: z.nativeEnum(UserStatus).optional(),
      })
      .strict()
      .optional(),
    tenant: z
      .object({
        name: z.string().trim().min(2).max(160).optional(),
      })
      .strict()
      .optional(),
    tenantUserStatus: z.nativeEnum(TenantUserStatus).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.tenantUserStatus !== undefined ||
      Object.keys(value.owner ?? {}).length > 0 ||
      Object.keys(value.tenant ?? {}).length > 0,
    { message: "Cần cung cấp ít nhất một trường của chủ đơn vị" },
  );

export type ListTenantOwnersQueryInput = z.infer<typeof listTenantOwnersQuerySchema>;
export type CreateTenantOwnerBodyInput = z.infer<typeof createTenantOwnerBodySchema>;
export type UpdateTenantOwnerBodyInput = z.infer<typeof updateTenantOwnerBodySchema>;
