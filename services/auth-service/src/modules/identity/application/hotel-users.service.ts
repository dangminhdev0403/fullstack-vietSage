import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TenantUserStatus, UserStatus, UserType } from "@prisma/client";
import * as argon2 from "argon2";
import {
  HotelUsersRepository,
  type TenantScopedHotelUserRow,
} from "../infrastructure/repositories/hotel-users.repository";
import type {
  AssignHotelUserRolesBodyInput,
  CreateHotelUserBodyInput,
  ListHotelUsersQueryInput,
  UpdateHotelUserStatusBodyInput,
} from "../domain/schemas/hotel-users.schema";
import { AuthService } from "./authentication.service";

const MANAGED_ROLE_CODES = new Set([
  "HOTEL_MANAGER",
  "HOTEL_FRONTDESK",
  "HOTEL_HOUSEKEEPING",
  "HOTEL_MAINTENANCE",
  "HOTEL_FNB",
  "HOTEL_FINANCE",
]);
const PROTECTED_ROLE_CODES = new Set(["SUPER_ADMIN", "VIETSAGE_OPERATION", "HOTEL_OWNER"]);

interface ActorContext {
  userId: string;
  tenantIds: Set<string>;
  isSuperAdmin: boolean;
}

export interface TenantScopedHotelUser {
  id: string;
  email: string;
  fullName: string;
  userStatus: UserStatus;
  tenantStatus: TenantUserStatus;
  tenantId: string;
  joinedAt: Date | null;
  roles: Array<{
    id: string;
    code: string;
    name: string;
    assignedAt: Date;
    assignedById: string | null;
  }>;
  assignedHotel: {
    id: string;
    code: string;
    name: string;
  } | null;
}

@Injectable()
export class HotelUsersService {
  constructor(
    private readonly hotelUsersRepository: HotelUsersRepository,
    private readonly authService: AuthService,
  ) {}

  async createHotelUser(
    actorUserId: string,
    activeRoleId: string,
    tenantHint: string | undefined,
    dto: CreateHotelUserBodyInput,
  ): Promise<TenantScopedHotelUser> {
    const actor = await this.loadActorContext(actorUserId, activeRoleId);
    const tenantId = await this.resolveTenantId(actor, tenantHint);
    await this.assertTenantExists(tenantId);

    const roleIds = normalizeIds(dto.roleIds);
    const roles = await this.resolveAssignableRoles(roleIds);

    const normalizedEmail = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();
    const passwordHash = await argon2.hash(dto.password);

    try {
      const user = await this.hotelUsersRepository.createHotelUserWithTenantAndRoles({
        tenantId,
        normalizedEmail,
        fullName,
        passwordHash,
        roleIds: roles.map((role) => role.id),
        assignedById: actor.userId,
      });

      return this.getTenantScopedHotelUserOrThrow(tenantId, user.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Email already exists");
      }

      throw error;
    }
  }

  async listHotelUsers(
    actorUserId: string,
    activeRoleId: string,
    tenantHint: string | undefined,
    query: ListHotelUsersQueryInput,
  ): Promise<{
    page: number;
    limit: number;
    total: number;
    items: TenantScopedHotelUser[];
  }> {
    const actor = await this.loadActorContext(actorUserId, activeRoleId);
    const tenantId = await this.resolveTenantId(actor, tenantHint);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const status = query.status ?? TenantUserStatus.ACTIVE;
    const where = this.buildTenantUserListFilter(tenantId, status, query.q);

    const [total, rows] = await this.hotelUsersRepository.listTenantUsers(where, skip, limit);

    const items = rows.map((row) => this.toTenantScopedHotelUser(row));

    return {
      page,
      limit,
      total,
      items,
    };
  }

  async getHotelUser(
    actorUserId: string,
    activeRoleId: string,
    tenantHint: string | undefined,
    userId: string,
  ): Promise<TenantScopedHotelUser> {
    const actor = await this.loadActorContext(actorUserId, activeRoleId);
    const tenantId = await this.resolveTenantId(actor, tenantHint);

    return this.getTenantScopedHotelUserOrThrow(tenantId, userId);
  }

