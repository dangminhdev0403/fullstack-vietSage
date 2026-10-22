import { Injectable } from "@nestjs/common";
import { FolioItemType, PaymentMethod, PaymentStatus, Prisma, RoomStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { HotelAccessService } from "./hotel-access.service";
import type { GetHotelReportsQuery } from "../domain/schemas/hotel-reports.schema";

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

function normalizeNationality(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "Chưa xác định";
  const norm = raw.trim().toUpperCase();
  if (norm === "VN" || norm === "VNM" || norm === "VIETNAM" || norm === "VIỆT NAM" || norm === "VIET NAM") {
    return "Việt Nam";
  }
  if (norm === "KR" || norm === "KOR" || norm === "KOREA" || norm === "SOUTH KOREA" || norm === "HÀN QUỐC") {
    return "Hàn Quốc";
  }
  if (norm === "CN" || norm === "CHN" || norm === "CHINA" || norm === "TRUNG QUỐC") {
    return "Trung Quốc";
  }
  if (norm === "US" || norm === "USA" || norm === "UNITED STATES" || norm === "MỸ" || norm === "HOA KỲ") {
    return "Mỹ";
  }
  if (norm === "JP" || norm === "JPN" || norm === "JAPAN" || norm === "NHẬT BẢN") {
    return "Nhật Bản";
  }
  if (norm === "AU" || norm === "AUS" || norm === "AUSTRALIA" || norm === "ÚC") {
    return "Úc";
  }
  if (norm === "RU" || norm === "RUS" || norm === "RUSSIA" || norm === "NGA") {
    return "Nga";
  }
  if (norm === "GB" || norm === "GBR" || norm === "UK" || norm === "UNITED KINGDOM" || norm === "ANH") {
    return "Vương quốc Anh";
  }
  if (norm === "FR" || norm === "FRA" || norm === "FRANCE" || norm === "PHÁP") {
    return "Pháp";
  }
  if (norm === "DE" || norm === "DEU" || norm === "GERMANY" || norm === "ĐỨC") {
    return "Đức";
  }
  if (norm === "TW" || norm === "TWN" || norm === "TAIWAN" || norm === "ĐÀI LOAN") {
    return "Đài Loan";
  }
  if (norm === "SG" || norm === "SGP" || norm === "SINGAPORE") {
    return "Singapore";
  }
  if (norm === "TH" || norm === "THA" || norm === "THAILAND" || norm === "THÁI LAN") {
    return "Thái Lan";
  }
  if (norm === "MY" || norm === "MYS" || norm === "MALAYSIA") {
    return "Malaysia";
  }
  if (norm === "IN" || norm === "IND" || norm === "INDIA" || norm === "ẤN ĐỘ") {
    return "Ấn Độ";
  }
  return raw.trim();
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "Tiền mặt",
  [PaymentMethod.BANK_TRANSFER]: "Chuyển khoản ngân hàng",
  [PaymentMethod.CARD]: "Thẻ POS / Tín dụng",
  [PaymentMethod.MOMO]: "Ví điện tử MoMo",
  [PaymentMethod.VNPAY]: "Cổng thanh toán VNPAY",
  [PaymentMethod.STRIPE]: "Cổng thanh toán Stripe",
  [PaymentMethod.MANUAL]: "Thủ công / Khác",
};

export interface HotelReportsData {
  hotelId: string;
  hotelName: string;
  currency: string;
  timeZone: string;
  range: string;
  startDate: string;
  endDate: string;
  summary: {
    totalRooms: number;
    occupiedRoomsNow: number;
    totalStays: number;
    totalGuests: number;
    totalRoomNights: number;
    occupancyRate: number;
    currentOccupancyRate: number;
    totalRevenue: number;
    roomRevenue: number;
    serviceRevenue: number;
    otherRevenue: number;
    adr: number;
    revpar: number;
  };
  revenueByDay: Array<{
    date: string;
    dayLabel: string;
    totalRevenue: number;
    roomRevenue: number;
    serviceRevenue: number;
    roomsOccupied: number;
    adr: number;
    occupancyRate: number;
  }>;
  revenueByMonth: Array<{
    month: string;
    monthLabel: string;
    totalRevenue: number;
    roomRevenue: number;
    serviceRevenue: number;
    bookingCount: number;
    roomsSold: number;
    averageOccupancy: number;
    adr: number;
  }>;
  revenueBySource: Array<{
    sourceKey: string;
    sourceName: string;
    sourceType: "OTA" | "DIRECT" | "WALK_IN";
    bookingCount: number;
    guestCount: number;
    totalRevenue: number;
    sharePercent: number;
    adr: number;
  }>;
  revenueByStaff: Array<{
    staffId: string;
    staffName: string;
    role: string;
    collectedAmount: number;
    transactionCount: number;
    staysHandled: number;
    cashAmount: number;
    bankTransferAmount: number;
    cardAmount: number;
    otherAmount: number;
  }>;
  guestAnalytics: {
    nationalities: Array<{
      nationality: string;
      guestCount: number;
      percentage: number;
      totalRoomNights: number;
      averageStayNights: number;
    }>;
    genderDistribution: {
      male: number;
      female: number;
      other: number;
      unspecified: number;
    };
    domesticVsInternational: {
      domestic: number;
      international: number;
      domesticPercentage: number;
      internationalPercentage: number;
    };
  };
  paymentMethods: Array<{
    method: string;
    methodName: string;
    amount: number;
    count: number;
    percentage: number;
  }>;
}

@Injectable()
export class HotelReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  async getReports(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query: GetHotelReportsQuery,
  ): Promise<HotelReportsData> {
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );

    const timeZone = scope.hotel?.timezone || "Asia/Ho_Chi_Minh";
    const hotelName = scope.hotel?.name || "Khách sạn";
    const currency = "VND";

    const { startDate, endDate, rangeKey } = this.resolveDateRange(query, timeZone);

    const roomWhere: Prisma.RoomWhereInput =
      scope.allowedRoomId !== null ? { hotelId, id: scope.allowedRoomId } : { hotelId };
    const stayWhere: Prisma.GuestStayWhereInput =
      scope.allowedRoomId !== null ? { hotelId, roomId: scope.allowedRoomId } : { hotelId };
    const paymentWhere: Prisma.PaymentWhereInput =
      scope.allowedRoomId !== null
        ? { hotelId, folio: { roomId: scope.allowedRoomId } }
        : { hotelId };

    const [
      totalRooms,
      occupiedRoomsNow,
      succeededPayments,
      folioItems,
      stays,
      staffAssignments,
    ] = await Promise.all([
      this.prisma.room.count({ where: roomWhere }),
      this.prisma.room.count({ where: { ...roomWhere, status: RoomStatus.OCCUPIED } }),
      this.prisma.payment.findMany({
        where: {
          ...paymentWhere,
          status: PaymentStatus.SUCCEEDED,
          confirmedAt: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          paidAmount: true,
          method: true,
          confirmedAt: true,
          createdByUserId: true,
          createdBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.folioItem.findMany({
        where: {
          hotelId,
          voidedAt: null,
          postedAt: { gte: startDate, lte: endDate },
          ...(scope.allowedRoomId !== null ? { roomId: scope.allowedRoomId } : {}),
        },
        select: {
          id: true,
          itemType: true,
          nameSnapshot: true,
          totalSnapshot: true,
          postedAt: true,
          postedByUserId: true,
          postedBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.guestStay.findMany({
        where: {
          ...stayWhere,
          OR: [
            { plannedCheckInAt: { lte: endDate }, plannedCheckOutAt: { gte: startDate } },
            { checkedInAt: { lte: endDate }, checkedOutAt: { gte: startDate } },
            { createdAt: { gte: startDate, lte: endDate } },
          ],
        },
        select: {
          id: true,
          reservationCode: true,
          guestDisplayName: true,
          guestNationality: true,
          guestGender: true,
          status: true,
          plannedCheckInAt: true,
          plannedCheckOutAt: true,
          checkedInAt: true,
          checkedOutAt: true,
          nightlyRateSnapshot: true,
          baseNightlyRateSnapshot: true,
          createdByUserId: true,
          closedByUserId: true,
          createdBy: { select: { id: true, fullName: true, email: true } },
          occupants: {
            select: {
              id: true,
              fullName: true,
              nationality: true,
              gender: true,
              isPrimary: true,
            },
          },
          reservation: {
            select: {
              id: true,
              reservationCode: true,
              groupCode: true,
              status: true,
              guestCount: true,
              createdByUserId: true,
            },
          },
        },
      }),
      this.prisma.hotelStaffAssignment.findMany({
        where: { hotelId },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              userRoles: {
                select: {
                  role: {
                    select: {
                      code: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    // 1. Calculate Folio item breakdowns
    let folioRoomRevenue = 0;
    let folioServiceRevenue = 0;
    let folioOtherRevenue = 0;
    for (const item of folioItems) {
      const val = toNumber(item.totalSnapshot);
      if (item.itemType === FolioItemType.ROOM_CHARGE) {
        folioRoomRevenue += val;
      } else if (item.itemType === FolioItemType.SERVICE) {
        folioServiceRevenue += val;
      } else {
        folioOtherRevenue += val;
      }
    }

    // 2. Total collected revenue from payments
    const totalCollected = succeededPayments.reduce(
      (sum, p) => sum + toNumber(p.paidAmount),
      0,
    );

    // Reconcile room revenue and service revenue
    const totalFolioRevenue = folioRoomRevenue + folioServiceRevenue + folioOtherRevenue;
    let effectiveTotalRevenue = totalCollected > 0 ? totalCollected : totalFolioRevenue;
    let effectiveRoomRevenue = folioRoomRevenue;
    let effectiveServiceRevenue = folioServiceRevenue;
    let effectiveOtherRevenue = folioOtherRevenue;

    if (effectiveTotalRevenue > 0 && effectiveRoomRevenue === 0 && effectiveServiceRevenue === 0) {
      // Default estimate 85% room, 15% services if payments exist before posting folio items
      effectiveRoomRevenue = Math.round(effectiveTotalRevenue * 0.85);
      effectiveServiceRevenue = effectiveTotalRevenue - effectiveRoomRevenue;
    }

    // 3. Room Nights & Occupancy calculation
    const daysInRange = Math.max(
      1,
      Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const availableRoomNights = totalRooms * daysInRange;

    let totalRoomNights = 0;
    for (const stay of stays) {
      const stayStart = stay.checkedInAt || stay.plannedCheckInAt;
      const stayEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
      const overlapStart = Math.max(stayStart.getTime(), startDate.getTime());
      const overlapEnd = Math.min(stayEnd.getTime(), endDate.getTime());
      if (overlapEnd > overlapStart) {
        const nights = Math.max(
          1,
          Math.round((overlapEnd - overlapStart) / (24 * 60 * 60 * 1000)),
        );
        totalRoomNights += nights;
      }
    }

    const occupancyRate =
      availableRoomNights > 0
        ? Math.min(100, Math.round((totalRoomNights / availableRoomNights) * 1000) / 10)
        : 0;

    const currentOccupancyRate =
      totalRooms > 0
        ? Math.min(100, Math.round((occupiedRoomsNow / totalRooms) * 1000) / 10)
        : 0;

    // ADR = Room Revenue / Total Room Nights
    const adr =
      totalRoomNights > 0
        ? Math.round((effectiveRoomRevenue || effectiveTotalRevenue) / totalRoomNights)
        : 0;

    // RevPAR = Room Revenue / Available Room Nights (or ADR * Occupancy Rate)
    const revpar =
      availableRoomNights > 0
        ? Math.round((effectiveRoomRevenue || effectiveTotalRevenue) / availableRoomNights)
        : 0;

    // Total distinct guests
    let totalGuests = 0;
    for (const stay of stays) {
      const occupantCount = stay.occupants.length;
      totalGuests += Math.max(1, occupantCount);
    }

    // 4. Daily Revenue & Occupancy Breakdown
    const revenueByDay = this.buildDailyBreakdown(
      startDate,
      endDate,
      totalRooms,
      succeededPayments,
      folioItems,
      stays,
    );

    // 5. Monthly Revenue Breakdown
    const revenueByMonth = this.buildMonthlyBreakdown(
      endDate,
      totalRooms,
      succeededPayments,
      folioItems,
      stays,
    );

    // 6. Revenue by Booking Source
    const revenueBySource = this.buildSourceBreakdown(stays, effectiveTotalRevenue, adr);

    // 7. Revenue by Staff Member
    const revenueByStaff = this.buildStaffBreakdown(
      succeededPayments,
      stays,
      staffAssignments,
    );

    // 8. Guest Analytics (Nationalities & Demographics)
    const guestAnalytics = this.buildGuestAnalytics(stays, totalRoomNights);

    // 9. Payment Methods Breakdown
    const paymentMethods = this.buildPaymentMethodsBreakdown(succeededPayments);

    return {
      hotelId,
      hotelName,
      currency,
      timeZone,
      range: rangeKey,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      summary: {
        totalRooms,
        occupiedRoomsNow,
        totalStays: stays.length,
        totalGuests,
        totalRoomNights,
        occupancyRate,
        currentOccupancyRate,
        totalRevenue: effectiveTotalRevenue,
        roomRevenue: effectiveRoomRevenue,
        serviceRevenue: effectiveServiceRevenue,
        otherRevenue: effectiveOtherRevenue,
        adr,
        revpar,
      },
      revenueByDay,
      revenueByMonth,
      revenueBySource,
      revenueByStaff,
      guestAnalytics,
      paymentMethods,
    };
  }

  private resolveDateRange(query: GetHotelReportsQuery, timeZone = "Asia/Ho_Chi_Minh"): {
    startDate: Date;
    endDate: Date;
    rangeKey: string;
  } {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((p) => p.type === "year")?.value || "2026";
    const month = parts.find((p) => p.type === "month")?.value || "01";
    const day = parts.find((p) => p.type === "day")?.value || "01";

    const end = new Date(`${year}-${month}-${day}T23:59:59.999+07:00`);

    if (query.from && query.to) {
      const fromParsed = new Date(`${query.from}T00:00:00.000+07:00`);
      const toParsed = new Date(`${query.to}T23:59:59.999+07:00`);
      if (!Number.isNaN(fromParsed.getTime()) && !Number.isNaN(toParsed.getTime())) {
        return { startDate: fromParsed, endDate: toParsed, rangeKey: "custom" };
      }
    }

    const range = query.range || "30d";
    let start: Date;

    const numYear = parseInt(year, 10);
    const numMonth = parseInt(month, 10) - 1;

    switch (range) {
      case "7d": {
        start = new Date(end);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case "14d": {
        start = new Date(end);
        start.setDate(start.getDate() - 13);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case "90d": {
        start = new Date(end);
        start.setDate(start.getDate() - 89);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case "this_month": {
        start = new Date(`${year}-${month}-01T00:00:00.000+07:00`);
        break;
      }
      case "last_month": {
        const prevMonthDate = new Date(numYear, numMonth - 1, 1);
        const prevYearStr = String(prevMonthDate.getFullYear());
        const prevMonthStr = String(prevMonthDate.getMonth() + 1).padStart(2, "0");
        const startPrevMonth = new Date(`${prevYearStr}-${prevMonthStr}-01T00:00:00.000+07:00`);
        const lastDayOfPrevMonthDate = new Date(numYear, numMonth, 0);
        const lastDayStr = String(lastDayOfPrevMonthDate.getDate()).padStart(2, "0");
        const endPrevMonth = new Date(`${prevYearStr}-${prevMonthStr}-${lastDayStr}T23:59:59.999+07:00`);
        return { startDate: startPrevMonth, endDate: endPrevMonth, rangeKey: range };
      }
      case "this_year": {
        start = new Date(`${year}-01-01T00:00:00.000+07:00`);
        break;
      }
      case "30d":
      default: {
        start = new Date(end);
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        break;
      }
    }

    return { startDate: start, endDate: end, rangeKey: range };
  }

  private buildDailyBreakdown(
    startDate: Date,
    endDate: Date,
    totalRooms: number,
    payments: Array<{ paidAmount: Prisma.Decimal | number; confirmedAt: Date | null }>,
    folioItems: Array<{
      itemType: FolioItemType;
      totalSnapshot: Prisma.Decimal | number;
      postedAt: Date;
    }>,
    stays: Array<{
      plannedCheckInAt: Date;
      plannedCheckOutAt: Date;
      checkedInAt: Date | null;
      checkedOutAt: Date | null;
    }>,
  ) {
    const days: HotelReportsData["revenueByDay"] = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    const paymentMap = new Map<string, number>();
    for (const p of payments) {
      if (!p.confirmedAt) continue;
      const key = p.confirmedAt.toISOString().slice(0, 10);
      paymentMap.set(key, (paymentMap.get(key) || 0) + toNumber(p.paidAmount));
    }

    const roomChargeMap = new Map<string, number>();
    const serviceChargeMap = new Map<string, number>();
    for (const item of folioItems) {
      const key = item.postedAt.toISOString().slice(0, 10);
      const val = toNumber(item.totalSnapshot);
      if (item.itemType === FolioItemType.ROOM_CHARGE) {
        roomChargeMap.set(key, (roomChargeMap.get(key) || 0) + val);
      } else if (item.itemType === FolioItemType.SERVICE) {
        serviceChargeMap.set(key, (serviceChargeMap.get(key) || 0) + val);
      }
    }

    while (current <= endDate) {
      const dateKey = current.toISOString().slice(0, 10);
      const currentDayStart = new Date(current);
      const currentDayEnd = new Date(current);
      currentDayEnd.setHours(23, 59, 59, 999);

      // Count stays active on this day
      let roomsOccupied = 0;
      for (const stay of stays) {
        const sStart = stay.checkedInAt || stay.plannedCheckInAt;
        const sEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
        if (sStart <= currentDayEnd && sEnd >= currentDayStart) {
          roomsOccupied++;
        }
      }

      const dayTotalPaid = paymentMap.get(dateKey) || 0;
      const dayRoomCharge = roomChargeMap.get(dateKey) || 0;
      const dayServiceCharge = serviceChargeMap.get(dateKey) || 0;

      const totalRevenue =
        dayTotalPaid > 0 ? dayTotalPaid : dayRoomCharge + dayServiceCharge;
      const roomRevenue =
        dayRoomCharge > 0 ? dayRoomCharge : Math.round(totalRevenue * 0.85);
      const serviceRevenue =
        dayServiceCharge > 0 ? dayServiceCharge : totalRevenue - roomRevenue;

      const occ =
        totalRooms > 0
          ? Math.min(100, Math.round((roomsOccupied / totalRooms) * 1000) / 10)
          : 0;
      const adr =
        roomsOccupied > 0 ? Math.round((roomRevenue || totalRevenue) / roomsOccupied) : 0;

      const d = current.getDate();
      const m = current.getMonth() + 1;
      const dayLabel = `${d}/${m}`;

      days.push({
        date: dateKey,
        dayLabel,
        totalRevenue,
        roomRevenue,
        serviceRevenue,
        roomsOccupied,
        adr,
        occupancyRate: occ,
      });

      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  private buildMonthlyBreakdown(
    endDate: Date,
    totalRooms: number,
    payments: Array<{ paidAmount: Prisma.Decimal | number; confirmedAt: Date | null }>,
    folioItems: Array<{
      itemType: FolioItemType;
      totalSnapshot: Prisma.Decimal | number;
      postedAt: Date;
    }>,
    stays: Array<{
      plannedCheckInAt: Date;
      plannedCheckOutAt: Date;
      checkedInAt: Date | null;
      checkedOutAt: Date | null;
    }>,
  ) {
    const months: HotelReportsData["revenueByMonth"] = [];
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(endYear, endMonth - i, 1);
      const year = d.getFullYear();
      const monthIndex = d.getMonth();
      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      const monthLabel = `Thg ${monthIndex + 1}/${year}`;

      const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
      const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
      const daysInMonth = monthEnd.getDate();

      let monthRevenue = 0;
      for (const p of payments) {
        if (p.confirmedAt && p.confirmedAt >= monthStart && p.confirmedAt <= monthEnd) {
          monthRevenue += toNumber(p.paidAmount);
        }
      }

      let monthRoomRevenue = 0;
      let monthServiceRevenue = 0;
      for (const item of folioItems) {
        if (item.postedAt >= monthStart && item.postedAt <= monthEnd) {
          const val = toNumber(item.totalSnapshot);
          if (item.itemType === FolioItemType.ROOM_CHARGE) {
            monthRoomRevenue += val;
          } else if (item.itemType === FolioItemType.SERVICE) {
            monthServiceRevenue += val;
          }
        }
      }

      if (monthRevenue === 0 && (monthRoomRevenue > 0 || monthServiceRevenue > 0)) {
        monthRevenue = monthRoomRevenue + monthServiceRevenue;
      }
      if (monthRoomRevenue === 0 && monthRevenue > 0) {
        monthRoomRevenue = Math.round(monthRevenue * 0.85);
        monthServiceRevenue = monthRevenue - monthRoomRevenue;
      }

      let bookingCount = 0;
      let roomsSold = 0;
      for (const stay of stays) {
        const sStart = stay.checkedInAt || stay.plannedCheckInAt;
        const sEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
        const oStart = Math.max(sStart.getTime(), monthStart.getTime());
        const oEnd = Math.min(sEnd.getTime(), monthEnd.getTime());
        if (oEnd > oStart) {
          bookingCount++;
          const nights = Math.max(1, Math.round((oEnd - oStart) / (24 * 60 * 60 * 1000)));
          roomsSold += nights;
        }
      }

      const availableNights = totalRooms * daysInMonth;
      const averageOccupancy =
        availableNights > 0
          ? Math.min(100, Math.round((roomsSold / availableNights) * 1000) / 10)
          : 0;
      const adr =
        roomsSold > 0 ? Math.round((monthRoomRevenue || monthRevenue) / roomsSold) : 0;

      months.push({
        month: monthKey,
        monthLabel,
        totalRevenue: monthRevenue,
        roomRevenue: monthRoomRevenue,
        serviceRevenue: monthServiceRevenue,
        bookingCount,
        roomsSold,
        averageOccupancy,
        adr,
      });
    }

    return months;
  }

  private buildSourceBreakdown(
    stays: Array<{
      reservationCode: string;
      nightlyRateSnapshot: Prisma.Decimal | number | null;
      baseNightlyRateSnapshot: Prisma.Decimal | number | null;
      occupants: Array<{ id: string }>;
      reservation: { groupCode: string | null; guestCount: number | null } | null;
    }>,
    totalRevenue: number,
    baseAdr: number,
  ) {
    const sourcesMap = new Map<
      string,
      {
        sourceKey: string;
        sourceName: string;
        sourceType: "OTA" | "DIRECT" | "WALK_IN";
        bookingCount: number;
        guestCount: number;
        revenue: number;
      }
    >();

    const getOrCreate = (
      key: string,
      name: string,
      type: "OTA" | "DIRECT" | "WALK_IN",
    ) => {
      let entry = sourcesMap.get(key);
      if (!entry) {
        entry = {
          sourceKey: key,
          sourceName: name,
          sourceType: type,
          bookingCount: 0,
          guestCount: 0,
          revenue: 0,
        };
        sourcesMap.set(key, entry);
      }
      return entry;
    };

    for (const stay of stays) {
      const code = (stay.reservationCode || "").toUpperCase();
      const group = (stay.reservation?.groupCode || "").toUpperCase();
      const rate =
        toNumber(stay.nightlyRateSnapshot) ||
        toNumber(stay.baseNightlyRateSnapshot) ||
        baseAdr;
      const guests = Math.max(1, stay.occupants.length, stay.reservation?.guestCount || 1);

      let target;
      if (code.includes("BOOKING") || code.includes("BDC") || group.includes("BOOKING")) {
        target = getOrCreate("OTA_BOOKING", "Booking.com", "OTA");
      } else if (code.includes("AGODA") || group.includes("AGODA")) {
        target = getOrCreate("OTA_AGODA", "Agoda", "OTA");
      } else if (code.includes("AIRBNB") || group.includes("AIRBNB")) {
        target = getOrCreate("OTA_AIRBNB", "Airbnb", "OTA");
      } else if (code.startsWith("OTA-") || group.startsWith("CHANNEX:")) {
        target = getOrCreate("OTA_OTHER", "Kênh OTA khác", "OTA");
      } else if (code.startsWith("VSH_") || stay.reservation) {
        target = getOrCreate("DIRECT", "Đặt phòng trực tiếp (Website / Hotline)", "DIRECT");
      } else {
        target = getOrCreate("WALK_IN", "Khách vãng lai tại quầy", "WALK_IN");
      }

      target.bookingCount += 1;
      target.guestCount += guests;
      target.revenue += rate;
    }

    if (sourcesMap.size === 0) {
      sourcesMap.set("DIRECT", {
        sourceKey: "DIRECT",
        sourceName: "Đặt phòng trực tiếp",
        sourceType: "DIRECT",
        bookingCount: 0,
        guestCount: 0,
        revenue: 0,
      });
    }

    const list = Array.from(sourcesMap.values());
    const rawSum = list.reduce((sum, item) => sum + item.revenue, 0);

    return list.map((item) => {
      const share =
        rawSum > 0
          ? Math.round((item.revenue / rawSum) * 1000) / 10
          : 0;
      const normalizedRevenue =
        totalRevenue > 0 && rawSum > 0
          ? Math.round((item.revenue / rawSum) * totalRevenue)
          : item.revenue;
      const adr =
        item.bookingCount > 0 ? Math.round(normalizedRevenue / item.bookingCount) : baseAdr;

      return {
        sourceKey: item.sourceKey,
        sourceName: item.sourceName,
        sourceType: item.sourceType,
        bookingCount: item.bookingCount,
        guestCount: item.guestCount,
        totalRevenue: normalizedRevenue,
        sharePercent: share,
        adr,
      };
    });
  }

  private buildStaffBreakdown(
    payments: Array<{
      paidAmount: Prisma.Decimal | number;
      method: PaymentMethod;
      createdByUserId: string | null;
      createdBy: { id: string; fullName: string | null; email: string } | null;
    }>,
    stays: Array<{
      createdByUserId: string | null;
      closedByUserId: string | null;
      createdBy: { id: string; fullName: string | null; email: string } | null;
    }>,
    staffAssignments: Array<{
      userId: string;
      user: {
        id: string;
        fullName: string | null;
        email: string;
        userRoles: Array<{ role: { code: string; name: string } }>;
      };
    }>,
  ) {
    const staffMap = new Map<
      string,
      {
        staffId: string;
        staffName: string;
        role: string;
        collectedAmount: number;
        transactionCount: number;
        staysHandled: number;
        cashAmount: number;
        bankTransferAmount: number;
        cardAmount: number;
        otherAmount: number;
      }
    >();

    // Seed from assigned staff
    for (const a of staffAssignments) {
      const roleName = a.user.userRoles[0]?.role?.name || "Nhân viên";
      staffMap.set(a.userId, {
        staffId: a.userId,
        staffName: a.user.fullName || a.user.email,
        role: roleName,
        collectedAmount: 0,
        transactionCount: 0,
        staysHandled: 0,
        cashAmount: 0,
        bankTransferAmount: 0,
        cardAmount: 0,
        otherAmount: 0,
      });
    }

    for (const p of payments) {
      const uid = p.createdByUserId || "system";
      let entry = staffMap.get(uid);
      if (!entry) {
        entry = {
          staffId: uid,
          staffName: p.createdBy?.fullName || p.createdBy?.email || "Thu ngân lễ tân",
          role: "Thu ngân",
          collectedAmount: 0,
          transactionCount: 0,
          staysHandled: 0,
          cashAmount: 0,
          bankTransferAmount: 0,
          cardAmount: 0,
          otherAmount: 0,
        };
        staffMap.set(uid, entry);
      }

      const val = toNumber(p.paidAmount);
      entry.collectedAmount += val;
      entry.transactionCount += 1;

      if (p.method === PaymentMethod.CASH) {
        entry.cashAmount += val;
      } else if (p.method === PaymentMethod.BANK_TRANSFER) {
        entry.bankTransferAmount += val;
      } else if (p.method === PaymentMethod.CARD) {
        entry.cardAmount += val;
      } else {
        entry.otherAmount += val;
      }
    }

    for (const s of stays) {
      const uid = s.createdByUserId || s.closedByUserId;
      if (uid && staffMap.has(uid)) {
        staffMap.get(uid)!.staysHandled += 1;
      }
    }

    return Array.from(staffMap.values()).sort(
      (a, b) => b.collectedAmount - a.collectedAmount,
    );
  }

  private buildGuestAnalytics(
    stays: Array<{
      guestNationality: string | null;
      guestGender: string | null;
      occupants: Array<{ nationality: string | null; gender: string | null }>;
    }>,
    totalNights: number,
  ) {
    const nationCountMap = new Map<string, number>();
    let maleCount = 0;
    let femaleCount = 0;
    let otherGender = 0;
    let unspecifiedGender = 0;
    let totalGuests = 0;

    for (const stay of stays) {
      const occupants = stay.occupants.length > 0 ? stay.occupants : [{ nationality: stay.guestNationality, gender: stay.guestGender }];
      for (const occ of occupants) {
        totalGuests++;
        const nation = normalizeNationality(occ.nationality);
        nationCountMap.set(nation, (nationCountMap.get(nation) || 0) + 1);

        const g = (occ.gender || "").trim().toUpperCase();
        if (g === "NAM" || g === "MALE" || g === "M") {
          maleCount++;
        } else if (g === "NỮ" || g === "NU" || g === "FEMALE" || g === "F") {
          femaleCount++;
        } else if (g) {
          otherGender++;
        } else {
          unspecifiedGender++;
        }
      }
    }

    if (totalGuests === 0) {
      totalGuests = 1;
    }

    const nationalities: HotelReportsData["guestAnalytics"]["nationalities"] = [];
    let domesticCount = 0;
    let internationalCount = 0;

    for (const [nation, count] of nationCountMap.entries()) {
      if (nation === "Việt Nam") {
        domesticCount += count;
      } else {
        internationalCount += count;
      }

      const pct = Math.round((count / totalGuests) * 1000) / 10;
      const estimatedNights = totalNights > 0 ? Math.round(totalNights * (count / totalGuests)) : count * 2;
      const avgStay = count > 0 ? Math.max(1, Math.round((estimatedNights / count) * 10) / 10) : 1;

      nationalities.push({
        nationality: nation,
        guestCount: count,
        percentage: pct,
        totalRoomNights: estimatedNights,
        averageStayNights: avgStay,
      });
    }

    nationalities.sort((a, b) => b.guestCount - a.guestCount);

    return {
      nationalities,
      genderDistribution: {
        male: maleCount,
        female: femaleCount,
        other: otherGender,
        unspecified: unspecifiedGender,
      },
      domesticVsInternational: {
        domestic: domesticCount,
        international: internationalCount,
        domesticPercentage: Math.round((domesticCount / totalGuests) * 1000) / 10,
        internationalPercentage: Math.round((internationalCount / totalGuests) * 1000) / 10,
      },
    };
  }

  private buildPaymentMethodsBreakdown(
    payments: Array<{ paidAmount: Prisma.Decimal | number; method: PaymentMethod }>,
  ) {
    const map = new Map<string, { amount: number; count: number }>();
    let total = 0;

    for (const p of payments) {
      const val = toNumber(p.paidAmount);
      total += val;
      const existing = map.get(p.method) || { amount: 0, count: 0 };
      existing.amount += val;
      existing.count += 1;
      map.set(p.method, existing);
    }

    const result: HotelReportsData["paymentMethods"] = [];
    for (const [methodKey, val] of map.entries()) {
      const m = methodKey as PaymentMethod;
      result.push({
        method: m,
        methodName: PAYMENT_METHOD_LABELS[m] || m,
        amount: val.amount,
        count: val.count,
        percentage: total > 0 ? Math.round((val.amount / total) * 1000) / 10 : 0,
      });
    }

    result.sort((a, b) => b.amount - a.amount);
    return result;
  }
}
