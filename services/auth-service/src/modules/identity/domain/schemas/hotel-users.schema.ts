import { TenantUserStatus } from "@prisma/client";
import { z } from "zod";

const tenantUserStatusSchema = z.nativeEnum(TenantUserStatus);

export const createHotelUserBodySchema = z
  .object({
    email: z
      .string()
      .email("email phải là email hợp lệ")
      .max(320, "email không được vượt quá 320 ký tự"),
    fullName: z
      .string()
      .min(2, "fullName phải có ít nhất 2 ký tự")
      .max(120, "fullName không được vượt quá 120 ký tự"),
    password: z
      .string()
      .min(8, "password phải có ít nhất 8 ký tự")
      .max(128, "password không được vượt quá 128 ký tự"),

    roleIds: z
      .array(z.string().max(64, "mỗi giá trị trong roleIds không được vượt quá 64 ký tự"))
      .min(1, "roleIds phải có ít nhất 1 phần tử")
      .max(20, "roleIds không được có quá 20 phần tử")
      .optional(),
  })
  .strict();

export const listHotelUsersQuerySchema = z
  .object({
    page: z.coerce.number().int("page phải là số nguyên").min(1).optional(),
    limit: z.coerce.number().int("limit phải là số nguyên").min(1).max(100).optional(),
    status: tenantUserStatusSchema.optional(),
    q: z.string().max(120, "q không được vượt quá 120 ký tự").optional(),
  })
  .strict();

export const updateHotelUserStatusBodySchema = z
  .object({
    status: tenantUserStatusSchema.refine(
      (value) => value === TenantUserStatus.ACTIVE || value === TenantUserStatus.DISABLED,
      { message: "status phải là một trong các giá trị: ACTIVE, DISABLED" },
    ),
  })
  .strict();

export const assignHotelUserRolesBodySchema = z
  .object({
    roleIds: z
      .array(z.string().max(64, "mỗi giá trị trong roleIds không được vượt quá 64 ký tự"))
      .min(1, "roleIds phải có ít nhất 1 phần tử")
      .max(20, "roleIds không được có quá 20 phần tử"),
  })
  .strict();

export const userIdParamSchema = z.string().trim().min(1, "user id là bắt buộc");
export const roleIdParamSchema = z.string().trim().min(1, "role id là bắt buộc");

export type CreateHotelUserBodyInput = z.infer<typeof createHotelUserBodySchema>;
export type ListHotelUsersQueryInput = z.infer<typeof listHotelUsersQuerySchema>;
export type UpdateHotelUserStatusBodyInput = z.infer<typeof updateHotelUserStatusBodySchema>;
export type AssignHotelUserRolesBodyInput = z.infer<typeof assignHotelUserRolesBodySchema>;
