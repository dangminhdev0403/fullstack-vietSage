import { TenantUserStatus } from "@prisma/client";
import { parseWithZod } from "../../../../common/validation/parse-with-zod";
import {
  assignHotelUserRolesBodySchema,
  createHotelUserBodySchema,
  listHotelUsersQuerySchema,
  tenantHintQuerySchema,
  updateHotelUserStatusBodySchema,
} from "../../domain/schemas/hotel-users.schema";

describe("hotel-users.schema", () => {
  it("parses create payload with optional roleIds", () => {
    const result = parseWithZod(createHotelUserBodySchema, {
      email: "staff@hotel.local",
      fullName: "Staff A",
      password: "StrongPass123",
      tenantId: "tenant-1",
      roleIds: ["role-1"],
    });

    expect(result.email).toBe("staff@hotel.local");
    expect(result.roleIds).toEqual(["role-1"]);
  });

  it("coerces list query page/limit from string", () => {
    const result = parseWithZod(listHotelUsersQuerySchema, {
      page: "2",
      limit: "30",
      status: TenantUserStatus.ACTIVE,
    });

    expect(result).toEqual({
      page: 2,
      limit: 30,
      status: TenantUserStatus.ACTIVE,
    });
  });

  it("rejects INVITED status for update endpoint", () => {
    expect(() =>
      parseWithZod(updateHotelUserStatusBodySchema, {
        status: TenantUserStatus.INVITED,
      }),
    ).toThrow("status phải là một trong các giá trị: ACTIVE, DISABLED");
  });

  it("rejects empty roleIds for assignment", () => {
    expect(() => parseWithZod(assignHotelUserRolesBodySchema, { roleIds: [] })).toThrow(
      "roleIds phải có ít nhất 1 phần tử",
    );
  });

  it("rejects unknown fields in tenant hint query", () => {
    expect(() => parseWithZod(tenantHintQuerySchema, { tenantId: "tenant-1", extra: "x" })).toThrow(
      'Unrecognized key: "extra"',
    );
  });
});
