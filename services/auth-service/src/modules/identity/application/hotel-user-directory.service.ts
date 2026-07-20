import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HotelUsersRepository } from "../infrastructure/repositories/hotel-users.repository";

export type HotelUserDirectoryEntry = {
  id: string;
  email: string;
  fullName: string;
  roles: Array<{ id: string; code: string; name: string }>;
};

@Injectable()
export class HotelUserDirectoryService {
  constructor(private readonly hotelUsersRepository: HotelUsersRepository) {}

  async assertAssignableHotelUser(
    tenantId: string,
    userId: string,
  ): Promise<HotelUserDirectoryEntry> {
    const membership = await this.hotelUsersRepository.findActiveHotelStaffInTenant(
      tenantId,
      userId,
    );
    if (!membership) {
      throw new NotFoundException("Không tìm thấy nhân viên đang hoạt động trong tenant");
    }

    const entry = this.mapEntry(membership.user);
    if (entry.roles.length === 0) {
      throw new ForbiddenException("Nhân viên cần có ít nhất một vai trò khách sạn đang hoạt động");
    }

    return entry;
  }

  async listHotelUsersByIds(
    tenantId: string,
    userIds: readonly string[],
  ): Promise<HotelUserDirectoryEntry[]> {
    const memberships = await this.hotelUsersRepository.findActiveHotelStaffByIds(tenantId, [
      ...new Set(userIds),
    ]);
    return memberships.map((membership) => this.mapEntry(membership.user));
  }

  private mapEntry(user: {
    id: string;
    email: string;
    fullName: string;
    userRoles: Array<{ role: { id: string; code: string; name: string } }>;
  }): HotelUserDirectoryEntry {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.userRoles.map((entry) => entry.role),
    };
  }
}
