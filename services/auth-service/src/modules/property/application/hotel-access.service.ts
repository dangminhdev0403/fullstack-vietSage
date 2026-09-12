import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { HotelCoreRepository } from "../infrastructure/repositories/hotel-core.repository";
import type { HotelDetailRow } from "../infrastructure/repositories/hotel-repository.types";

export interface HotelActorContext {
  userId: string;
  roleCodes: Set<string>;
  tenantIds: Set<string>;
  assignedHotelIds?: Set<string>;
  requiresHotelAssignment?: boolean;
  isSuperAdmin: boolean;
  isTenantOwner: boolean;
  permissions?: Set<string>;
}

@Injectable()
export class HotelAccessService {
  constructor(private readonly hotelCoreRepository: HotelCoreRepository) {}

  async loadActorContext(userId: string, activeRoleId: string): Promise<HotelActorContext> {
    const actor = await this.hotelCoreRepository.findActorById(userId, activeRoleId);
    if (!actor) {
      throw new ForbiddenException("Không tìm thấy người thực hiện");
    }

    if (!actor.userRoles || actor.userRoles.length === 0) {
      throw new ForbiddenException("Bạn không được phép quản lý vận hành khách sạn");
    }

    const roleCodes = new Set(actor.userRoles.map((entry) => entry.role.code));
    const baseRoleCodes = new Set(
      actor.userRoles
        .map((entry) => (entry.role as { baseRole?: { code?: string } | null })?.baseRole?.code)
        .filter((code): code is string => Boolean(code)),
    );

    const permissions = new Set<string>();
    for (const entry of actor.userRoles) {
      const rolePermissions = (
        entry.role as { rolePermissions?: Array<{ permission?: { path?: string } }> }
      )?.rolePermissions;
      for (const rp of rolePermissions ?? []) {
        if (rp?.permission?.path) {
          permissions.add(rp.permission.path);
        }
      }
    }

    const isSuperAdmin = roleCodes.has("SUPER_ADMIN") || baseRoleCodes.has("SUPER_ADMIN");
    const isTenantOwner =
      (roleCodes.has("TENANT_OWNER") || baseRoleCodes.has("TENANT_OWNER")) && !isSuperAdmin;
    const isHotelOwner = roleCodes.has("HOTEL_OWNER") || baseRoleCodes.has("HOTEL_OWNER");

    const hasElevatedHotelScope = isSuperAdmin || isTenantOwner || isHotelOwner;
    const requiresHotelAssignment = !hasElevatedHotelScope;

    const tenantIds = new Set(actor.tenantUsers.map((entry) => entry.tenantId));
    const assignedHotelIds = new Set((actor.hotelAssignments ?? []).map((entry) => entry.hotelId));

    if (isTenantOwner && tenantIds.size === 0) {
      throw new ForbiddenException("TENANT_OWNER không có thành viên tenant đang hoạt động");
    }

    return {
      userId: actor.id,
      roleCodes,
      tenantIds,
      assignedHotelIds,
      requiresHotelAssignment,
      isSuperAdmin,
      isTenantOwner,
      permissions,
    };
  }

  async resolveTenantId(actor: HotelActorContext, tenantHint: string | undefined) {
    const tenantId = tenantHint?.trim();

    if (actor.isSuperAdmin) {
      if (!tenantId) {
        throw new BadRequestException("tenantId là bắt buộc đối với yêu cầu của SUPER_ADMIN");
      }

      return tenantId;
    }

    if (tenantId) {
      if (!actor.tenantIds.has(tenantId)) {
        throw new ForbiddenException("Bạn không thể quản lý khách sạn ngoài tenant của mình");
      }

      return tenantId;
    }

    if (actor.tenantIds.size === 1) {
      return Array.from(actor.tenantIds)[0];
    }

    throw new BadRequestException("tenantId là bắt buộc khi người thực hiện thuộc nhiều tenant");
  }

  async assertTenantExists(tenantId: string) {
    const tenant = await this.hotelCoreRepository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException("Không tìm thấy tenant");
    }
  }

  async assertHotelAccess(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
  ): Promise<HotelDetailRow> {
    const actor = await this.loadActorContext(actorUserId, activeRoleId);

    if (actor.isTenantOwner) {
      const hotel = await this.hotelCoreRepository.findHotelByIdAndTenantIds(
        hotelId,
        Array.from(actor.tenantIds),
      );
      if (!hotel) {
        throw new NotFoundException("Không tìm thấy khách sạn");
      }

      return hotel;
    }

    const hotel = await this.hotelCoreRepository.findHotelById(hotelId);
    if (!hotel) {
      throw new NotFoundException("Không tìm thấy khách sạn");
    }

    if (!actor.isSuperAdmin && !actor.tenantIds.has(hotel.tenantId)) {
      throw new ForbiddenException("Bạn không thể truy cập khách sạn này");
    }

    if (actor.requiresHotelAssignment && !actor.assignedHotelIds?.has(hotelId)) {
      throw new ForbiddenException("Bạn chưa được phân công tại khách sạn này");
    }

    return hotel;
  }
}
