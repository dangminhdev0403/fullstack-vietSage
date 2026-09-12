import { RoleStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { RbacRepository } from "../infrastructure/repositories/rbac.repository";

describe("RbacRepository", () => {
  it("lists only active non-super-admin roles", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new RbacRepository({ role: { findMany } } as unknown as PrismaService);

    await repository.listRolesWithRelations();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: RoleStatus.ACTIVE,
          code: { not: "SUPER_ADMIN" },
        },
      }),
    );
  });

  it("loads permission ceiling from only the session-bound active role", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      role: {
        code: "HOTEL_MANAGER",
        rolePermissions: [{ permissionId: "p1" }, { permissionId: "p2" }],
      },
    });
    const repository = new RbacRepository({
      userRole: { findFirst },
    } as unknown as PrismaService);

    await expect(repository.findActiveRoleAccess("user-1", "role-1")).resolves.toEqual({
      code: "HOTEL_MANAGER",
      permissionIds: ["p1", "p2"],
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          roleId: "role-1",
          status: "ACTIVE",
        }),
      }),
    );
  });
});