  async updateHotelUserStatus(
    actorUserId: string,
    activeRoleId: string,
    tenantHint: string | undefined,
    userId: string,
    dto: UpdateHotelUserStatusBodyInput,
  ): Promise<TenantScopedHotelUser> {
    const actor = await this.loadActorContext(actorUserId, activeRoleId);
    const tenantId = await this.resolveTenantId(actor, tenantHint);

    const tenantUser = await this.assertTargetUserInTenant(tenantId, userId);

    await this.hotelUsersRepository.updateTenantUserStatus(
      tenantId,
      userId,
      dto.status,
      dto.status === TenantUserStatus.ACTIVE && !tenantUser.joinedAt
        ? new Date()
        : (tenantUser.joinedAt ?? undefined),
    );

    return this.getTenantScopedHotelUserOrThrow(tenantId, userId);
  }

  async assignHotelUserRoles(
    actorUserId: string,
    activeRoleId: string,
    tenantHint: string | undefined,
    userId: string,
    dto: AssignHotelUserRolesBodyInput,
  ): Promise<TenantScopedHotelUser> {
    const actor = await this.loadActorContext(actorUserId, activeRoleId);
    const tenantId = await this.resolveTenantId(actor, tenantHint);

    await this.assertTargetUserInTenant(tenantId, userId);

    const roleIds = normalizeIds(dto.roleIds);
    const roles = await this.resolveAssignableRoles(roleIds);

    await this.hotelUsersRepository.upsertActiveUserRoles(
      userId,
      roles.map((role) => role.id),
      actor.userId,
    );

    return this.getTenantScopedHotelUserOrThrow(tenantId, userId);
  }

  async revokeHotelUserRole(
    actorUserId: string,
    activeRoleId: string,
    tenantHint: string | undefined,
    userId: string,
    roleId: string,
  ): Promise<{ revoked: true; userId: string; roleId: string }> {
    const actor = await this.loadActorContext(actorUserId, activeRoleId);
    const tenantId = await this.resolveTenantId(actor, tenantHint);

    await this.assertTargetUserInTenant(tenantId, userId);

    const [role] = await this.resolveAssignableRoles([roleId]);

    const result = await this.hotelUsersRepository.revokeActiveUserRole(
      userId,
      role.id,
      actor.userId,
    );

    if (result.count === 0) {
      throw new NotFoundException("Không tìm thấy vai trò đang được gán");
    }

    await this.authService.revokeUserRoleSessions(userId, role.id);

    return {
      revoked: true,
      userId,
      roleId: role.id,
    };
  }

  private buildTenantUserListFilter(
    tenantId: string,
    status: TenantUserStatus,
    queryText: string | undefined,
  ): Prisma.TenantUserWhereInput {
    const userFilter: Prisma.UserWhereInput = {
      userType: UserType.HOTEL_STAFF,
    };

    const needle = queryText?.trim();
    if (needle) {
      userFilter.OR = [
        {
          email: {
            contains: needle,
            mode: "insensitive",
          },
        },
        {
          fullName: {
            contains: needle,
            mode: "insensitive",
          },
        },
      ];
    }

    return {
      tenantId,
      status,
      user: userFilter,
    };
  }

  async listManagedRoles(
    actorUserId: string,
    activeRoleId: string,
    tenantHint: string | undefined,
  ) {
    const actor = await this.loadActorContext(actorUserId, activeRoleId);
    await this.resolveTenantId(actor, tenantHint);
    return this.hotelUsersRepository.listManagedRoles([...MANAGED_ROLE_CODES]);
  }

  private async loadActorContext(userId: string, activeRoleId: string): Promise<ActorContext> {
    const actor = await this.hotelUsersRepository.findActorById(userId, activeRoleId);

    if (!actor) {
      throw new ForbiddenException("Không tìm thấy người thao tác");
    }

    const roleCodes = new Set(actor.userRoles.map((entry) => entry.role.code));
    return {
      userId: actor.id,
      tenantIds: new Set(actor.tenantUsers.map((entry) => entry.tenantId)),
      isSuperAdmin: roleCodes.has("SUPER_ADMIN"),
    };
  }

