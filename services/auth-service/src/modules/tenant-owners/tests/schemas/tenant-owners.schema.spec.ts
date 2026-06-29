import { TenantUserStatus, UserStatus } from "@prisma/client";
import { parseWithZod } from "../../../../common/validation/parse-with-zod";
import {
  createTenantOwnerBodySchema,
  listTenantOwnersQuerySchema,
  tenantOwnerIdParamSchema,
  updateTenantOwnerBodySchema,
} from "../../schemas/tenant-owners.schema";

describe("tenant-owners.schema", () => {
  it("parses list query filters", () => {
    const result = parseWithZod(listTenantOwnersQuerySchema, {
      tenantId: "tenant-1",
      ownerStatus: UserStatus.ACTIVE,
      tenantUserStatus: TenantUserStatus.ACTIVE,
      page: "2",
      limit: "10",
      q: "owner",
    });

    expect(result).toEqual({
      tenantId: "tenant-1",
      ownerStatus: UserStatus.ACTIVE,
      tenantUserStatus: TenantUserStatus.ACTIVE,
      page: 2,
      limit: 10,
      q: "owner",
    });
  });

  it("parses create tenant owner body", () => {
    const result = parseWithZod(createTenantOwnerBodySchema, {
      owner: {
        fullName: "Tenant Owner",
        email: "owner@example.com",
        password: "ChangeMe123!",
      },
      tenant: {
        name: "Riverside Hotel Group",
      },
    });

    expect(result.owner.email).toBe("owner@example.com");
    expect(result.tenant.name).toBe("Riverside Hotel Group");
  });

  it("rejects invalid create tenant owner body", () => {
    expect(() =>
      parseWithZod(createTenantOwnerBodySchema, {
        owner: {
          fullName: "A",
          email: "not-email",
          password: "short",
        },
        tenant: {
          name: "R",
        },
      }),
    ).toThrow();
  });

  it("parses update tenant owner body", () => {
    const result = parseWithZod(updateTenantOwnerBodySchema, {
      owner: { fullName: "Updated Owner", status: UserStatus.LOCKED },
      tenant: { name: "Updated Tenant" },
      tenantUserStatus: TenantUserStatus.DISABLED,
    });

    expect(result).toEqual({
      owner: { fullName: "Updated Owner", status: UserStatus.LOCKED },
      tenant: { name: "Updated Tenant" },
      tenantUserStatus: TenantUserStatus.DISABLED,
    });
  });

  it("rejects empty update tenant owner body", () => {
    expect(() => parseWithZod(updateTenantOwnerBodySchema, {})).toThrow(
      "Cần cung cấp ít nhất một trường của chủ đơn vị",
    );
  });

  it("parses tenant owner User.id param", () => {
    expect(parseWithZod(tenantOwnerIdParamSchema, " user-1 ")).toBe("user-1");
  });
});
