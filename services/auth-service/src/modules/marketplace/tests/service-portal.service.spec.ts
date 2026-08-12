import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { TenantType, TenantUserStatus } from "@prisma/client";
import { ServicePortalService } from "../application/service-portal.service";
import { marketplaceServiceBodySchema } from "../domain/service-portal.schema";

describe("Service portal scope", () => {
  it("requires exactly one active SERVICE membership", async () => {
    const prisma = { tenantUser: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new ServicePortalService(prisma as never, {} as never);
    await expect(service.tenantId("user-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenantUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          status: TenantUserStatus.ACTIVE,
          tenant: { type: TenantType.SERVICE },
        },
      }),
    );
  });

  it("scopes mutations by service tenant in the update query", async () => {
    const prisma = {
      tenantUser: { findMany: jest.fn().mockResolvedValue([{ tenantId: "service-a" }]) },
      marketplaceService: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new ServicePortalService(prisma as never, {} as never);
    await expect(
      service.updateService("user-1", "service-b-item", { name: "blocked" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.marketplaceService.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "service-b-item", serviceTenantId: "service-a" } }),
    );
  });
});

describe("Service item category ownership", () => {
  it("rejects client-supplied service codes", () => {
    expect(() =>
      marketplaceServiceBodySchema.parse({
        importKey: "manual_code",
        name: "Massage",
        unitPrice: 100,
        imageUrls: [],
        mode: "CUSTOMER_AT_SERVICE",
        status: "ACTIVE",
      }),
    ).toThrow();
  });

  it("rejects categoryId from Service Portal input", () => {
    expect(() =>
      marketplaceServiceBodySchema.parse({
        name: "Massage",
        unitPrice: 100,
        imageUrls: [],
        mode: "CUSTOMER_AT_SERVICE",
        status: "ACTIVE",
        categoryId: "category-1",
      }),
    ).toThrow();
  });
});