  private async resolveTenantId(
    actor: ActorContext,
    tenantHint: string | undefined,
  ): Promise<string> {
    const tenantId = tenantHint?.trim();

    if (actor.isSuperAdmin) {
      if (!tenantId) {
        throw new BadRequestException("tenantId là bắt buộc với yêu cầu của SUPER_ADMIN");
      }

      return tenantId;
    }

    if (tenantId) {
      if (!actor.tenantIds.has(tenantId)) {
        throw new ForbiddenException("You cannot manage users outside your tenant");
      }

      return tenantId;
    }

    if (actor.tenantIds.size === 1) {
      return Array.from(actor.tenantIds)[0];
    }

    if (actor.tenantIds.size === 0) {
      throw new ForbiddenException("Actor does not belong to any active tenant");
    }

    throw new BadRequestException("tenantId là bắt buộc khi người thao tác thuộc nhiều đơn vị");
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.hotelUsersRepository.findTenantById(tenantId);

    if (!tenant) {
      throw new NotFoundException("Không tìm thấy đơn vị");
    }
  }

  private async assertTargetUserInTenant(
    tenantId: string,
    userId: string,
  ): Promise<{ joinedAt: Date | null }> {
    const tenantUser = await this.hotelUsersRepository.findTenantUserMembership(tenantId, userId);

    if (!tenantUser) {
      throw new NotFoundException("Không tìm thấy người dùng khách sạn trong đơn vị");
    }

    if (tenantUser.user.userType !== UserType.HOTEL_STAFF) {
      throw new ForbiddenException("Target user is not a hotel user");
    }

    return {
      joinedAt: tenantUser.joinedAt,
    };
  }

  private async resolveAssignableRoles(
    roleIds: string[],
  ): Promise<Array<{ id: string; code: string; name: string }>> {
    if (!roleIds.length) {
      return [];
    }

    const roles = await this.hotelUsersRepository.findRolesByIds(roleIds);

    const existingIds = new Set(roles.map((role) => role.id));
    const missingIds = roleIds.filter((id) => !existingIds.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(`Không tìm thấy các id vai trò: ${missingIds.join(", ")}`);
    }

    for (const role of roles) {
      if (PROTECTED_ROLE_CODES.has(role.code)) {
        throw new ForbiddenException(`Vai trò ${role.code} được bảo vệ và không thể gán`);
      }

      if (!MANAGED_ROLE_CODES.has(role.code)) {
        throw new ForbiddenException(`Vai trò ${role.code} nằm ngoài phạm vi vai trò được quản lý`);
      }
    }

    return roles;
  }

  private async getTenantScopedHotelUserOrThrow(
    tenantId: string,
    userId: string,
  ): Promise<TenantScopedHotelUser> {
    const row = await this.hotelUsersRepository.findTenantScopedHotelUser(tenantId, userId);

    if (!row) {
      throw new NotFoundException("Không tìm thấy người dùng khách sạn");
    }

    if (row.user.userType !== UserType.HOTEL_STAFF) {
      throw new ForbiddenException("Target user is not a hotel user");
    }

    return this.toTenantScopedHotelUser(row);
  }

  private toTenantScopedHotelUser(row: TenantScopedHotelUserRow): TenantScopedHotelUser {
    const assignedHotel = row.user.hotelAssignments.find(
      (assignment) => assignment.hotel.tenantId === row.tenantId,
    )?.hotel;

    return {
      id: row.user.id,
      email: row.user.email,
      fullName: row.user.fullName,
      userStatus: row.user.status,
      tenantStatus: row.status,
      tenantId: row.tenantId,
      joinedAt: row.joinedAt,
      assignedHotel: assignedHotel
        ? {
            id: assignedHotel.id,
            code: assignedHotel.code,
            name: assignedHotel.name,
          }
        : null,
      roles: row.user.userRoles
        .map((entry) => ({
          id: entry.role.id,
          code: entry.role.code,
          name: entry.role.name,
          assignedAt: entry.assignedAt,
          assignedById: entry.assignedById,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  }
}

function normalizeIds(ids: string[] | undefined): string[] {
  if (!ids) {
    return [];
  }

  const normalized = ids.map((id) => id.trim()).filter((id) => id.length > 0);
  return Array.from(new Set(normalized));
}
