import { HttpMethod } from "@prisma/client";
import { parseWithZod } from "../../../../common/validation/parse-with-zod";
import {
  createRoleBodySchema,
  listRolePermissionModulePermissionsQuerySchema,
  listPermissionsQuerySchema,
  permissionModuleKeyParamSchema,
} from "../../schemas/rbac.schema";

describe("rbac.schema", () => {
  it("parses valid create role body", () => {
    const result = parseWithZod(createRoleBodySchema, {
      code: "HOTEL_MANAGER",
      name: "Hotel Manager",
      description: "Role for manager",
    });

    expect(result.code).toBe("HOTEL_MANAGER");
  });

  it("rejects create role code with lowercase letters", () => {
    expect(() =>
      parseWithZod(createRoleBodySchema, {
        code: "hotel_manager",
        name: "Hotel Manager",
      }),
    ).toThrow("code can only contain A-Z, 0-9, and underscore");
  });

  it("parses permission query with enum method", () => {
    const result = parseWithZod(listPermissionsQuerySchema, {
      method: HttpMethod.GET,
      q: "users",
    });

    expect(result).toEqual({ method: HttpMethod.GET, q: "users" });
  });

  it("parses module permission pagination query with defaults", () => {
    const result = parseWithZod(listRolePermissionModulePermissionsQuerySchema, {});

    expect(result).toEqual({ page: 1, limit: 50 });
  });

  it("rejects limit greater than 100", () => {
    expect(() =>
      parseWithZod(listRolePermissionModulePermissionsQuerySchema, {
        page: 1,
        limit: 101,
      }),
    ).toThrow("limit phải nhỏ hơn hoặc bằng 100");
  });

  it("rejects module key with uppercase letters", () => {
    expect(() => parseWithZod(permissionModuleKeyParamSchema, { moduleKey: "Users" })).toThrow(
      "moduleKey can only contain a-z, 0-9, underscore, and hyphen",
    );
  });
});
