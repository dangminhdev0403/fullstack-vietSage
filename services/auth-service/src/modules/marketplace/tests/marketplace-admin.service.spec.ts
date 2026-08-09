import { NotFoundException } from "@nestjs/common";
import { TenantType } from "@prisma/client";
import { MarketplaceAdminService } from "../application/marketplace-admin.service";
import { serviceTenantBodySchema } from "../domain/marketplace-admin.schema";

describe("Marketplace admin", () => {
  it("requires coordinates as a pair", () => {
    expect(() => serviceTenantBodySchema.parse({ code: "SPA", name: "Spa", displayName: "Spa", latitude: 10 })).toThrow();
  });

  it("creates only a SERVICE tenant with its profile", async () => {
    const create = jest.fn().mockResolvedValue({ id: "service-1" });
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: (fn: (tx: unknown) => unknown) => fn({ tenant: { create }, auditLog: { create: auditCreate } }),
    };
    const service = new MarketplaceAdminService(prisma as never);

    await service.createServiceTenant("admin-1", serviceTenantBodySchema.parse({ code: "SPA", name: "Spa", displayName: "Spa" }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: TenantType.SERVICE, serviceProfile: { create: expect.any(Object) } }),
    }));
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: "service-1" }) }));
  });

  it("rejects mapping to a HOTEL tenant", async () => {
    const prisma = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: "hotel-1" }) },
      tenant: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new MarketplaceAdminService(prisma as never);

    await expect(service.setHotelLink("admin-1", "hotel-1", "hotel-tenant", { status: "ACTIVE", sortOrder: 0 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "hotel-tenant", type: TenantType.SERVICE } }));
  });
});
