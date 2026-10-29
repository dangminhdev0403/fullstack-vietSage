import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  HotelStatus,
  HotelFeatureStatus,
  HotelStaffAssignmentStatus,
  Prisma,
  RoleStatus,
  RoomStatus,
  TenantUserStatus,
  UserRoleStatus,
} from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { hotelDetailInclude } from "./hotel-repository.types";

@Injectable()
export class HotelCoreRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findActorById(userId: string, activeRoleId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userRoles: {
          where: {
            roleId: activeRoleId,
            status: UserRoleStatus.ACTIVE,
            role: { status: RoleStatus.ACTIVE },
          },
          select: {
            role: {
              select: {
                id: true,
                code: true,
                baseRoleId: true,
                baseRole: {
                  select: { code: true },
                },
                rolePermissions: {
                  select: {
                    permission: {
                      select: { path: true },
                    },
                  },
                },
              },
            },
          },
        },
        tenantUsers: {
          where: { status: TenantUserStatus.ACTIVE },
          select: { tenantId: true },
        },
        hotelAssignments: {
          where: {
            status: HotelStaffAssignmentStatus.ACTIVE,
            hotel: { status: HotelStatus.ACTIVE },
          },
          select: { hotelId: true, hasHotelWideRoomScope: true },
        },
      },
    });
  }

  async findTenantById(tenantId: string) {
    return this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  }

  async findHotelByTenantId(tenantId: string) {
    return this.prisma.hotel.findFirst({ where: { tenantId }, select: { id: true, name: true } });
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

  async findHotelByGoogleSheetId(googleSheetId: string) {
    return this.prisma.hotel.findUnique({
      where: { googleSheetId },
      select: { id: true, name: true },
    });
  }

  async findHotelByIdAndTenantIds(hotelId: string, tenantIds: string[]) {
    return this.prisma.hotel.findFirst({
      where: { id: hotelId, tenantId: { in: tenantIds } },
      include: hotelDetailInclude,
    });
  }

  async updateHotel(hotelId: string, data: Prisma.HotelUpdateInput) {
    const hotel = await this.updateHotelScoped(hotelId, undefined, data);
    if (!hotel) throw new NotFoundException("Không tìm thấy khách sạn");
    return hotel;
  }

  async updateHotelScoped(
    hotelId: string,
    tenantIds: string[] | undefined,
    data: Prisma.HotelUpdateInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Hotel" WHERE id = ${hotelId} FOR UPDATE`;
      const hotel = await tx.hotel.findFirst({
        where: { id: hotelId, ...(tenantIds ? { tenantId: { in: tenantIds } } : {}) },
        select: { id: true, brandSettings: true },
      });
      if (!hotel) return null;

      let brandSettings = data.brandSettings;
      if (brandSettings !== undefined) {
        const current = hotel.brandSettings;
        const settings: Prisma.InputJsonObject =
          brandSettings && typeof brandSettings === "object" &&
          brandSettings !== Prisma.JsonNull && brandSettings !== Prisma.DbNull &&
          !Array.isArray(brandSettings)
            ? Object.fromEntries(Object.entries(brandSettings)) : {};
        const metadata = current && typeof current === "object" && !Array.isArray(current)
          ? current : {};
        const sanitized = { ...settings };
        delete sanitized.operationalResetCount;
        delete sanitized.lastOperationalResetAt;
        for (const key of ["operationalResetCount", "lastOperationalResetAt"]) {
          if (Object.prototype.hasOwnProperty.call(metadata, key)) sanitized[key] = metadata[key];
        }
        brandSettings = Object.keys(sanitized).length ||
          (data.brandSettings !== Prisma.JsonNull && data.brandSettings !== Prisma.DbNull)
          ? sanitized : Prisma.JsonNull;
      }
      return tx.hotel.update({
        where: { id: hotel.id },
        data: { ...data, brandSettings },
        include: hotelDetailInclude,
      });
    });
  }

  async findRoomStaffAssignment(userId: string, hotelId: string) {
    return this.prisma.hotelRoomStaffAssignment.findFirst({
      where: { userId, hotelId },
      select: { id: true, roomId: true, hotelId: true, userId: true },
    });
  }

  async findRoomById(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, hotelId: true, roomNumber: true },
    });
  }

  async resetHotelOperationalData(
    hotelId: string,
    options: { unlimited?: boolean; tenantIds?: string[] } = {},
  ): Promise<{ operationalResetCount: number; remainingResets: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Hotel" WHERE id = ${hotelId} FOR UPDATE`;
      const currentHotel = await tx.hotel.findFirst({
        where: {
          id: hotelId,
          ...(options.tenantIds ? { tenantId: { in: options.tenantIds } } : {}),
        },
        select: { brandSettings: true },
      });
      if (!currentHotel) throw new NotFoundException("Khách sạn không tồn tại");
      const currentSettings =
        currentHotel.brandSettings && typeof currentHotel.brandSettings === "object" &&
        !Array.isArray(currentHotel.brandSettings) ? currentHotel.brandSettings : {};
      const currentCount = typeof currentSettings.operationalResetCount === "number"
        ? currentSettings.operationalResetCount : 0;
      if (!options.unlimited && currentCount >= 2) {
        throw new ForbiddenException(
          "Khách sạn đã sử dụng hết số lần thiết lập lại dữ liệu vận hành (tối đa 2 lần).",
        );
      }

      // 1. Delete Marketplace Revenue, Settlements, Vouchers, Carts, and Orders
      await tx.marketplaceRevenueEntry.deleteMany({ where: { hotelId } });
      await tx.serviceVoucher.deleteMany({ where: { hotelId } });
      await tx.marketplaceSettlement.deleteMany({ where: { hotelId } });
      await tx.guestCart.deleteMany({ where: { hotelId } });
      await tx.marketplaceOrder.deleteMany({ where: { hotelId } });

      // 2. Delete Invoices and payment transactions
      await tx.paymentTransaction.deleteMany({ where: { hotelId } });
      await tx.payment.deleteMany({ where: { hotelId } });
      await tx.invoice.deleteMany({ where: { hotelId } });

      // 3. Delete Folios and FolioItems
      await tx.folioItem.deleteMany({ where: { hotelId } });
      await tx.folio.deleteMany({ where: { hotelId } });

      // 4. Delete Guest Request Notifications, Events, and Requests
      await tx.guestRequestNotification.deleteMany({
        where: { guestRequest: { hotelId } },
      });
      await tx.guestRequestEvent.deleteMany({ where: { hotelId } });
      await tx.guestRequest.deleteMany({ where: { hotelId } });

      // 5. Delete Messages and Threads
      await tx.guestMessage.deleteMany({ where: { hotelId } });
      await tx.guestMessageThread.deleteMany({ where: { hotelId } });

      // 6. Delete KBTT declarations and auto submit runs
      await tx.kbttGuestDeclaration.deleteMany({ where: { hotelId } });
      await tx.kbttAutoSubmitRun.deleteMany({ where: { hotelId } });

      // 7. Delete Local Partner interactions and bookings
      await tx.localPartnerInteractionLog.deleteMany({ where: { hotelId } });
      await tx.localPartnerBookingRequest.deleteMany({ where: { hotelId } });

      // 8. Delete Emergency Notifications, Timelines, Incidents, Call Events, and Location Contexts
      await tx.emergencyNotification.deleteMany({
        where: {
          OR: [{ incident: { hotelId } }, { callEvent: { hotelId } }],
        },
      });
      await tx.emergencyIncidentTimeline.deleteMany({
        where: { incident: { hotelId } },
      });
      await tx.emergencyCallEvent.deleteMany({ where: { hotelId } });
      await tx.emergencyIncident.deleteMany({ where: { hotelId } });
      await tx.guestLocationContext.deleteMany({ where: { hotelId } });

      // 9. Delete Biometric Workstation Pairings and Registered Workstations
      await tx.biometricWorkstationPairing.deleteMany({ where: { hotelId } });
      await tx.biometricWorkstation.deleteMany({ where: { hotelId } });

      // 10. Delete Domain Events queued for this hotel
      await tx.domainEvent.deleteMany({ where: { hotelId } });

      // 12. Delete Guest Sessions, Stays, and Occupants
      await tx.guestSession.deleteMany({ where: { hotelId } });
      await tx.guestStayOccupant.deleteMany({ where: { hotelId } });
      await tx.guestStay.deleteMany({ where: { hotelId } });

      // 13. Delete Reservations
      await tx.reservation.deleteMany({ where: { hotelId } });

      // 14. Clear Platform Billing daily summaries / usages
      await tx.platformBillingDailySummary.deleteMany({ where: { hotelId } });
      await tx.platformBillableDay.deleteMany({ where: { hotelId } });
      await tx.platformUsage.deleteMany({ where: { hotelId } });

      // 14. Reset all Rooms to AVAILABLE status (keeping rooms and QR codes intact!)
      // BẢO TOÀN NGUYÊN VẸN: Không xoá phòng, không xoá QR Code, không đổi cấu hình phòng!
      // BẢO TOÀN NGUYÊN VẸN: Tuyệt đối không xoá tài khoản nhân viên, không xoá cấu hình phân công nhân viên!
      await tx.room.updateMany({
        where: { hotelId },
        data: { status: RoomStatus.AVAILABLE },
      });

      // Increment only after all destructive work succeeds, under the same row lock.
      const nextCount = currentCount + 1;

      const updatedSettings = {
        ...currentSettings,
        operationalResetCount: nextCount,
        lastOperationalResetAt: new Date().toISOString(),
      };

      await tx.hotel.update({
        where: { id: hotelId },
        data: { brandSettings: updatedSettings },
      });

      return {
        operationalResetCount: nextCount,
        remainingResets: Math.max(0, 2 - nextCount),
      };
    });
  }

  async findHotelFeatureEntitlements(hotelId: string) {
    return this.prisma.hotelFeatureEntitlement.findMany({
      where: { hotelId },
    });
  }

  async findEnabledHotelFeatureKeys(hotelId: string): Promise<string[]> {
    const rows = await this.prisma.hotelFeatureEntitlement.findMany({
      where: { hotelId, status: HotelFeatureStatus.ENABLED },
      select: { featureKey: true },
    });
    return rows.map((r) => r.featureKey);
  }

  async setHotelFeatureStatus(params: {
    hotelId: string;
    featureKey: string;
    status: HotelFeatureStatus;
    actorId: string;
  }) {
    const { hotelId, featureKey, status, actorId } = params;
    return this.prisma.$transaction(async (tx) => {
      const hotel = await tx.hotel.findUnique({
        where: { id: hotelId },
        select: { id: true, tenantId: true },
      });
      if (!hotel) {
        return null;
      }

      const existing = await tx.hotelFeatureEntitlement.findUnique({
        where: {
          hotelId_featureKey: { hotelId, featureKey },
        },
      });

      const previousStatus: HotelFeatureStatus = existing
        ? existing.status
        : HotelFeatureStatus.DISABLED;

      const changed = previousStatus !== status;

      if (!changed) {
        return { status: previousStatus, changed, previousStatus };
      }

      const entitlement = await tx.hotelFeatureEntitlement.upsert({
        where: {
          hotelId_featureKey: { hotelId, featureKey },
        },
        create: {
          hotelId,
          featureKey,
          status,
        },
        update: {
          status,
        },
      });

      if (changed) {
        await tx.auditLog.create({
          data: {
            actorId,
            tenantId: hotel.tenantId,
            action: "HOTEL_FEATURE_STATUS_CHANGED",
            entityType: "HOTEL_FEATURE_ENTITLEMENT",
            entityId: `${hotelId}:${featureKey}`,
            metadata: {
              featureKey,
              previousStatus,
              nextStatus: status,
            },
          },
        });
      }

      return { status: entitlement.status, changed, previousStatus };
    });
  }
}
