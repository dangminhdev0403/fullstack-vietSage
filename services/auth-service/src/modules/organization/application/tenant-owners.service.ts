import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TenantUserStatus, UserStatus, UserType } from "@prisma/client";
import * as argon2 from "argon2";
import { CodesService } from "../../codes/codes-public";
import {
  TenantOwnerRoleNotConfiguredError,
  TenantOwnersRepository,
  type TenantOwnerRow,
} from "../infrastructure/repositories/tenant-owners.repository";
import type {
  CreateTenantOwnerBodyInput,
  ListTenantOwnersQueryInput,
  UpdateTenantOwnerBodyInput,
} from "../domain/schemas/tenant-owners.schema";
import { AuthService } from "../../identity/identity-public";

export interface TenantOwnerItem {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  userType: UserType;
  createdAt: Date;
  updatedAt: Date;
  tenant: {
    id: string;
    code: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  };
  tenantUser: {
    id: string;
    status: TenantUserStatus;
    joinedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  role: {
    id: string;
    code: string;
    name: string;
    assignedAt: Date;
    assignedById: string | null;
  };
}

@Injectable()
export class TenantOwnersService {
  constructor(
    private readonly tenantOwnersRepository: TenantOwnersRepository,
    private readonly codesService: CodesService,
    private readonly authService: AuthService,
  ) {}

  async listTenantOwners(actorUserId: string, query: ListTenantOwnersQueryInput) {
    await this.assertSuperAdmin(actorUserId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter = {
      tenantId: query.tenantId?.trim() || undefined,
      ownerStatus: query.ownerStatus,
      tenantUserStatus: query.tenantUserStatus,
      q: query.q?.trim() || undefined,
    };
    const where = this.tenantOwnersRepository.buildTenantOwnerWhere(filter);
    const tenantUserWhere = this.tenantOwnersRepository.buildTenantUserWhere(filter);

    const [total, rows] = await this.tenantOwnersRepository.listTenantOwners(
      where,
      tenantUserWhere,
      (page - 1) * limit,
      limit,
    );

    return {
      page,
      limit,
      total,
      items: rows.map((row) => this.toTenantOwnerItem(row)),
    };
  }

  async listTenantOptions(actorUserId: string) {
    await this.assertSuperAdmin(actorUserId);
    return this.tenantOwnersRepository.listTenantOptions();
  }

  async getTenantOwner(actorUserId: string, userId: string): Promise<TenantOwnerItem> {
    await this.assertSuperAdmin(actorUserId);
    return this.getTenantOwnerOrThrow(userId);
  }

  async createTenantOwner(
    actorUserId: string,
    dto: CreateTenantOwnerBodyInput,
  ): Promise<TenantOwnerItem> {
    await this.assertSuperAdmin(actorUserId);

    const normalizedEmail = dto.owner.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(dto.owner.password);
    const tenantCode = await this.codesService.generateEntityCode("TENANT");

    try {
      const row = await this.tenantOwnersRepository.createTenantOwner({
        normalizedEmail,
        fullName: dto.owner.fullName.trim(),
        passwordHash,
        tenantCode,
        tenantName: dto.tenant.name.trim(),
        assignedById: actorUserId,
      });

      return this.toTenantOwnerItem(row);
    } catch (error) {
      this.rethrowKnownCreateError(error);
      throw error;
    }
  }

  async updateTenantOwner(
    actorUserId: string,
    userId: string,
    dto: UpdateTenantOwnerBodyInput,
  ): Promise<TenantOwnerItem> {
    await this.assertSuperAdmin(actorUserId);
    const existing = await this.getTenantOwnerOrThrow(userId);

    try {
      const row = await this.tenantOwnersRepository.updateTenantOwner({
        userId,
        tenantUserId: existing.tenantUser.id,
        tenantId: existing.tenant.id,
        owner: this.buildOwnerUpdate(dto),
        tenant: this.buildTenantUpdate(dto),
        tenantUserStatus: dto.tenantUserStatus,
        joinedAt:
          dto.tenantUserStatus === TenantUserStatus.ACTIVE && !existing.tenantUser.joinedAt
            ? new Date()
            : undefined,
      });

      if (dto.owner?.status && dto.owner.status !== UserStatus.ACTIVE) {
        await this.authService.revokeUserSessions(userId);
      }

      return this.toTenantOwnerItem(row);
    } catch (error) {
      this.rethrowKnownUpdateError(error);
      throw error;
    }
  }

  private async assertSuperAdmin(actorUserId: string): Promise<void> {
    const roleCodes = await this.tenantOwnersRepository.findActorRoleCodes(actorUserId);
    if (!roleCodes.includes("SUPER_ADMIN")) {
      throw new ForbiddenException("Chỉ SUPER_ADMIN được quản lý chủ đơn vị");
    }
  }

  private async getTenantOwnerOrThrow(userId: string): Promise<TenantOwnerItem> {
    const row = await this.tenantOwnersRepository.findTenantOwnerByUserId(userId.trim());
    if (!row) {
      throw new NotFoundException("Không tìm thấy chủ đơn vị");
    }

    return this.toTenantOwnerItem(row);
  }

  private buildOwnerUpdate(dto: UpdateTenantOwnerBodyInput): Prisma.UserUpdateInput | undefined {
    if (!dto.owner) {
      return undefined;
    }

    return {
      ...(dto.owner.fullName !== undefined ? { fullName: dto.owner.fullName.trim() } : {}),
      ...(dto.owner.status !== undefined ? { status: dto.owner.status } : {}),
    };
  }

  private buildTenantUpdate(dto: UpdateTenantOwnerBodyInput): Prisma.TenantUpdateInput | undefined {
    if (!dto.tenant) {
      return undefined;
    }

    return {
      ...(dto.tenant.name !== undefined ? { name: dto.tenant.name.trim() } : {}),
    };
  }

  private rethrowKnownCreateError(error: unknown): void {
    if (error instanceof TenantOwnerRoleNotConfiguredError) {
      throw new ConflictException(error.message);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : "";
      if (target.includes("email")) {
        throw new ConflictException("Owner email already exists");
      }

      if (target.includes("code")) {
        throw new ConflictException("Tenant code already exists");
      }

      throw new ConflictException("Chủ đơn vị đã tồn tại");
    }
  }

  private rethrowKnownUpdateError(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("Tenant code already exists");
    }
  }

  private toTenantOwnerItem(row: TenantOwnerRow): TenantOwnerItem {
    const tenantUser = row.tenantUsers[0];
    const roleRow = row.userRoles[0];

    if (!tenantUser || !roleRow) {
      throw new NotFoundException("Không tìm thấy chủ đơn vị");
    }

    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      status: row.status,
      userType: row.userType,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      tenant: {
        id: tenantUser.tenant.id,
        code: tenantUser.tenant.code,
        name: tenantUser.tenant.name,
        createdAt: tenantUser.tenant.createdAt,
        updatedAt: tenantUser.tenant.updatedAt,
      },
      tenantUser: {
        id: tenantUser.id,
        status: tenantUser.status,
        joinedAt: tenantUser.joinedAt,
        createdAt: tenantUser.createdAt,
        updatedAt: tenantUser.updatedAt,
      },
      role: {
        id: roleRow.role.id,
        code: roleRow.role.code,
        name: roleRow.role.name,
        assignedAt: roleRow.assignedAt,
        assignedById: roleRow.assignedById,
      },
    };
  }
}
