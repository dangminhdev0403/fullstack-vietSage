import { Injectable } from "@nestjs/common";
import { LocalMateStatus, Prisma, TourScope } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import type {
  CreateLocalMateGuideDto,
  UpdateLocalMateGuideDto,
  ListLocalMateGuidesQueryDto,
} from "../../domain/schemas/localmate.schema";

@Injectable()
export class LocalMateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async generateNextGuideCode(): Promise<string> {
    const count = await this.prisma.localMateProfile.count();
    const sequence = String(count + 1).padStart(3, "0");
    return `LM-${sequence}`;
  }

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findRoleByCode(code: string) {
    return this.prisma.role.findUnique({
      where: { code },
    });
  }

  async findRootTenant() {
    return this.prisma.tenant.findUnique({
      where: { code: "VIETSAGE_ROOT" },
    });
  }

  async createGuideUser(params: {
    email: string;
    fullName: string;
    passwordHash: string;
    roleId?: string;
    tenantId?: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: params.email,
        fullName: params.fullName,
        passwordHash: params.passwordHash,
        status: "ACTIVE",
        userType: "PARTNER",
        ...(params.roleId && {
          userRoles: {
            create: {
              roleId: params.roleId,
              status: "ACTIVE",
            },
          },
        }),
        ...(params.tenantId && {
          tenantUsers: {
            create: {
              tenantId: params.tenantId,
              status: "ACTIVE",
            },
          },
        }),
      },
    });
  }

  async updateUserStatus(userId: string, status: "ACTIVE" | "DISABLED") {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });
  }

  async createGuide(dto: CreateLocalMateGuideDto) {
    const guideCode = dto.guideCode || (await this.generateNextGuideCode());
    return this.prisma.localMateProfile.create({
      data: {
        guideCode,
        userId: dto.userId || null,
        tenantId: dto.tenantId || null,
        position: dto.position || "GUIDE",
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email || null,
        avatarUrl: dto.avatarUrl,
        status: dto.status || LocalMateStatus.PENDING,
        languages: dto.languages,
        operatingRegions: dto.operatingRegions,
        specialties: dto.specialties,
        bio: dto.bio || null,
        dailyRateVnd: dto.dailyRateVnd,
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, status: true },
        },
      },
    });
  }

  async updateGuide(id: string, dto: UpdateLocalMateGuideDto) {
    return this.prisma.localMateProfile.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email || null }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.userId !== undefined && { userId: dto.userId || null }),
        ...(dto.tenantId !== undefined && { tenantId: dto.tenantId || null }),
        ...(dto.languages !== undefined && { languages: dto.languages }),
        ...(dto.operatingRegions !== undefined && { operatingRegions: dto.operatingRegions }),
        ...(dto.specialties !== undefined && { specialties: dto.specialties }),
        ...(dto.bio !== undefined && { bio: dto.bio || null }),
        ...(dto.dailyRateVnd !== undefined && { dailyRateVnd: dto.dailyRateVnd }),
      },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, status: true },
        },
      },
    });
  }

  async findGuideById(id: string) {
    return this.prisma.localMateProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, status: true },
        },
      },
    });
  }

  async findGuideByCode(guideCode: string) {
    return this.prisma.localMateProfile.findUnique({
      where: { guideCode },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, status: true },
        },
      },
    });
  }

  async listGuides(query: ListLocalMateGuidesQueryDto) {
    const where: Prisma.LocalMateProfileWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.region) {
      where.operatingRegions = { has: query.region };
    }
    if (query.language) {
      where.languages = { has: query.language };
    }
    if (query.position) {
      where.position = query.position;
    }
    if (query.tenantId) {
      where.tenantId = query.tenantId;
    }
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: "insensitive" } },
        { guideCode: { contains: query.search, mode: "insensitive" } },
        { bio: { contains: query.search, mode: "insensitive" } },
        { position: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [total, items] = await Promise.all([
      this.prisma.localMateProfile.count({ where }),
      this.prisma.localMateProfile.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
        include: {
          user: {
            select: { id: true, email: true, fullName: true, status: true },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async findQualifiedGuides(options: { destination?: string; limit?: number } = {}) {
    return this.prisma.localMateProfile.findMany({
      where: {
        status: LocalMateStatus.QUALIFIED,
        ...(options.destination ? { operatingRegions: { has: options.destination } } : {}),
      },
      ...(options.limit ? { take: options.limit } : {}),
      orderBy: [{ rating: "desc" }, { totalReviews: "desc" }, { guideCode: "asc" }],
    });
  }

  async findHotelLocation(hotelId: string) {
    return this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: {
        id: true,
        name: true,
        provinceCode: true,
        province: true,
        area: true,
      },
    });
  }

  async findToursByDestination(
    options?:
      | {
          destination?: string;
          provinceCode?: string;
          tourScope?: TourScope;
          limit?: number;
        }
      | string,
    limit = 5,
  ) {
    const opts = typeof options === "string" ? { destination: options, limit } : options || {};
    const effectiveLimit = opts.limit ?? limit;

    const conditions: Prisma.LocalMateTourKnowledgeWhereInput[] = [];

    if (opts.destination) {
      conditions.push({
        OR: [
          { destination: { contains: opts.destination, mode: "insensitive" } },
          { title: { contains: opts.destination, mode: "insensitive" } },
        ],
      });
    }

    if (opts.provinceCode) {
      conditions.push({ provinceCode: opts.provinceCode });
    }

    if (opts.tourScope) {
      conditions.push({ tourScope: opts.tourScope });
    }

    const where: Prisma.LocalMateTourKnowledgeWhereInput =
      conditions.length > 0 ? { AND: conditions } : {};

    return this.prisma.localMateTourKnowledge.findMany({
      where,
      take: effectiveLimit,
      orderBy: [{ createdAt: "desc" }, { tourCode: "asc" }],
    });
  }

  async findTourByCode(tourCode: string) {
    return this.prisma.localMateTourKnowledge.findUnique({
      where: { tourCode },
    });
  }

  async listTourKnowledge(limit = 50) {
    return this.prisma.localMateTourKnowledge.findMany({
      take: limit,
      orderBy: { tourCode: "asc" },
    });
  }

  async searchTourKnowledge(query?: {
    destination?: string;
    search?: string;
    provinceCode?: string;
    tourScope?: TourScope;
    limit?: number;
  }) {
    const conditions: Prisma.LocalMateTourKnowledgeWhereInput[] = [];

    if (query?.destination) {
      conditions.push({
        OR: [
          { destination: { contains: query.destination, mode: "insensitive" } },
          { title: { contains: query.destination, mode: "insensitive" } },
        ],
      });
    }

    if (query?.search) {
      conditions.push({
        OR: [
          { title: { contains: query.search, mode: "insensitive" } },
          { destination: { contains: query.search, mode: "insensitive" } },
          { content: { contains: query.search, mode: "insensitive" } },
        ],
      });
    }

    if (query?.provinceCode) {
      conditions.push({ provinceCode: query.provinceCode });
    }

    if (query?.tourScope) {
      conditions.push({ tourScope: query.tourScope });
    }

    const where: Prisma.LocalMateTourKnowledgeWhereInput =
      conditions.length > 0 ? { AND: conditions } : {};

    return this.prisma.localMateTourKnowledge.findMany({
      where,
      take: query?.limit || 50,
      orderBy: [{ createdAt: "desc" }, { tourCode: "asc" }],
    });
  }

  async findTourById(id: string) {
    return this.prisma.localMateTourKnowledge.findUnique({ where: { id } });
  }

  async createTour(data: Prisma.LocalMateTourKnowledgeCreateInput) {
    return this.prisma.localMateTourKnowledge.create({ data });
  }

  async updateTour(id: string, data: Prisma.LocalMateTourKnowledgeUpdateInput) {
    return this.prisma.localMateTourKnowledge.update({ where: { id }, data });
  }

  async deleteTour(id: string) {
    return this.prisma.localMateTourKnowledge.delete({ where: { id } });
  }

  async upsertTourKnowledge(data: {
    tourCode: string;
    title: string;
    destination: string;
    duration: string;
    highlights: string[];
    content: string;
    sourceFileName?: string;
  }) {
    return this.prisma.localMateTourKnowledge.upsert({
      where: { tourCode: data.tourCode },
      update: { ...data },
      create: { ...data },
    });
  }
}
