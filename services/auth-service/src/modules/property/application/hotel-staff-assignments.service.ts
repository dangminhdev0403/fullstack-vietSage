import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HotelUserDirectoryService } from "../../identity/identity-public";
import type {
  AssignStaffRoomBodyInput,
  ListHotelStaffAssignmentsQueryInput,
} from "../domain/schemas/hotel-staff-assignments.schema";
import { HotelStaffAssignmentsRepository } from "../infrastructure/repositories/hotel-staff-assignments.repository";
import { HotelAccessService } from "./hotel-access.service";

@Injectable()
export class HotelStaffAssignmentsService {
  constructor(
    private readonly hotelAccessService: HotelAccessService,
    private readonly hotelUserDirectoryService: HotelUserDirectoryService,
    private readonly assignmentsRepository: HotelStaffAssignmentsRepository,
  ) {}

  async list(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query: ListHotelStaffAssignmentsQueryInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await this.assignmentsRepository.listByHotel(
      hotelId,
      query.status,
      skip,
      query.limit,
    );
    const userIds = rows.map((row) => row.userId);
    const [users, roomAssignments] = await Promise.all([
      this.hotelUserDirectoryService.listHotelUsersByIds(hotel.tenantId, userIds),
      this.assignmentsRepository.listRoomAssignmentsByUserIds(hotelId, userIds),
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const roomAssignmentByUserId = new Map(
      roomAssignments.map((ra) => [
        ra.userId,
        {
          id: ra.id,
          roomId: ra.roomId,
          roomNumber: ra.room.roomNumber,
          assignedAt: ra.assignedAt,
        },
      ]),
    );

    return {
      page: query.page,
      limit: query.limit,
      total,
      items: rows.flatMap((row) => {
        const user = userById.get(row.userId);
        if (!user) return [];
        const roomAssignment = roomAssignmentByUserId.get(row.userId) ?? null;
        return [{ ...row, user, roomAssignment }];
      }),
    };
  }

  async assign(actorUserId: string, activeRoleId: string, hotelId: string, userId: string) {
    if (actorUserId === userId) {
      throw new ForbiddenException("Không thể tự phân công chính mình");
    }
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const user = await this.hotelUserDirectoryService.assertAssignableHotelUser(
      hotel.tenantId,
      userId,
    );
    const assignment = await this.assignmentsRepository.activateExclusive(
      hotelId,
      userId,
      actorUserId,
    );
    return { ...assignment, user };
  }

  async revoke(actorUserId: string, activeRoleId: string, hotelId: string, userId: string) {
    if (actorUserId === userId) {
      throw new ForbiddenException("Không thể tự hủy phân công của chính mình");
    }
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const result = await this.assignmentsRepository.revoke(hotelId, userId, actorUserId);
    if (result.count === 0) {
      throw new NotFoundException("Không tìm thấy phân công nhân viên đang hoạt động");
    }
    return { revoked: true as const, hotelId, userId };
  }

  async assignRoom(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    userId: string,
    dto: AssignStaffRoomBodyInput,
  ) {
    if (actorUserId === userId) {
      throw new ForbiddenException("Không thể tự gán phòng cho chính mình");
    }
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    await this.assignmentsRepository.assertEligibleFrontDeskStaff(hotelId, userId);
    return this.assignmentsRepository.assignRoom(
      hotelId,
      userId,
      dto.roomId,
      actorUserId,
      hotel.tenantId,
    );
  }

  async unassignRoom(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    userId: string,
  ) {
    if (actorUserId === userId) {
      throw new ForbiddenException("Không thể tự hủy gán phòng của chính mình");
    }
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const result = await this.assignmentsRepository.unassignRoom(
      hotelId,
      userId,
      actorUserId,
      hotel.tenantId,
    );
    if (!result) {
      throw new NotFoundException("Không tìm thấy phân công phòng cho nhân viên này");
    }
    return result;
  }
}
