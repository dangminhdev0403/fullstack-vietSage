import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TenantType, TenantUserStatus, UserRoleStatus, UserStatus, UserType } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../../../prisma/prisma.service";
import { CodesService } from "../../codes/codes.service";
import type { HotelServiceLinkBody, MarketplaceCategoryBody, ServiceTenantBody } from "../domain/marketplace-admin.schema";

@Injectable()
export class MarketplaceAdminService {
  constructor(private readonly prisma: PrismaService, private readonly codes: CodesService) {}

  listCategories() {
    return this.prisma.marketplaceCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  }

  async createCategory(_actorId: string, body: MarketplaceCategoryBody) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const code = await this.codes.generateEntityCode("MARKETPLACE_CATEGORY", tx);
        return tx.marketplaceCategory.create({ data: { ...body, code } });
      });
    } catch (error) {
      this.uniqueConflict(error, "Mã danh mục đã tồn tại");
      throw error;
    }
  }

  async updateCategory(_actorId: string, categoryId: string, body: Partial<MarketplaceCategoryBody>) {
    await this.category(categoryId);
    try {
      return await this.prisma.marketplaceCategory.update({ where: { id: categoryId }, data: body });
    } catch (error) {
      this.uniqueConflict(error, "Mã danh mục đã tồn tại");
      throw error;
    }
  }

  listServiceTenants() {
    return this.prisma.tenant.findMany({
      where: { type: TenantType.SERVICE },
      include: { serviceProfile: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async createServiceTenant(actorId: string, body: ServiceTenantBody) {
    const passwordHash = await argon2.hash(body.owner.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const code = await this.codes.generateEntityCode("SERVICE_TENANT", tx);
        const role = await tx.role.upsert({ where: { code: "SERVICE_STAFF" }, update: { name: "Nhân viên Service Tenant", status: "ACTIVE" }, create: { code: "SERVICE_STAFF", name: "Nhân viên Service Tenant", status: "ACTIVE" } });
        const servicePermissions = await tx.permission.findMany({ where: { path: { in: ["service.marketplace.view", "service.marketplace.manage"] } }, select: { id: true } });
        if (servicePermissions.length !== 2) throw new ConflictException("Quyền Service Marketplace chưa được đồng bộ");
        const tenant = await tx.tenant.create({
          data: {
            code,
            name: body.name,
            type: TenantType.SERVICE,
            serviceProfile: {
              create: {
                displayName: body.displayName,
                description: body.description,
                phone: body.phone,
                address: body.address,
                coverImageUrl: body.coverImageUrl,
                googleMapsUrl: body.googleMapsUrl,
                latitude: body.latitude,
                longitude: body.longitude,
                locationAccuracyMeters: body.locationAccuracyMeters,
                locationSource: body.locationSource,
                locationVerifiedAt: body.latitude == null ? null : new Date(),
              },
            },
          },
          include: { serviceProfile: true },
        });
        const owner = await tx.user.create({ data: { email: body.owner.email.toLowerCase(), fullName: body.owner.fullName, passwordHash, status: UserStatus.ACTIVE, userType: UserType.PARTNER } });
        await Promise.all([
          tx.rolePermission.createMany({ data: servicePermissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true }),
          tx.tenantUser.create({ data: { tenantId: tenant.id, userId: owner.id, status: TenantUserStatus.ACTIVE, joinedAt: new Date() } }),
          tx.userRole.create({ data: { userId: owner.id, roleId: role.id, status: UserRoleStatus.ACTIVE, assignedById: actorId } }),
          this.audit(tx, actorId, tenant.id, "marketplace.service-tenant.create", "Tenant", tenant.id),
        ]);
        return { ...tenant, owner: { id: owner.id, email: owner.email, fullName: owner.fullName } };
      });
    } catch (error) {
      this.uniqueConflict(error, "Mã Service Tenant đã tồn tại");
      throw error;
    }
  }

  listHotelLinks(hotelId: string) {
    return this.prisma.hotelServiceLink.findMany({
      where: { hotelId },
      include: { serviceTenant: { include: { serviceProfile: true } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 100,
    });
  }

  async setHotelLink(actorId: string, hotelId: string, serviceTenantId: string, body: HotelServiceLinkBody) {
    await Promise.all([this.hotel(hotelId), this.serviceTenant(serviceTenantId)]);
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.hotelServiceLink.upsert({
        where: { hotelId_serviceTenantId: { hotelId, serviceTenantId } },
        create: { hotelId, serviceTenantId, ...body },
        update: body,
      });
      await this.audit(tx, actorId, serviceTenantId, "marketplace.hotel-link.set", "HotelServiceLink", link.id);
      return link;
    });
  }

  disableHotelLink(actorId: string, hotelId: string, serviceTenantId: string) {
    return this.setHotelLink(actorId, hotelId, serviceTenantId, { status: "DISABLED", sortOrder: 0 });
  }

  private async category(id: string) {
    if (!(await this.prisma.marketplaceCategory.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException("Không tìm thấy danh mục");
  }

  private async hotel(id: string) {
    if (!(await this.prisma.hotel.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException("Không tìm thấy khách sạn");
  }

  private async serviceTenant(id: string) {
    if (!(await this.prisma.tenant.findFirst({ where: { id, type: TenantType.SERVICE }, select: { id: true } }))) throw new NotFoundException("Không tìm thấy Service Tenant");
  }

  private audit(tx: Prisma.TransactionClient, actorId: string, tenantId: string, action: string, entityType: string, entityId: string) {
    return tx.auditLog.create({ data: { actorId, tenantId, action, entityType, entityId } });
  }

  private uniqueConflict(error: unknown, message: string) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException(message);
  }
}
