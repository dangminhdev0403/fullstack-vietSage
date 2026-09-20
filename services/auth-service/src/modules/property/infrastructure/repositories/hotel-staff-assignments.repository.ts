import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  HotelStaffAssignmentStatus,
  RoleStatus,
  UserRoleStatus,
} from "@prisma/client";
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

  async listRoomAssignmentsByUserIds(hotelId: string, userIds: string[]) {
    if (userIds.length === 0) return [];
    return this.prisma.hotelRoomStaffAssignment.findMany({
      where: {
        hotelId,
        userId: { in: userIds },
      },
      select: {
        id: true,
        userId: true,
        roomId: true,
        assignedAt: true,
        room: {
          select: {
            id: true,
            roomNumber: true,
          },
        },
      },
    });
  }

  async assertEligibleFrontDeskStaff(hotelId: string, userId: string): Promise<void> {
    const assignment = await this.prisma.hotelStaffAssignment.findFirst({
      where: {
        hotelId,
        userId,
        status: HotelStaffAssignmentStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new NotFoundException("Nhân viên chưa được phân công vào khách sạn này");
    }

    const userRole = await this.prisma.userRole.findFirst({
      where: {
        userId,
        status: UserRoleStatus.ACTIVE,
        role: {
          status: RoleStatus.ACTIVE,
          OR: [
            { code: "HOTEL_FRONTDESK" },
            { baseRole: { code: "HOTEL_FRONTDESK" } },
          ],
        },
      },
      select: { id: true },
    });
    if (!userRole) {
      throw new BadRequestException("Chỉ có thể gán phòng cho nhân viên có vai trò lễ tân (HOTEL_FRONTDESK)");
    }
  }

  async assignRoom(
    hotelId: string,
    userId: string,
    roomId: string,
    actorUserId: string,
    tenantId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: { id: roomId, hotelId },
        select: { id: true, roomNumber: true },
      });
      if (!room) {
        throw new NotFoundException("Không tìm thấy phòng thuộc khách sạn này");
      }

      const existingForRoom = await tx.hotelRoomStaffAssignment.findUnique({
        where: { roomId },
        select: { userId: true },
      });
      if (existingForRoom && existingForRoom.userId !== userId) {
        throw new ConflictException("Phòng này đã được phân công cho nhân viên khác");
      }

      const existingForUser = await tx.hotelRoomStaffAssignment.findUnique({
        where: { userId },
        select: { roomId: true },
      });
      const previousRoomId = existingForUser?.roomId;

      const assignment = await tx.hotelRoomStaffAssignment.upsert({
        where: { userId },
        update: {
          roomId,
          hotelId,
          assignedById: actorUserId,
          updatedAt: new Date(),
        },
        create: {
          hotelId,
          userId,
          roomId,
          assignedById: actorUserId,
        },
        select: {
          id: true,
          hotelId: true,
          userId: true,
          roomId: true,
          assignedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          tenantId,
          action: "HOTEL_ROOM_STAFF_ASSIGNED",
          entityType: "HotelRoomStaffAssignment",
          entityId: assignment.id,
          metadata: {
            hotelId,
            userId,
            roomId,
            previousRoomId,
          },
        },
      });

      return {
        ...assignment,
        roomNumber: room.roomNumber,
      };
    });
  }

  async unassignRoom(
    hotelId: string,
    userId: string,
    actorUserId: string,
    tenantId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.hotelRoomStaffAssignment.findFirst({
        where: { hotelId, userId },
        select: { id: true, roomId: true },
      });
      if (!existing) {
        return null;
      }

      await tx.hotelRoomStaffAssignment.delete({
        where: { id: existing.id },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          tenantId,
          action: "HOTEL_ROOM_STAFF_UNASSIGNED",
          entityType: "HotelRoomStaffAssignment",
          entityId: existing.id,
          metadata: {
            hotelId,
            userId,
            roomId: existing.roomId,
          },
        },
      });

      return {
        unassigned: true as const,
        hotelId,
        userId,
        roomId: existing.roomId,
      };
    });
  }
}
