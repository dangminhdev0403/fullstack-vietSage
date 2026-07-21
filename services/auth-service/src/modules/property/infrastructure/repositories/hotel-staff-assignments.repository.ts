import { Injectable } from "@nestjs/common";
import { HotelStaffAssignmentStatus } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";

@Injectable()
export class HotelStaffAssignmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByHotel(
    hotelId: string,
    status: HotelStaffAssignmentStatus,
    skip: number,
    take: number,
  ) {
    const where = { hotelId, status } as const;
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.hotelStaffAssignment.count({ where });
      const rows = await tx.hotelStaffAssignment.findMany({
        where,
        select: {
          id: true,
          userId: true,
          hotelId: true,
          status: true,
          assignedAt: true,
          assignedById: true,
          revokedAt: true,
          revokedById: true,
        },
        orderBy: [{ assignedAt: "desc" }],
        skip,
        take,
      });
      return [total, rows] as const;
    });
  }

  async activateExclusive(hotelId: string, userId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.hotelStaffAssignment.updateMany({
        where: {
          userId,
          hotelId: { not: hotelId },
          status: HotelStaffAssignmentStatus.ACTIVE,
        },
        data: {
          status: HotelStaffAssignmentStatus.REVOKED,
          revokedAt: now,
          revokedById: actorUserId,
        },
      });

      return tx.hotelStaffAssignment.upsert({
        where: { userId_hotelId: { userId, hotelId } },
        update: {
          status: HotelStaffAssignmentStatus.ACTIVE,
          assignedAt: now,
          assignedById: actorUserId,
          revokedAt: null,
          revokedById: null,
        },
        create: {
          userId,
          hotelId,
          status: HotelStaffAssignmentStatus.ACTIVE,
          assignedAt: now,
          assignedById: actorUserId,
        },
        select: {
          id: true,
          userId: true,
          hotelId: true,
          status: true,
          assignedAt: true,
          assignedById: true,
          revokedAt: true,
          revokedById: true,
        },
      });
    });
  }

  async revoke(hotelId: string, userId: string, actorUserId: string) {
    return this.prisma.hotelStaffAssignment.updateMany({
      where: {
        hotelId,
        userId,
        status: HotelStaffAssignmentStatus.ACTIVE,
      },
      data: {
        status: HotelStaffAssignmentStatus.REVOKED,
        revokedAt: new Date(),
        revokedById: actorUserId,
      },
    });
  }
}
