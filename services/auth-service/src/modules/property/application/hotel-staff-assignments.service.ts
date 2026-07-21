import { Injectable, NotFoundException } from "@nestjs/common";
import { HotelUserDirectoryService } from "../../identity/identity-public";
import type { ListHotelStaffAssignmentsQueryInput } from "../domain/schemas/hotel-staff-assignments.schema";
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
    const users = await this.hotelUserDirectoryService.listHotelUsersByIds(
      hotel.tenantId,
      rows.map((row) => row.userId),
    );
    const userById = new Map(users.map((user) => [user.id, user]));

    return {
      page: query.page,
      limit: query.limit,
      total,
      items: rows.flatMap((row) => {
        const user = userById.get(row.userId);
        return user ? [{ ...row, user }] : [];
      }),
    };
  }

  async assign(actorUserId: string, activeRoleId: string, hotelId: string, userId: string) {
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
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const result = await this.assignmentsRepository.revoke(hotelId, userId, actorUserId);
    if (result.count === 0) {
      throw new NotFoundException("Không tìm thấy phân công nhân viên đang hoạt động");
    }
    return { revoked: true as const, hotelId, userId };
  }
}
