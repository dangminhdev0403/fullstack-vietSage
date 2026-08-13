import { NotFoundException } from "@nestjs/common";
import { TenantType } from "@prisma/client";
import { MarketplaceAdminService } from "../application/marketplace-admin.service";
import {
  marketplaceCategoryBodySchema,
  serviceTenantBodySchema,
} from "../domain/marketplace-admin.schema";

const body = {
  displayName: "Spa",
  categoryId: "category-1",
  owner: { email: "spa@example.com", fullName: "Spa Owner", password: "Password123!" },
};

describe("Marketplace admin", () => {
  it("updates the PARTNER owner instead of the first tenant member", async () => {
    const userUpdate = jest.fn();
    const tenantUsers = [
      { user: { id: "staff-1", email: "staff@example.com", fullName: "Staff", userType: "STAFF" } },
      {
        user: { id: "owner-1", email: "owner@example.com", fullName: "Owner", userType: "PARTNER" },
      },
    ];
    const tx = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ name: "Spa" })
          .mockResolvedValueOnce({ tenantUsers, serviceProfile: {} }),
        update: jest.fn().mockResolvedValue({ tenantUsers, serviceProfile: {} }),
      },
      user: { findFirst: jest.fn(), update: userUpdate },
      auditLog: { create: jest.fn() },
    };
    const service = new MarketplaceAdminService(
      {
        tenant: { findFirst: jest.fn().mockResolvedValue({ id: "tenant-1" }) },
        $transaction: (fn: (value: unknown) => unknown) => fn(tx),
      } as never,
      {} as never,
    );

    await service.updateServiceTenant("admin-1", "tenant-1", {
      owner: { email: "owner@example.com", fullName: "Owner Updated" },
    });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "owner-1" },
      data: { fullName: "Owner Updated" },
    });
  });

  it("reassigns the tenant profile and legacy service rows atomically", async () => {
    const marketplaceServiceUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = {
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ name: "Spa" })
          .mockResolvedValueOnce({ tenantUsers: [], serviceProfile: {} }),
        update: jest.fn().mockResolvedValue({ tenantUsers: [], serviceProfile: {} }),
      },
      marketplaceService: { updateMany: marketplaceServiceUpdateMany },
      auditLog: { create: jest.fn() },
    };
    const service = new MarketplaceAdminService(
      {
        tenant: { findFirst: jest.fn().mockResolvedValue({ id: "tenant-1" }) },
        marketplaceCategory: { findFirst: jest.fn().mockResolvedValue({ id: "category-2" }) },
        $transaction: (fn: (value: unknown) => unknown) => fn(tx),
      } as never,
      {} as never,
    );

    await service.updateServiceTenant("admin-1", "tenant-1", { categoryId: "category-2" });

    expect(marketplaceServiceUpdateMany).toHaveBeenCalledWith({
      where: { serviceTenantId: "tenant-1" },
      data: { categoryId: "category-2" },
    });
  });

  it("lists only nearby mapped providers from nearest to farthest", async () => {
    const prisma = {
      hotel: { findUniqueOrThrow: jest.fn().mockResolvedValue({ latitude: 0, longitude: 0 }) },
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          { id: "far", serviceProfile: { latitude: 1, longitude: 1 }, hotelServiceLinks: [] },
          {
            id: "near",
            serviceProfile: { latitude: 0.01, longitude: 0.01 },
            hotelServiceLinks: [{ status: "ACTIVE" }],
          },
          {
            id: "unknown",
            serviceProfile: { latitude: null, longitude: null },
            hotelServiceLinks: [],
          },
        ]),
      },
    };
    const service = new MarketplaceAdminService(prisma as never, {} as never);

    const result = await service.listNearbyServiceTenants("hotel-1");

    expect(result.map((provider) => provider.id)).toEqual(["near"]);
    expect(result[0]).toEqual(expect.objectContaining({ linked: true, distanceMeters: 1573 }));
  });

  it("rejects linking a provider outside the nearby result", async () => {
    const service = new MarketplaceAdminService({} as never, {} as never);
    jest.spyOn(service, "listNearbyServiceTenants").mockResolvedValue([]);
    await expect(
      service.setNearbyHotelLink("actor-1", "hotel-1", "far-provider", {
        status: "ACTIVE",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("generates category codes instead of accepting System Code", async () => {
    const categoryCreate = jest.fn().mockResolvedValue({ id: "category-1" });
    const tx = {
      marketplaceCategory: { findFirst: jest.fn().mockResolvedValue(null), create: categoryCreate },
    };
    const codes = {
      generateEntityCode: jest.fn().mockResolvedValue("VSH_MARKETPLACE_CATEGORY_0001"),
    };
    const service = new MarketplaceAdminService(
      {
        marketplaceCategory: { findFirst: jest.fn().mockResolvedValue(null) },
        $transaction: (fn: (value: unknown) => unknown) => fn(tx),
      } as never,
      codes as never,
    );
    const input = marketplaceCategoryBodySchema.parse({
      code: "MANUAL",
      nameVi: "Spa",
      nameEn: "Spa",
      sortOrder: 0,
      isActive: true,
    });

    expect(input).not.toHaveProperty("code");
    await service.createCategory("admin-1", input);

    expect(codes.generateEntityCode).toHaveBeenCalledWith("MARKETPLACE_CATEGORY", tx);
    expect(categoryCreate).toHaveBeenCalledWith({
      data: { ...input, code: "VSH_MARKETPLACE_CATEGORY_0001" },
      include: { translations: { select: { locale: true, name: true } } },
    });
  });

  it("requires coordinates as a pair", () => {
    expect(() => serviceTenantBodySchema.parse({ ...body, latitude: 10 })).toThrow();
  });

  it("does not accept a manually supplied Service Tenant code", () => {
    expect(serviceTenantBodySchema.parse({ ...body, code: "MANUAL" })).not.toHaveProperty("code");
  });

  it("creates a SERVICE tenant and login-capable owner atomically", async () => {
    const tenantCreate = jest.fn().mockResolvedValue({ id: "service-1", serviceProfile: {} });
    const userCreate = jest
      .fn()
      .mockResolvedValue({ id: "owner-1", email: body.owner.email, fullName: body.owner.fullName });
    const tenantUserCreate = jest.fn().mockResolvedValue({});
    const userRoleCreate = jest.fn().mockResolvedValue({});
    const auditCreate = jest.fn().mockResolvedValue({});
    const tx = {
      role: { upsert: jest.fn().mockResolvedValue({ id: "service-role" }) },
      permission: { findMany: jest.fn().mockResolvedValue([{ id: "view" }, { id: "manage" }]) },
      rolePermission: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      tenant: { findFirst: jest.fn().mockResolvedValue(null), create: tenantCreate },
      user: { findFirst: jest.fn().mockResolvedValue(null), create: userCreate },
      tenantUser: { create: tenantUserCreate },
      userRole: { create: userRoleCreate },
      auditLog: { create: auditCreate },
    };
    const codes = { generateEntityCode: jest.fn().mockResolvedValue("VSH_SERVICE_TENANT_0001") };
    const service = new MarketplaceAdminService(
      {
        user: { findFirst: jest.fn().mockResolvedValue(null) },
        tenant: { findFirst: jest.fn().mockResolvedValue(null) },
        marketplaceCategory: { findFirst: jest.fn().mockResolvedValue({ id: "category-1" }) },
        $transaction: (fn: (value: unknown) => unknown) => fn(tx),
      } as never,
      codes as never,
    );

    await service.createServiceTenant("admin-1", serviceTenantBodySchema.parse(body));

    expect(codes.generateEntityCode).toHaveBeenCalledWith("SERVICE_TENANT", tx);
    expect(tenantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: "VSH_SERVICE_TENANT_0001",
          type: TenantType.SERVICE,
          serviceProfile: { create: expect.any(Object) },
        }),
      }),
    );
    expect(tenantUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "service-1", userId: "owner-1" }),
      }),
    );
    expect(userRoleCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roleId: "service-role" }) }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "service-1" }) }),
    );
  });

  it("rejects mapping to a HOTEL tenant", async () => {
    const prisma = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: "hotel-1" }) },
      tenant: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new MarketplaceAdminService(prisma as never, {} as never);
    await expect(
      service.setHotelLink("admin-1", "hotel-1", "hotel-tenant", {
        status: "ACTIVE",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "hotel-tenant", type: TenantType.SERVICE } }),
    );
  });
});
