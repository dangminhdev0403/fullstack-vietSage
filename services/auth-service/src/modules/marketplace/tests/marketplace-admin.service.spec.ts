import { NotFoundException } from "@nestjs/common";
import { TenantType } from "@prisma/client";
import { MarketplaceAdminService } from "../application/marketplace-admin.service";
import { serviceTenantBodySchema } from "../domain/marketplace-admin.schema";

const body = { code: "SPA", name: "Spa", displayName: "Spa", owner: { email: "spa@example.com", fullName: "Spa Owner", password: "Password123!" } };

describe("Marketplace admin", () => {
  it("requires coordinates as a pair", () => {
    expect(() => serviceTenantBodySchema.parse({ ...body, latitude: 10 })).toThrow();
  });

  it("creates a SERVICE tenant and login-capable owner atomically", async () => {
    const tenantCreate = jest.fn().mockResolvedValue({ id: "service-1", serviceProfile: {} });
    const userCreate = jest.fn().mockResolvedValue({ id: "owner-1", email: body.owner.email, fullName: body.owner.fullName });
    const tenantUserCreate = jest.fn().mockResolvedValue({});
    const userRoleCreate = jest.fn().mockResolvedValue({});
    const auditCreate = jest.fn().mockResolvedValue({});
    const tx = {
      role: { upsert: jest.fn().mockResolvedValue({ id: "service-role" }) },
      permission: { findMany: jest.fn().mockResolvedValue([{ id: "view" }, { id: "manage" }]) },
      rolePermission: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      tenant: { create: tenantCreate }, user: { create: userCreate },
      tenantUser: { create: tenantUserCreate }, userRole: { create: userRoleCreate }, auditLog: { create: auditCreate },
    };
    const service = new MarketplaceAdminService({ $transaction: (fn: (value: unknown) => unknown) => fn(tx) } as never);

    await service.createServiceTenant("admin-1", serviceTenantBodySchema.parse(body));

    expect(tenantCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: TenantType.SERVICE, serviceProfile: { create: expect.any(Object) } }) }));
    expect(tenantUserCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: "service-1", userId: "owner-1" }) }));
    expect(userRoleCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roleId: "service-role" }) }));
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: "service-1" }) }));
  });

  it("rejects mapping to a HOTEL tenant", async () => {
    const prisma = { hotel: { findUnique: jest.fn().mockResolvedValue({ id: "hotel-1" }) }, tenant: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new MarketplaceAdminService(prisma as never);
    await expect(service.setHotelLink("admin-1", "hotel-1", "hotel-tenant", { status: "ACTIVE", sortOrder: 0 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "hotel-tenant", type: TenantType.SERVICE } }));
  });
});
