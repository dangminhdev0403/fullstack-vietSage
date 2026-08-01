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
});
