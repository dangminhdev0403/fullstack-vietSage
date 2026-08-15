import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MarketplaceRecordStatus,
  Prisma,
  TenantType,
  TenantUserStatus,
  UserRoleStatus,
  UserStatus,
  UserType,
} from "@prisma/client";
import * as argon2 from "argon2";
import { calculateHaversineDistanceMeters } from "../../../common/geo-distance";
import { PrismaService } from "../../../prisma/prisma.service";
import { CodesService } from "../../codes/codes.service";
import type {
  HotelServiceLinkBody,
  MarketplaceCategoryBody,
  MarketplacePricingConfigBody,
  ServiceTenantBody,
  ServiceTenantUpdateBody,
} from "../domain/marketplace-admin.schema";

@Injectable()
export class MarketplaceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodesService,
  ) {}

  getPricingConfig() {
    return this.prisma.marketplacePricingConfig.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
  }

  updatePricingConfig(actorId: string, body: MarketplacePricingConfigBody) {
    return this.prisma.marketplacePricingConfig.upsert({
      where: { id: "default" },
      create: { id: "default", ...body, updatedBy: actorId },
      update: { ...body, updatedBy: actorId },
    });
  }

  listCategories() {
    return this.prisma.marketplaceCategory.findMany({
      include: { translations: { select: { locale: true, name: true } } },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
  }

  async createCategory(_actorId: string, body: MarketplaceCategoryBody) {
    const existing = await this.prisma.marketplaceCategory.findFirst({
      where: { nameVi: { equals: body.nameVi, mode: "insensitive" } },
    });
    if (existing) {
      throw new ConflictException("Tên danh mục đã tồn tại");
    }
    const { translations, ...categoryData } = body;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const code = await this.codes.generateEntityCode("MARKETPLACE_CATEGORY", tx);
        const category = await tx.marketplaceCategory.create({
          data: {
            ...categoryData,
            code,
            ...(translations && Object.keys(translations).length > 0
              ? {
                  translations: {
                    createMany: {
                      data: Object.entries(translations).map(([locale, name]) => ({
                        locale,
                        name,
                      })),
                    },
                  },
                }
              : {}),
          },
          include: { translations: { select: { locale: true, name: true } } },
        });
        return category;
      });
    } catch (error) {
      this.uniqueConflict(error, "Mã danh mục đã tồn tại");
      throw error;
    }
  }

  async updateCategory(
    _actorId: string,
    categoryId: string,
    body: Partial<MarketplaceCategoryBody>,
  ) {
    const currentCat = await this.prisma.marketplaceCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, nameVi: true },
    });
    if (!currentCat) throw new NotFoundException("Không tìm thấy danh mục");
    if (body.nameVi && body.nameVi.toLowerCase() !== currentCat.nameVi.toLowerCase()) {
      const existing = await this.prisma.marketplaceCategory.findFirst({
        where: {
          id: { not: categoryId },
          nameVi: { equals: body.nameVi, mode: "insensitive" },
        },
      });
      if (existing) {
        throw new ConflictException("Tên danh mục đã trùng với danh mục khác");
      }
    }
    const { translations, ...categoryData } = body;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (translations) {
          for (const [locale, name] of Object.entries(translations)) {
            await tx.marketplaceCategoryTranslation.upsert({
              where: { categoryId_locale: { categoryId, locale } },
              create: { categoryId, locale, name },
              update: { name },
            });
          }
        }
        return tx.marketplaceCategory.update({
          where: { id: categoryId },
          data: categoryData,
          include: { translations: { select: { locale: true, name: true } } },
        });
      });
    } catch (error) {
      this.uniqueConflict(error, "Mã danh mục đã tồn tại");
      throw error;
    }
  }

  async deleteCategory(_actorId: string, categoryId: string) {
    const existing = await this.prisma.marketplaceCategory.findUnique({
      where: { id: categoryId },
    });
    if (!existing) {
      throw new NotFoundException("Không tìm thấy danh mục");
    }

    const [tenantUsage, itemUsage] = await Promise.all([
      this.prisma.serviceTenantProfile.count({ where: { categoryId } }),
      this.prisma.marketplaceService.count({ where: { categoryId } }),
    ]);
    if (tenantUsage > 0 || itemUsage > 0) {
      throw new ConflictException(
        "Danh mục đang được sử dụng. Hãy tạm tắt hoặc chuyển đối tác sang danh mục khác trước khi xóa.",
      );
    }

    return this.prisma.marketplaceCategory.delete({ where: { id: categoryId } });
  }

  async listServiceTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { type: TenantType.SERVICE },
      include: {
        serviceProfile: { include: { category: true } },
        tenantUsers: {
          take: 5,
          orderBy: { createdAt: "asc" },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
                userType: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return tenants.map((tenant) => {
      const ownerUser =
        tenant.tenantUsers.find((tu) => tu.user?.userType === UserType.PARTNER)?.user ??
        tenant.tenantUsers.find((tu) => Boolean(tu.user?.email))?.user;
      return {
        ...tenant,
        ownerEmail: ownerUser?.email ?? null,
        ownerFullName: ownerUser?.fullName ?? null,
      };
    });
  }

  async listNearbyServiceTenants(hotelId: string) {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { latitude: true, longitude: true },
    });
    if (hotel.latitude == null || hotel.longitude == null) return [];

    const providers = await this.prisma.tenant.findMany({
      where: {
        type: TenantType.SERVICE,
        serviceProfile: {
          status: "ACTIVE",
          categoryId: { not: null },
          category: { isActive: true },
          latitude: { not: null },
          longitude: { not: null },
        },
      },
      include: {
        serviceProfile: true,
        marketplaceServices: {
          where: { status: "ACTIVE", category: { isActive: true } },
          orderBy: { name: "asc" },
          take: 100,
        },
        hotelServiceLinks: { where: { hotelId }, take: 1 },
      },
      take: 100,
    });

    // ponytail: bounded in-memory geo filter; use PostGIS after >100 active providers is measured.
    return providers
      .filter(
        (provider) =>
          provider.serviceProfile?.latitude != null && provider.serviceProfile.longitude != null,
      )
      .map((provider) => ({
        ...provider,
        distanceMeters: calculateHaversineDistanceMeters(
          Number(hotel.latitude),
          Number(hotel.longitude),
          Number(provider.serviceProfile!.latitude),
          Number(provider.serviceProfile!.longitude),
        ),
        linked: provider.hotelServiceLinks[0]?.status === "ACTIVE",
      }))
      .filter((provider) => provider.distanceMeters <= 30_000)
      .sort((left, right) => left.distanceMeters - right.distanceMeters);
  }

  async createServiceTenant(actorId: string, body: ServiceTenantBody) {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: body.owner.email.toLowerCase() },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException("Email tài khoản quản trị đã tồn tại trên hệ thống");
    }
    const existingTenant = await this.prisma.tenant.findFirst({
      where: { type: TenantType.SERVICE, name: { equals: body.displayName, mode: "insensitive" } },
      select: { id: true },
    });
    if (existingTenant) {
      throw new ConflictException("Tên thương hiệu đối tác dịch vụ đã tồn tại");
    }
    await this.activeCategory(body.categoryId);
    const passwordHash = await argon2.hash(body.owner.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const code = await this.codes.generateEntityCode("SERVICE_TENANT", tx);
        const role = await tx.role.upsert({
          where: { code: "SERVICE_STAFF" },
          update: { name: "Nhân viên Service Tenant", status: "ACTIVE" },
          create: { code: "SERVICE_STAFF", name: "Nhân viên Service Tenant", status: "ACTIVE" },
        });
        const servicePermissions = await tx.permission.findMany({
          where: { path: { in: ["service.marketplace.view", "service.marketplace.manage"] } },
          select: { id: true },
        });
        if (servicePermissions.length !== 2)
          throw new ConflictException("Quyền Service Marketplace chưa được đồng bộ");
        const tenant = await tx.tenant.create({
          data: {
            code,
            name: body.displayName,
            type: TenantType.SERVICE,
            serviceProfile: {
              create: {
                displayName: body.displayName,
                categoryId: body.categoryId,
                description: body.description,
                phone: body.phone,
                address: body.address,
                coverImageUrl: body.coverImageUrl,
                googleMapsUrl: body.googleMapsUrl,
                googleSheetsUrl: body.googleSheetsUrl,
                latitude: body.latitude,
                longitude: body.longitude,
                locationAccuracyMeters: body.locationAccuracyMeters,
                locationSource: body.locationSource,
                locationVerifiedAt: body.latitude == null ? null : new Date(),
                status: "ACTIVE",
              },
            },
          },
          include: { serviceProfile: true },
        });
        const owner = await tx.user.create({
          data: {
            email: body.owner.email.toLowerCase(),
            fullName: body.owner.fullName,
            passwordHash,
            status: UserStatus.ACTIVE,
            userType: UserType.PARTNER,
          },
        });
        await Promise.all([
          tx.rolePermission.createMany({
            data: servicePermissions.map((permission) => ({
              roleId: role.id,
              permissionId: permission.id,
            })),
            skipDuplicates: true,
          }),
          tx.tenantUser.create({
            data: {
              tenantId: tenant.id,
              userId: owner.id,
              status: TenantUserStatus.ACTIVE,
              joinedAt: new Date(),
            },
          }),
          tx.userRole.create({
            data: {
              userId: owner.id,
              roleId: role.id,
              status: UserRoleStatus.ACTIVE,
              assignedById: actorId,
            },
          }),
          this.audit(
            tx,
            actorId,
            tenant.id,
            "marketplace.service-tenant.create",
            "Tenant",
            tenant.id,
          ),
        ]);
        return {
          ...tenant,
          ownerEmail: owner.email,
          owner: { id: owner.id, email: owner.email, fullName: owner.fullName },
        };
      });
    } catch (error) {
      this.uniqueConflict(error, "Mã Service Tenant đã tồn tại");
      throw error;
    }
  }

  async updateServiceTenant(actorId: string, tenantId: string, body: ServiceTenantUpdateBody) {
    await this.serviceTenant(tenantId);
    if (body.categoryId) await this.activeCategory(body.categoryId);
    return this.prisma.$transaction(async (tx) => {
      const existingTenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });

      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(body.displayName ? { name: body.displayName } : {}),
          ...(body.displayName !== undefined ||
          body.status !== undefined ||
          body.categoryId !== undefined ||
          body.googleSheetsUrl !== undefined
            ? {
                serviceProfile: {
                  upsert: {
                    create: {
                      displayName: body.displayName ?? existingTenant?.name ?? "Service Partner",
                      categoryId: body.categoryId ?? undefined,
                      googleSheetsUrl: body.googleSheetsUrl ?? null,
                      status: (body.status as MarketplaceRecordStatus) ?? "ACTIVE",
                    },
                    update: {
                      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
                      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
                      ...(body.googleSheetsUrl !== undefined
                        ? { googleSheetsUrl: body.googleSheetsUrl }
                        : {}),
                      ...(body.status !== undefined
                        ? { status: body.status as MarketplaceRecordStatus }
                        : {}),
                    },
                  },
                },
              }
            : {}),
        },
        include: {
          serviceProfile: true,
          tenantUsers: {
            take: 10,
            orderBy: { createdAt: "asc" },
            include: { user: true },
          },
        },
      });

      if (body.categoryId) {
        await tx.marketplaceService.updateMany({
          where: { serviceTenantId: tenantId },
          data: { categoryId: body.categoryId },
        });
      }

      if (body.owner) {
        const ownerUser =
          tenant.tenantUsers.find((tu) => tu.user?.userType === UserType.PARTNER)?.user ??
          tenant.tenantUsers.find((tu) => Boolean(tu.user?.email))?.user;
        if (ownerUser) {
          const userUpdateData: Prisma.UserUpdateInput = {};
          if (
            body.owner.email &&
            body.owner.email.toLowerCase() !== ownerUser.email.toLowerCase()
          ) {
            const emailOccupied = await tx.user.findFirst({
              where: { id: { not: ownerUser.id }, email: body.owner.email.toLowerCase() },
              select: { id: true },
            });
            if (emailOccupied) {
              throw new ConflictException("Email mới đã được đăng ký bởi người dùng khác");
            }
            userUpdateData.email = body.owner.email.toLowerCase();
          }
          if (body.owner.fullName) {
            userUpdateData.fullName = body.owner.fullName;
          }
          if (body.owner.password && body.owner.password.trim().length >= 8) {
            userUpdateData.passwordHash = await argon2.hash(body.owner.password);
            await tx.authSession.updateMany({
              where: { userId: ownerUser.id, status: "ACTIVE" },
              data: {
                status: "REVOKED",
                revokeReason: "SECURITY_EVENT",
                revokedAt: new Date(),
              },
            });
            await tx.refreshToken.deleteMany({
              where: { userId: ownerUser.id },
            });
          }
          if (Object.keys(userUpdateData).length > 0) {
            await tx.user.update({
              where: { id: ownerUser.id },
              data: userUpdateData,
            });
          }
        } else if (body.owner.email || body.owner.fullName) {
          const email = (body.owner.email ?? "").toLowerCase().trim();
          const fullName = (body.owner.fullName ?? "").trim();
          if (!email || !fullName) {
            throw new BadRequestException(
              "Cần nhập đầy đủ Email và Họ tên để tạo tài khoản owner cho đối tác",
            );
          }

          let user = await tx.user.findFirst({
            where: { email },
          });

          if (user) {
            user = await tx.user.update({
              where: { id: user.id },
              data: {
                fullName,
                ...(body.owner.password && body.owner.password.trim().length >= 8
                  ? { passwordHash: await argon2.hash(body.owner.password) }
                  : {}),
              },
            });
          } else {
            const password =
              body.owner.password && body.owner.password.trim().length >= 8
                ? body.owner.password
                : "VietSage@2026";
            const passwordHash = await argon2.hash(password);
            user = await tx.user.create({
              data: {
                email,
                fullName,
                passwordHash,
                status: UserStatus.ACTIVE,
                userType: UserType.PARTNER,
              },
            });
          }

          await tx.tenantUser.create({
            data: {
              tenantId,
              userId: user.id,
              status: TenantUserStatus.ACTIVE,
              joinedAt: new Date(),
            },
          });

          const role = await tx.role.findFirst({
            where: { code: "SERVICE_STAFF" },
          });
          if (role) {
            await tx.userRole.create({
              data: {
                userId: user.id,
                roleId: role.id,
                status: UserRoleStatus.ACTIVE,
                assignedById: actorId,
              },
            });
          }
        } else if (body.owner.password) {
          throw new BadRequestException("Đối tác chưa có tài khoản owner để đặt lại mật khẩu.");
        }
      }

      await this.audit(
        tx,
        actorId,
        tenantId,
        "marketplace.service-tenant.update",
        "Tenant",
        tenantId,
      );

      const updatedTenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        include: {
          serviceProfile: true,
          tenantUsers: {
            take: 10,
            orderBy: { createdAt: "asc" },
            include: {
              user: { select: { id: true, email: true, fullName: true, userType: true } },
            },
          },
        },
      });

      const firstUser =
        updatedTenant?.tenantUsers.find((tu) => tu.user?.userType === UserType.PARTNER)?.user ??
        updatedTenant?.tenantUsers.find((tu) => Boolean(tu.user?.email))?.user;
      return {
        ...updatedTenant,
        ownerEmail: firstUser?.email ?? null,
        ownerFullName: firstUser?.fullName ?? null,
      };
    });
  }

  async listHotelLinks(hotelId: string) {
    const links = await this.prisma.hotelServiceLink.findMany({
      where: { hotelId },
      include: {
        serviceTenant: {
          include: {
            serviceProfile: true,
            tenantUsers: {
              take: 1,
              orderBy: { createdAt: "asc" },
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    fullName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 100,
    });

    return links.map((link) => ({
      ...link,
      serviceTenant: {
        ...link.serviceTenant,
        ownerEmail: link.serviceTenant.tenantUsers[0]?.user?.email ?? null,
      },
    }));
  }

  async setNearbyHotelLink(
    actorId: string,
    hotelId: string,
    serviceTenantId: string,
    body: HotelServiceLinkBody,
  ) {
    if (
      !(await this.listNearbyServiceTenants(hotelId)).some(
        (provider) => provider.id === serviceTenantId,
      )
    ) {
      throw new NotFoundException("Đối tác ngoài phạm vi liên kết");
    }
    return this.setHotelLink(actorId, hotelId, serviceTenantId, body);
  }

  async setHotelLink(
    actorId: string,
    hotelId: string,
    serviceTenantId: string,
    body: HotelServiceLinkBody,
  ) {
    await Promise.all([this.hotel(hotelId), this.serviceTenant(serviceTenantId)]);
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.hotelServiceLink.upsert({
        where: { hotelId_serviceTenantId: { hotelId, serviceTenantId } },
        create: { hotelId, serviceTenantId, ...body },
        update: body,
      });
      await this.audit(
        tx,
        actorId,
        serviceTenantId,
        "marketplace.hotel-link.set",
        "HotelServiceLink",
        link.id,
      );
      return link;
    });
  }

  disableHotelLink(actorId: string, hotelId: string, serviceTenantId: string) {
    return this.setHotelLink(actorId, hotelId, serviceTenantId, {
      status: "DISABLED",
      sortOrder: 0,
    });
  }

  private async category(id: string) {
    if (
      !(await this.prisma.marketplaceCategory.findUnique({ where: { id }, select: { id: true } }))
    )
      throw new NotFoundException("Không tìm thấy danh mục");
  }

  private async activeCategory(id: string) {
    const category = await this.prisma.marketplaceCategory.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
    if (!category) throw new NotFoundException("Danh mục không tồn tại hoặc đang tạm tắt");
  }

  private async hotel(id: string) {
    if (!(await this.prisma.hotel.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException("Không tìm thấy khách sạn");
  }

  private async serviceTenant(id: string) {
    if (
      !(await this.prisma.tenant.findFirst({
        where: { id, type: TenantType.SERVICE },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Không tìm thấy Service Tenant");
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    tenantId: string,
    action: string,
    entityType: string,
    entityId: string,
  ) {
    return tx.auditLog.create({ data: { actorId, tenantId, action, entityType, entityId } });
  }

  private uniqueConflict(error: unknown, message: string) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new ConflictException(message);
  }
}
