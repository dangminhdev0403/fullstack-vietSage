import { HttpMethod } from "@prisma/client";
import { parseWithZod } from "../../../../common/validation/parse-with-zod";
import {
  listRolesQuerySchema,
  listRolePermissionModulePermissionsQuerySchema,
  listPermissionsQuerySchema,
  permissionModuleKeyParamSchema,
} from "../../domain/schemas/rbac.schema";

describe("rbac.schema", () => {
  it("parses valid list roles query", () => {
    const result = parseWithZod(listRolesQuerySchema, {
      q: "frontdesk",
    });

    expect(result).toEqual({ q: "frontdesk" });
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
