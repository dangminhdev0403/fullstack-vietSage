import { HttpMethod } from "@prisma/client";
import { z } from "zod";

export const createRoleBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "code phải có ít nhất 2 ký tự")
      .max(80, "code must not exceed 80 characters")
      .regex(/^[A-Z0-9_]+$/, "code can only contain A-Z, 0-9, and underscore"),
    name: z
      .string()
      .trim()
      .min(2, "name phải có ít nhất 2 ký tự")
      .max(120, "name must not exceed 120 characters"),
    description: z.string().max(255, "description must not exceed 255 characters").optional(),
  })
  .strict();

export const updateRoleBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "name phải có ít nhất 2 ký tự")
      .max(120, "name must not exceed 120 characters")
      .optional(),
    description: z.string().max(255, "description must not exceed 255 characters").optional(),
  })
  .strict();

export const replaceRolePermissionsBodySchema = z
  .object({
    permissionIds: z.array(z.string()),
  })
  .strict();

export const roleModulePermissionsBodySchema = z
  .object({
    permissionIds: z.array(z.string()).min(1, "permissionIds must contain at least one id"),
  })
  .strict();

export const listRolesQuerySchema = z
  .object({
    q: z.string().max(255, "q must not exceed 255 characters").optional(),
  })
  .strict();

export const listPermissionsQuerySchema = z
  .object({
    method: z.nativeEnum(HttpMethod).optional(),
    path: z.string().max(255, "path must not exceed 255 characters").optional(),
    q: z.string().max(255, "q must not exceed 255 characters").optional(),
  })
  .strict();

export const permissionModuleKeyParamSchema = z
  .object({
    moduleKey: z
      .string()
      .trim()
      .min(1, "moduleKey là bắt buộc")
      .max(80, "moduleKey must not exceed 80 characters")
      .regex(/^[a-z0-9_-]+$/, "moduleKey can only contain a-z, 0-9, underscore, and hyphen"),
  })
  .strict();

export const listRolePermissionModulePermissionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1, "page phải lớn hơn hoặc bằng 1").default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, "limit phải lớn hơn hoặc bằng 1")
      .max(100, "limit phải nhỏ hơn hoặc bằng 100")
      .default(50),
  })
  .strict();

export type CreateRoleBodyInput = z.infer<typeof createRoleBodySchema>;
export type UpdateRoleBodyInput = z.infer<typeof updateRoleBodySchema>;
export type ReplaceRolePermissionsBodyInput = z.infer<typeof replaceRolePermissionsBodySchema>;
export type RoleModulePermissionsBodyInput = z.infer<typeof roleModulePermissionsBodySchema>;
export type ListRolesQueryInput = z.infer<typeof listRolesQuerySchema>;
export type ListPermissionsQueryInput = z.infer<typeof listPermissionsQuerySchema>;
export type PermissionModuleKeyParamInput = z.infer<typeof permissionModuleKeyParamSchema>;
export type ListRolePermissionModulePermissionsQueryInput = z.infer<
  typeof listRolePermissionModulePermissionsQuerySchema
>;
