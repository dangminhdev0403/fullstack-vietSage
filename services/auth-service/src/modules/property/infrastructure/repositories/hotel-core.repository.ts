import { Injectable } from "@nestjs/common";
import {
  HotelStatus,
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
          select: { hotelId: true },
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
    return this.prisma.hotel.update({
      where: { id: hotelId },
      data,
      include: hotelDetailInclude,
    });
  }

  async updateHotelScoped(hotelId: string, tenantIds: string[], data: Prisma.HotelUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      const hotel = await tx.hotel.findFirst({
        where: { id: hotelId, tenantId: { in: tenantIds } },
        select: { id: true },
      });

      if (!hotel) {
        return null;
      }

      return tx.hotel.update({
        where: { id: hotel.id },
        data,
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
  ): Promise<{ operationalResetCount: number; remainingResets: number }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Delete Invoices and payment transactions
      await tx.paymentTransaction.deleteMany({ where: { hotelId } });
      await tx.payment.deleteMany({ where: { hotelId } });
      await tx.invoice.deleteMany({ where: { hotelId } });

      // 2. Delete Folios and FolioItems
      await tx.folioItem.deleteMany({ where: { hotelId } });
      await tx.folio.deleteMany({ where: { hotelId } });

      // 3. Delete Marketplace Orders and Carts
      await tx.guestCart.deleteMany({ where: { hotelId } });
      await tx.marketplaceOrder.deleteMany({ where: { hotelId } });

      // 4. Delete Guest Request Events and Requests
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

      // 8. Delete Guest Sessions, Stays, and Occupants
      await tx.guestSession.deleteMany({ where: { hotelId } });
      await tx.guestStayOccupant.deleteMany({ where: { hotelId } });
      await tx.guestStay.deleteMany({ where: { hotelId } });

      // 9. Delete Reservations
      await tx.reservation.deleteMany({ where: { hotelId } });

      // 10. Clear Platform Billing daily summaries / usages
      await tx.platformBillingDailySummary.deleteMany({ where: { hotelId } });
      await tx.platformBillableDay.deleteMany({ where: { hotelId } });
      await tx.platformUsage.deleteMany({ where: { hotelId } });

      // 11. Reset all Rooms to AVAILABLE status (keeping rooms and QR codes intact!)
      await tx.room.updateMany({
        where: { hotelId },
        data: { status: RoomStatus.AVAILABLE },
      });

      // 12. Fetch current brandSettings, increment operationalResetCount
      const currentHotel = await tx.hotel.findUnique({
        where: { id: hotelId },
        select: { brandSettings: true },
      });

      const currentSettings =
        currentHotel?.brandSettings && typeof currentHotel.brandSettings === "object"
          ? (currentHotel.brandSettings as Record<string, unknown>)
          : {};
      const currentCount =
        typeof currentSettings.operationalResetCount === "number"
          ? currentSettings.operationalResetCount
          : 0;
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
}
