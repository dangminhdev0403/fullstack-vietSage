import { Injectable } from "@nestjs/common";
import { Prisma, RoleStatus, TenantUserStatus, UserRoleStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { hotelDetailInclude } from "./hotel-repository.types";

@Injectable()
export class HotelCoreRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findActorById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userRoles: {
          where: {
            status: UserRoleStatus.ACTIVE,
            role: { status: RoleStatus.ACTIVE },
          },
          select: {
            role: {
              select: { code: true },
            },
          },
        },
        tenantUsers: {
          where: { status: TenantUserStatus.ACTIVE },
          select: { tenantId: true },
        },
      },
    });
  }

  async findTenantById(tenantId: string) {
    return this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  }

  async createHotel(data: Prisma.HotelCreateInput) {
    return this.prisma.hotel.create({ data, include: hotelDetailInclude });
  }

  async listHotels(where: Prisma.HotelWhereInput, skip: number, take: number) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.hotel.count({ where });
      const rows = await tx.hotel.findMany({
        where,
        include: hotelDetailInclude,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async findHotelById(hotelId: string) {
    return this.prisma.hotel.findUnique({
      where: { id: hotelId },
      include: hotelDetailInclude,
    });
  }

  async findHotelByIdAndTenantIds(hotelId: string, tenantIds: string[]) {
    return this.prisma.hotel.findFirst({
      where: { id: hotelId, tenantId: { in: tenantIds } },
      include: hotelDetailInclude,
    });
  }

  async updateHotel(hotelId: string, data: Prisma.HotelUpdateInput) {
    return this.prisma.hotel.update({
      where: { id: hotelId },
      data,
      include: hotelDetailInclude,
    });
  }

  async updateHotelScoped(hotelId: string, tenantIds: string[], data: Prisma.HotelUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      const hotel = await tx.hotel.findFirst({
        where: { id: hotelId, tenantId: { in: tenantIds } },
        select: { id: true },
      });

      if (!hotel) {
        return null;
      }

      return tx.hotel.update({
        where: { id: hotel.id },
        data,
        include: hotelDetailInclude,
      });
    });
  }
}
