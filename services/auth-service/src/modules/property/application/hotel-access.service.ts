import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { HotelCoreRepository } from "../infrastructure/repositories/hotel-core.repository";
import type { HotelDetailRow } from "../infrastructure/repositories/hotel-repository.types";

const HOTEL_OPERATOR_ROLE_CODES = new Set([
  "SUPER_ADMIN",
  "TENANT_OWNER",
  "HOTEL_OWNER",
  "HOTEL_MANAGER",
  "HOTEL_FRONTDESK",
  "HOTEL_HOUSEKEEPING",
  "HOTEL_MAINTENANCE",
  "HOTEL_FNB",
  "HOTEL_FINANCE",
]);

const HOTEL_ASSIGNMENT_REQUIRED_ROLE_CODES = new Set([
  "HOTEL_MANAGER",
  "HOTEL_FRONTDESK",
  "HOTEL_HOUSEKEEPING",
  "HOTEL_MAINTENANCE",
  "HOTEL_FNB",
  "HOTEL_FINANCE",
]);

export interface HotelActorContext {
  userId: string;
  roleCodes: Set<string>;
  tenantIds: Set<string>;
  assignedHotelIds?: Set<string>;
  requiresHotelAssignment?: boolean;
  isSuperAdmin: boolean;
  isTenantOwner: boolean;
}

@Injectable()
export class HotelAccessService {
  constructor(private readonly hotelCoreRepository: HotelCoreRepository) {}

  async loadActorContext(userId: string, activeRoleId: string): Promise<HotelActorContext> {
    const actor = await this.hotelCoreRepository.findActorById(userId, activeRoleId);
    if (!actor) {
      throw new ForbiddenException("Không tìm thấy người thực hiện");
    }

    const roleCodes = new Set(actor.userRoles.map((entry) => entry.role.code));
    const allowed = Array.from(roleCodes).some((code) => HOTEL_OPERATOR_ROLE_CODES.has(code));
    if (!allowed) {
      throw new ForbiddenException("Bạn không được phép quản lý vận hành khách sạn");
    }

    const tenantIds = new Set(actor.tenantUsers.map((entry) => entry.tenantId));
    const assignedHotelIds = new Set((actor.hotelAssignments ?? []).map((entry) => entry.hotelId));
    const hasElevatedHotelScope = ["SUPER_ADMIN", "TENANT_OWNER", "HOTEL_OWNER"].some((code) =>
      roleCodes.has(code),
    );
    const requiresHotelAssignment =
      !hasElevatedHotelScope &&
      Array.from(roleCodes).some((code) => HOTEL_ASSIGNMENT_REQUIRED_ROLE_CODES.has(code));
    const isTenantOwner = roleCodes.has("TENANT_OWNER") && !roleCodes.has("SUPER_ADMIN");
    if (isTenantOwner && tenantIds.size === 0) {
      throw new ForbiddenException("TENANT_OWNER không có thành viên tenant đang hoạt động");
    }

    return {
      userId: actor.id,
      roleCodes,
      tenantIds,
      assignedHotelIds,
      requiresHotelAssignment,
      isSuperAdmin: roleCodes.has("SUPER_ADMIN"),
      isTenantOwner,
    };
  }

  async resolveTenantId(actor: HotelActorContext, tenantHint: string | undefined) {
    const tenantId = tenantHint?.trim();

    if (actor.isTenantOwner) {
      if (tenantId) {
        throw new BadRequestException("Không chấp nhận tenantId trong yêu cầu của TENANT_OWNER");
      }

      throw new ForbiddenException("TENANT_OWNER không thể tạo khách sạn");
    }

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

  rejectTenantOwnerTenantHint(actor: HotelActorContext, tenantHint: string | undefined) {
    if (actor.isTenantOwner && tenantHint?.trim()) {
      throw new BadRequestException("Không chấp nhận tenantId trong yêu cầu của TENANT_OWNER");
    }
  }
}
