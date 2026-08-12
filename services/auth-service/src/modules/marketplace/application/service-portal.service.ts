import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TenantType, TenantUserStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import type {
  MarketplaceAvailability,
  MarketplaceServiceBody,
  MarketplaceServiceUpdate,
  ServiceProfileBody,
} from "../domain/service-portal.schema";
import { CodesService } from "../../codes/codes.service";

@Injectable()
export class ServicePortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodesService,
  ) {}

  async tenantId(userId: string) {
    const memberships = await this.prisma.tenantUser.findMany({
      where: { userId, status: TenantUserStatus.ACTIVE, tenant: { type: TenantType.SERVICE } },
      select: { tenantId: true },
    });
    if (memberships.length !== 1) {
      throw new ForbiddenException("Service Tenant membership is required and must be unambiguous");
    }
    return memberships[0].tenantId;
  }

  async profile(userId: string) {
    const tenantId = await this.tenantId(userId);
    const profile = await this.prisma.serviceTenantProfile.findUnique({
      where: { tenantId },
      include: { category: true },
    });
    if (!profile) throw new NotFoundException("Service profile not found");
    return profile;
  }

  async updateProfile(userId: string, body: ServiceProfileBody) {
    const tenantId = await this.tenantId(userId);
    return this.prisma.serviceTenantProfile.update({
      where: { tenantId },
      data: { ...body, locationVerifiedAt: body.latitude == null ? undefined : new Date() },
      include: { category: true },
    });
  }

  async services(userId: string) {
    const serviceTenantId = await this.tenantId(userId);
    const profile = await this.prisma.serviceTenantProfile.findUnique({
      where: { tenantId: serviceTenantId },
      include: { category: true },
    });
    if (!profile) throw new NotFoundException("Service profile not found");
    return this.prisma.marketplaceService
      .findMany({
        where: { serviceTenantId },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
      .then((items) =>
        items.map(({ categoryId: _legacyCategoryId, ...item }) => ({
          ...item,
          category: profile.category,
        })),
      );
  }

  async createService(userId: string, body: MarketplaceServiceBody) {
    const serviceTenantId = await this.tenantId(userId);
    const profile = await this.prisma.serviceTenantProfile.findUnique({
      where: { tenantId: serviceTenantId },
      select: { categoryId: true, category: { select: { id: true, isActive: true } } },
    });
    if (!profile?.categoryId || !profile.category?.isActive) {
      throw new ConflictException("Service Tenant chưa được gán danh mục hoạt động");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const importKey = await this.codes.generateEntityCode("MARKETPLACE_SERVICE", tx);
        return tx.marketplaceService.create({
          data: {
            ...body,
            importKey,
            serviceTenantId,
            categoryId: profile.categoryId!,
            currency: "VND",
          },
          include: { category: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("Mã dịch vụ đã tồn tại trong Service Tenant");
      throw error;
    }
  }

  async updateService(userId: string, serviceId: string, body: MarketplaceServiceUpdate) {
    const serviceTenantId = await this.tenantId(userId);
    let result;
    try {
      result = await this.prisma.marketplaceService.updateMany({
        where: { id: serviceId, serviceTenantId },
        data: { ...body, version: { increment: 1 } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("Mã dịch vụ đã tồn tại trong Service Tenant");
      throw error;
    }
    if (result.count !== 1) throw new NotFoundException("Service not found");
    const profile = await this.prisma.serviceTenantProfile.findUnique({
      where: { tenantId: serviceTenantId },
      select: { categoryId: true },
    });
    return this.prisma.marketplaceService
      .findFirstOrThrow({
        where: { id: serviceId, serviceTenantId },
      })
      .then(({ categoryId: _legacyCategoryId, ...item }) => ({
        ...item,
        category: profile?.categoryId ? { id: profile.categoryId } : null,
      }));
  }

  async updateAvailability(userId: string, serviceId: string, body: MarketplaceAvailability) {
    return this.updateService(userId, serviceId, body);
  }
}
