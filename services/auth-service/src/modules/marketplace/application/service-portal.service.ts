import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantType, TenantUserStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import type {
  MarketplaceAvailability,
  MarketplaceServiceBody,
  MarketplaceServiceUpdate,
  ServiceProfileBody,
} from "../domain/service-portal.schema";

@Injectable()
export class ServicePortalService {
  constructor(private readonly prisma: PrismaService) {}

  async tenantId(userId: string) {
    const memberships = await this.prisma.tenantUser.findMany({
      where: { userId, status: TenantUserStatus.ACTIVE, tenant: { type: TenantType.SERVICE } },
      select: { tenantId: true },
    });
    if (memberships.length === 0) {
      const anyMemberships = await this.prisma.tenantUser.findMany({
        where: { userId, tenant: { type: TenantType.SERVICE } },
        select: { tenantId: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      if (anyMemberships.length === 0) {
        throw new ForbiddenException(
          "Service Tenant membership is required and must be unambiguous",
        );
      }
      return anyMemberships[0].tenantId;
    }
    return memberships[0].tenantId;
  }

  async profile(userId: string) {
    const tenantId = await this.tenantId(userId);
    const profile = await this.prisma.serviceTenantProfile.findUnique({ where: { tenantId } });
    if (!profile) throw new NotFoundException("Service profile not found");
    return profile;
  }

  async updateProfile(userId: string, body: ServiceProfileBody) {
    const tenantId = await this.tenantId(userId);
    return this.prisma.serviceTenantProfile.update({
      where: { tenantId },
      data: { ...body, locationVerifiedAt: body.latitude == null ? undefined : new Date() },
    });
  }

  categories() {
    return this.prisma.marketplaceCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
  }

  async services(userId: string) {
    return this.prisma.marketplaceService.findMany({
      where: { serviceTenantId: await this.tenantId(userId) },
      include: { category: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  async createService(userId: string, body: MarketplaceServiceBody) {
    const serviceTenantId = await this.tenantId(userId);
    await this.activeCategory(body.categoryId);
    return this.prisma.marketplaceService.create({
      data: { ...body, serviceTenantId, currency: "VND" },
    });
  }

  async updateService(userId: string, serviceId: string, body: MarketplaceServiceUpdate) {
    const serviceTenantId = await this.tenantId(userId);
    if (body.categoryId) await this.activeCategory(body.categoryId);
    const result = await this.prisma.marketplaceService.updateMany({
      where: { id: serviceId, serviceTenantId },
      data: { ...body, version: { increment: 1 } },
    });
    if (result.count !== 1) throw new NotFoundException("Service not found");
    return this.prisma.marketplaceService.findFirstOrThrow({
      where: { id: serviceId, serviceTenantId },
    });
  }

  async updateAvailability(userId: string, serviceId: string, body: MarketplaceAvailability) {
    return this.updateService(userId, serviceId, body);
  }

  private async activeCategory(categoryId: string) {
    if (
      !(await this.prisma.marketplaceCategory.findFirst({
        where: { id: categoryId, isActive: true },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Category not found");
  }
}
