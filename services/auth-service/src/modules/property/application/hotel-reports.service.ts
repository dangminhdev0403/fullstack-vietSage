import { Injectable } from "@nestjs/common";
import { Temporal } from "@js-temporal/polyfill";
import {
  FolioItemType,
  GuestStayStatus,
  HotelStaffAssignmentStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  RoomStatus,
  UserRoleStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { HotelAccessService } from "./hotel-access.service";
import type { GetHotelReportsQuery } from "../domain/schemas/hotel-reports.schema";

const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

function normalizeTimeZone(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "Asia/Saigon") {
    return DEFAULT_TIME_ZONE;
  }
  try {
    Temporal.Now.zonedDateTimeISO(trimmed);
    return trimmed;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function dateToPlainDate(date: Date, timeZone: string): Temporal.PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
}

function plainDateStartUtc(plainDate: Temporal.PlainDate, timeZone: string): Date {
  const zdt = plainDate.toZonedDateTime({
    timeZone,
    plainTime: Temporal.PlainTime.from({
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    }),
  });
  return new Date(zdt.epochMilliseconds);
}

function plainDateEndUtc(plainDate: Temporal.PlainDate, timeZone: string): Date {
  const zdt = plainDate.toZonedDateTime({
    timeZone,
    plainTime: Temporal.PlainTime.from({
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    }),
  });
  return new Date(zdt.epochMilliseconds);
}

function getStayActivePlainDates(
  stayStart: Date,
  stayEnd: Date,
  timeZone: string,
): Temporal.PlainDate[] {
  const inDate = dateToPlainDate(stayStart, timeZone);
  const outDate = dateToPlainDate(stayEnd, timeZone);

  if (Temporal.PlainDate.compare(outDate, inDate) <= 0) {
    return [inDate];
  }

  const dates: Temporal.PlainDate[] = [];
  let cursor = inDate;
  // Cap iteration at 730 days to guard against malformed dates
  let safety = 0;
  while (Temporal.PlainDate.compare(cursor, outDate) < 0 && safety < 730) {
    dates.push(cursor);
    cursor = cursor.add({ days: 1 });
    safety++;
  }
  return dates.length > 0 ? dates : [inDate];
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

function normalizeNationality(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return "Chưa xác định";
  const norm = raw.trim().toUpperCase();
  if (
    norm === "VN" ||
    norm === "VNM" ||
    norm === "VIETNAM" ||
    norm === "VIỆT NAM" ||
    norm === "VIET NAM"
  ) {
    return "Việt Nam";
  }
  if (
    norm === "KR" ||
    norm === "KOR" ||
    norm === "KOREA" ||
    norm === "SOUTH KOREA" ||
    norm === "HÀN QUỐC"
  ) {
    return "Hàn Quốc";
  }
  if (norm === "CN" || norm === "CHN" || norm === "CHINA" || norm === "TRUNG QUỐC") {
    return "Trung Quốc";
  }
  if (
    norm === "US" ||
    norm === "USA" ||
    norm === "UNITED STATES" ||
    norm === "MỸ" ||
    norm === "HOA KỲ"
  ) {
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
  if (
    norm === "GB" ||
    norm === "GBR" ||
    norm === "UK" ||
    norm === "UNITED KINGDOM" ||
    norm === "ANH"
  ) {
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
    sourceType: "OTA" | "DIRECT" | "WALK_IN" | "TA" | "CORPORATE" | "OTHER";
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
  revenueByBookingOwner?: Array<{
    ownerUserId: string;
    ownerName: string;
    bookingCount: number;
    roomNights: number;
    revenue: number;
  }>;
  receivablesSummary?: {
    totalOriginal: number;
    totalPaid: number;
    totalOutstanding: number;
    openCount: number;
    overdueCount: number;
    count: number;
  };
  bookingPaymentsSummary?: {
    totalRequested: number;
    totalReceived: number;
    depositCount: number;
  };
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

type StayRecord = {
  id: string;
  reservationCode: string;
  guestDisplayName: string;
  guestNationality: string | null;
  guestGender: string | null;
  status: GuestStayStatus | string;
  plannedCheckInAt: Date;
  plannedCheckOutAt: Date;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  nightlyRateSnapshot: Prisma.Decimal | number | null;
  baseNightlyRateSnapshot: Prisma.Decimal | number | null;
  createdByUserId: string | null;
  closedByUserId: string | null;
  createdBy: { id: string; fullName: string | null; email: string } | null;
  room?: {
    price: Prisma.Decimal | number | null;
    roomType: { basePrice: Prisma.Decimal | number | null } | null;
  } | null;
  occupants: Array<{
    id: string;
    fullName: string;
    nationality: string | null;
    gender: string | null;
    isPrimary: boolean;
  }>;
  reservation: {
    id: string;
    reservationCode: string;
    groupCode: string | null;
    status: string;
    guestCount: number | null;
    createdByUserId: string | null;
    sourceCategory?: any;
    sourcePartnerId?: string | null;
    bookingOwnerUserId?: string | null;
    sourcePartner?: { id: string; name: string; category?: any } | null;
  } | null;
};

function resolveStayNightlyRate(stay: StayRecord, fallbackAdr = 0): number {
  return (
    toNumber(stay.nightlyRateSnapshot) ||
    toNumber(stay.baseNightlyRateSnapshot) ||
    toNumber(stay.room?.price) ||
    toNumber(stay.room?.roomType?.basePrice) ||
    fallbackAdr
  );
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

    const timeZone = normalizeTimeZone(scope.hotel?.timezone);
    const hotelName = scope.hotel?.name || "Khách sạn";
    const currency = "VND";

    const { startPlain, endPlain, startDate, endDate, rangeKey } =
      this.resolveDateRange(query, timeZone);

    // Ensure our single DB query batch also covers the 12-month trend window
    const twelveMonthsStartPlain = endPlain
      .toPlainYearMonth()
      .subtract({ months: 11 })
      .toPlainDate({ day: 1 });
    const queryWindowStartPlain =
      Temporal.PlainDate.compare(startPlain, twelveMonthsStartPlain) < 0
        ? startPlain
        : twelveMonthsStartPlain;
    const queryWindowStartDate = plainDateStartUtc(queryWindowStartPlain, timeZone);

    const roomWhere: Prisma.RoomWhereInput =
      scope.allowedRoomId !== null ? { hotelId, id: scope.allowedRoomId } : { hotelId };
    const stayWhere: Prisma.GuestStayWhereInput =
      scope.allowedRoomId !== null
        ? { hotelId, roomId: scope.allowedRoomId }
        : { hotelId };
    const paymentWhere: Prisma.PaymentWhereInput =
      scope.allowedRoomId !== null
        ? { hotelId, folio: { roomId: scope.allowedRoomId } }
        : { hotelId };

    const [
      totalRooms,
      occupiedRoomsNow,
      allSucceededPayments,
      allFolioItems,
      allStaysRaw,
      staffAssignments,
      allReceivablesRaw,
      allBookingPaymentsRaw,
    ] = await Promise.all([
      this.prisma.room.count({ where: roomWhere }),
      this.prisma.room.count({ where: { ...roomWhere, status: RoomStatus.OCCUPIED } }),
      this.prisma.payment.findMany({
        where: {
          ...paymentWhere,
          status: PaymentStatus.SUCCEEDED,
          confirmedAt: { gte: queryWindowStartDate, lte: endDate },
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
          postedAt: { gte: queryWindowStartDate, lte: endDate },
          ...(scope.allowedRoomId !== null ? { roomId: scope.allowedRoomId } : {}),
        },
        select: {
          id: true,
          itemType: true,
          totalSnapshot: true,
          discountAmountSnapshot: true,
          postedAt: true,
          postedByUserId: true,
        },
      }),
      this.prisma.guestStay.findMany({
        where: {
          ...stayWhere,
          status: { not: GuestStayStatus.CANCELLED },
          OR: [
            {
              plannedCheckInAt: { lte: endDate },
              plannedCheckOutAt: { gte: queryWindowStartDate },
            },
            {
              checkedInAt: { lte: endDate },
              checkedOutAt: { gte: queryWindowStartDate },
            },
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
          room: {
            select: {
              price: true,
              roomType: { select: { basePrice: true } },
            },
          },
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
              sourceCategory: true,
              sourcePartnerId: true,
              bookingOwnerUserId: true,
              sourcePartner: { select: { id: true, name: true, category: true } },
            },
          },
        },
      }),
      this.prisma.hotelStaffAssignment.findMany({
        where: {
          hotelId,
          status: HotelStaffAssignmentStatus.ACTIVE,
        },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              userRoles: {
                where: { status: UserRoleStatus.ACTIVE },
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
      (this.prisma as any).hotelReceivable
        ? (this.prisma as any).hotelReceivable.findMany({
            where: { hotelId },
            select: {
              id: true,
              originalAmount: true,
              paidAmount: true,
              outstandingAmount: true,
              status: true,
              dueDate: true,
              debtorName: true,
              debtorType: true,
            },
          })
        : Promise.resolve([]),
      (this.prisma as any).bookingPayment
        ? (this.prisma as any).bookingPayment.findMany({
            where: {
              hotelId,
              createdAt: { gte: queryWindowStartDate, lte: endDate },
            },
            select: {
              id: true,
              intent: true,
              receivedAmount: true,
              requestedAmount: true,
              status: true,
              paymentMethod: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const allStays = (allStaysRaw as StayRecord[]).filter(
      (s) => s.status !== GuestStayStatus.CANCELLED,
    );

    // Filter down to the selected reporting period [startPlain, endPlain]
    const succeededPayments = allSucceededPayments.filter((p) => {
      if (!p.confirmedAt) return false;
      const d = dateToPlainDate(p.confirmedAt, timeZone);
      return (
        Temporal.PlainDate.compare(d, startPlain) >= 0 &&
        Temporal.PlainDate.compare(d, endPlain) <= 0
      );
    });

    const folioItems = allFolioItems.filter((item) => {
      const d = dateToPlainDate(item.postedAt, timeZone);
      return (
        Temporal.PlainDate.compare(d, startPlain) >= 0 &&
        Temporal.PlainDate.compare(d, endPlain) <= 0
      );
    });

    const stays = allStays.filter((stay) => {
      const sStart = stay.checkedInAt || stay.plannedCheckInAt;
      const sEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
      const activeDates = getStayActivePlainDates(sStart, sEnd, timeZone);
      return activeDates.some(
        (d) =>
          Temporal.PlainDate.compare(d, startPlain) >= 0 &&
          Temporal.PlainDate.compare(d, endPlain) <= 0,
      );
    });

    // 1. Calculate Folio item breakdowns
    let folioRoomRevenue = 0;
    let folioServiceRevenue = 0;
    let folioOtherRevenue = 0;
    for (const item of folioItems) {
      if (item.itemType === FolioItemType.DISCOUNT) {
        const discVal = Math.abs(
          toNumber(item.discountAmountSnapshot ?? item.totalSnapshot),
        );
        folioOtherRevenue -= discVal;
        continue;
      }
      const val = toNumber(item.totalSnapshot);
      if (item.itemType === FolioItemType.ROOM_CHARGE) {
        folioRoomRevenue += val;
      } else if (item.itemType === FolioItemType.SERVICE) {
        folioServiceRevenue += val;
      } else {
        folioOtherRevenue += val;
      }
    }

    // 2. Room Nights, Accrued Stay Room Revenue & Occupancy calculation in [startPlain, endPlain]
    const daysInRange = Math.max(
      1,
      startPlain.until(endPlain, { largestUnit: "days" }).days + 1,
    );
    const availableRoomNights = totalRooms * daysInRange;

    let totalRoomNights = 0;
    let accruedStayRoomRevenue = 0;
    for (const stay of stays) {
      const stayStart = stay.checkedInAt || stay.plannedCheckInAt;
      const stayEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
      const activeDatesInPeriod = getStayActivePlainDates(
        stayStart,
        stayEnd,
        timeZone,
      ).filter(
        (d) =>
          Temporal.PlainDate.compare(d, startPlain) >= 0 &&
          Temporal.PlainDate.compare(d, endPlain) <= 0,
      );
      const nights = activeDatesInPeriod.length;
      if (nights > 0) {
        totalRoomNights += nights;
        accruedStayRoomRevenue += resolveStayNightlyRate(stay, 0) * nights;
      }
    }

    // 3. Reconcile collected payments vs folio / stay charges without fabricated 85%/15% ratios
    const totalCollected = succeededPayments.reduce(
      (sum, p) => sum + toNumber(p.paidAmount),
      0,
    );

    const effectiveServiceRevenue = folioServiceRevenue;
    const effectiveOtherRevenue = folioOtherRevenue;
    let effectiveRoomRevenue =
      folioRoomRevenue > 0 ? folioRoomRevenue : accruedStayRoomRevenue;

    const totalBilledRevenue =
      effectiveRoomRevenue + effectiveServiceRevenue + effectiveOtherRevenue;

    let effectiveTotalRevenue =
      totalBilledRevenue > 0
        ? Math.max(totalCollected, totalBilledRevenue)
        : totalCollected;

    if (effectiveTotalRevenue > totalBilledRevenue && effectiveRoomRevenue === 0) {
      effectiveRoomRevenue = Math.max(
        0,
        effectiveTotalRevenue - effectiveServiceRevenue - effectiveOtherRevenue,
      );
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

    // RevPAR = Room Revenue / Available Room Nights
    const revpar =
      availableRoomNights > 0
        ? Math.round((effectiveRoomRevenue || effectiveTotalRevenue) / availableRoomNights)
        : 0;

    // Total guests in period
    let totalGuests = 0;
    for (const stay of stays) {
      const occupantCount = stay.occupants.length;
      totalGuests += Math.max(1, occupantCount, stay.reservation?.guestCount || 1);
    }

    // 4. Daily Revenue & Occupancy Breakdown (timezone-accurate via Temporal.PlainDate)
    const revenueByDay = this.buildDailyBreakdown(
      startPlain,
      endPlain,
      timeZone,
      totalRooms,
      succeededPayments,
      folioItems,
      stays,
    );

    // 5. Monthly Revenue Breakdown (uses full 12-month window datasets)
    const revenueByMonth = this.buildMonthlyBreakdown(
      endPlain,
      timeZone,
      totalRooms,
      allSucceededPayments,
      allFolioItems,
      allStays,
    );

    // 6. Revenue by Booking Source
    const revenueBySource = this.buildSourceBreakdown(
      stays,
      startPlain,
      endPlain,
      timeZone,
      effectiveTotalRevenue,
      adr,
    );

    // 7. Revenue by Staff Member
    const revenueByStaff = this.buildStaffBreakdown(
      succeededPayments,
      stays,
      staffAssignments,
    );

    // 8. Guest Analytics (Nationalities & Demographics)
    const guestAnalytics = this.buildGuestAnalytics(
      stays,
      startPlain,
      endPlain,
      timeZone,
    );

    // 9. Payment Methods Breakdown
    const paymentMethods = this.buildPaymentMethodsBreakdown(succeededPayments);

    // 10. Revenue by Booking Owner
    const revenueByBookingOwner = this.buildBookingOwnerBreakdown(
      stays,
      timeZone,
      startPlain,
      endPlain,
      adr,
      staffAssignments,
    );

    // 11. Receivables Summary
    const receivablesSummary = this.buildReceivablesSummary(allReceivablesRaw);

    // 12. Booking Payments / Deposits Summary
    const bookingPaymentsSummary = this.buildBookingPaymentsSummary(allBookingPaymentsRaw);

    return {
      hotelId,
      hotelName,
      currency,
      timeZone,
      range: rangeKey,
      startDate: startPlain.toString(),
      endDate: endPlain.toString(),
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
      revenueByBookingOwner,
      guestAnalytics,
      paymentMethods,
      receivablesSummary,
      bookingPaymentsSummary,
    };
  }

  private resolveDateRange(
    query: GetHotelReportsQuery,
    timeZone = DEFAULT_TIME_ZONE,
  ): {
    startPlain: Temporal.PlainDate;
    endPlain: Temporal.PlainDate;
    startDate: Date;
    endDate: Date;
    rangeKey: string;
  } {
    const today = Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate();

    if (query.from && query.to) {
      try {
        const fromPlain = Temporal.PlainDate.from(query.from);
        const toPlain = Temporal.PlainDate.from(query.to);
        if (Temporal.PlainDate.compare(fromPlain, toPlain) <= 0) {
          return {
            startPlain: fromPlain,
            endPlain: toPlain,
            startDate: plainDateStartUtc(fromPlain, timeZone),
            endDate: plainDateEndUtc(toPlain, timeZone),
            rangeKey: "custom",
          };
        }
      } catch {
        // Fallback to preset range if custom date parsing fails
      }
    }

    const range = query.range || "30d";
    let startPlain: Temporal.PlainDate;
    let endPlain: Temporal.PlainDate = today;

    switch (range) {
      case "7d": {
        startPlain = today.subtract({ days: 6 });
        break;
      }
      case "14d": {
        startPlain = today.subtract({ days: 13 });
        break;
      }
      case "90d": {
        startPlain = today.subtract({ days: 89 });
        break;
      }
      case "this_month": {
        startPlain = today.with({ day: 1 });
        break;
      }
      case "last_month": {
        const prevMonth = today.toPlainYearMonth().subtract({ months: 1 });
        startPlain = prevMonth.toPlainDate({ day: 1 });
        endPlain = prevMonth.toPlainDate({ day: prevMonth.daysInMonth });
        break;
      }
      case "this_year": {
        startPlain = today.with({ month: 1, day: 1 });
        break;
      }
      case "30d":
      default: {
        startPlain = today.subtract({ days: 29 });
        break;
      }
    }

    return {
      startPlain,
      endPlain,
      startDate: plainDateStartUtc(startPlain, timeZone),
      endDate: plainDateEndUtc(endPlain, timeZone),
      rangeKey: range,
    };
  }

  private buildDailyBreakdown(
    startPlain: Temporal.PlainDate,
    endPlain: Temporal.PlainDate,
    timeZone: string,
    totalRooms: number,
    payments: Array<{ paidAmount: Prisma.Decimal | number; confirmedAt: Date | null }>,
    folioItems: Array<{
      itemType: FolioItemType;
      totalSnapshot: Prisma.Decimal | number;
      discountAmountSnapshot?: Prisma.Decimal | number | null;
      postedAt: Date;
    }>,
    stays: StayRecord[],
  ) {
    const days: HotelReportsData["revenueByDay"] = [];

    const paymentMap = new Map<string, number>();
    for (const p of payments) {
      if (!p.confirmedAt) continue;
      const key = dateToPlainDate(p.confirmedAt, timeZone).toString();
      paymentMap.set(key, (paymentMap.get(key) || 0) + toNumber(p.paidAmount));
    }

    const roomChargeMap = new Map<string, number>();
    const serviceChargeMap = new Map<string, number>();
    const otherChargeMap = new Map<string, number>();
    for (const item of folioItems) {
      const key = dateToPlainDate(item.postedAt, timeZone).toString();
      if (item.itemType === FolioItemType.DISCOUNT) {
        const discVal = Math.abs(
          toNumber(item.discountAmountSnapshot ?? item.totalSnapshot),
        );
        otherChargeMap.set(key, (otherChargeMap.get(key) || 0) - discVal);
        continue;
      }
      const val = toNumber(item.totalSnapshot);
      if (item.itemType === FolioItemType.ROOM_CHARGE) {
        roomChargeMap.set(key, (roomChargeMap.get(key) || 0) + val);
      } else if (item.itemType === FolioItemType.SERVICE) {
        serviceChargeMap.set(key, (serviceChargeMap.get(key) || 0) + val);
      } else {
        otherChargeMap.set(key, (otherChargeMap.get(key) || 0) + val);
      }
    }

    // Pre-index active stays per PlainDate key (YYYY-MM-DD in hotel timezone)
    const stayOccupancyMap = new Map<
      string,
      { roomsOccupied: number; accruedRoomRevenue: number }
    >();
    for (const stay of stays) {
      const sStart = stay.checkedInAt || stay.plannedCheckInAt;
      const sEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
      const nightlyRate = resolveStayNightlyRate(stay, 0);
      const activeDates = getStayActivePlainDates(sStart, sEnd, timeZone);
      for (const d of activeDates) {
        if (
          Temporal.PlainDate.compare(d, startPlain) < 0 ||
          Temporal.PlainDate.compare(d, endPlain) > 0
        ) {
          continue;
        }
        const key = d.toString();
        const curr = stayOccupancyMap.get(key) || {
          roomsOccupied: 0,
          accruedRoomRevenue: 0,
        };
        curr.roomsOccupied += 1;
        curr.accruedRoomRevenue += nightlyRate;
        stayOccupancyMap.set(key, curr);
      }
    }

    let cursor = startPlain;
    let safety = 0;
    while (Temporal.PlainDate.compare(cursor, endPlain) <= 0 && safety < 730) {
      const dateKey = cursor.toString();
      const dayLabel = `${cursor.day}/${cursor.month}`;

      const stayStat = stayOccupancyMap.get(dateKey);
      const roomsOccupied = stayStat?.roomsOccupied || 0;
      const accruedRoomRevenue = stayStat?.accruedRoomRevenue || 0;

      const dayTotalPaid = paymentMap.get(dateKey) || 0;
      const dayRoomCharge = roomChargeMap.get(dateKey) || 0;
      const dayServiceCharge = serviceChargeMap.get(dateKey) || 0;
      const dayOtherCharge = otherChargeMap.get(dateKey) || 0;

      const roomRevenue =
        dayRoomCharge > 0 ? dayRoomCharge : accruedRoomRevenue;
      const serviceRevenue = dayServiceCharge;
      const billedTotal = Math.max(
        0,
        roomRevenue + serviceRevenue + dayOtherCharge,
      );
      const totalRevenue =
        billedTotal > 0 ? Math.max(billedTotal, dayTotalPaid) : dayTotalPaid;

      const occ =
        totalRooms > 0
          ? Math.min(100, Math.round((roomsOccupied / totalRooms) * 1000) / 10)
          : 0;
      const adr =
        roomsOccupied > 0
          ? Math.round((roomRevenue || totalRevenue) / roomsOccupied)
          : 0;

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

      cursor = cursor.add({ days: 1 });
      safety++;
    }

    return days;
  }

  private buildMonthlyBreakdown(
    endPlain: Temporal.PlainDate,
    timeZone: string,
    totalRooms: number,
    payments: Array<{ paidAmount: Prisma.Decimal | number; confirmedAt: Date | null }>,
    folioItems: Array<{
      itemType: FolioItemType;
      totalSnapshot: Prisma.Decimal | number;
      discountAmountSnapshot?: Prisma.Decimal | number | null;
      postedAt: Date;
    }>,
    stays: StayRecord[],
  ) {
    const months: HotelReportsData["revenueByMonth"] = [];
    const endYearMonth = endPlain.toPlainYearMonth();

    for (let i = 11; i >= 0; i--) {
      const ym = endYearMonth.subtract({ months: i });
      const monthKey = ym.toString(); // YYYY-MM
      const monthLabel = `Thg ${ym.month}/${ym.year}`;
      const monthStartPlain = ym.toPlainDate({ day: 1 });
      const monthEndPlain = ym.toPlainDate({ day: ym.daysInMonth });
      const daysInMonth = ym.daysInMonth;

      let monthPaid = 0;
      for (const p of payments) {
        if (!p.confirmedAt) continue;
        const pPlain = dateToPlainDate(p.confirmedAt, timeZone);
        if (
          Temporal.PlainDate.compare(pPlain, monthStartPlain) >= 0 &&
          Temporal.PlainDate.compare(pPlain, monthEndPlain) <= 0
        ) {
          monthPaid += toNumber(p.paidAmount);
        }
      }

      let monthFolioRoom = 0;
      let monthFolioService = 0;
      let monthFolioOther = 0;
      for (const item of folioItems) {
        const iPlain = dateToPlainDate(item.postedAt, timeZone);
        if (
          Temporal.PlainDate.compare(iPlain, monthStartPlain) >= 0 &&
          Temporal.PlainDate.compare(iPlain, monthEndPlain) <= 0
        ) {
          if (item.itemType === FolioItemType.DISCOUNT) {
            const disc = Math.abs(
              toNumber(item.discountAmountSnapshot ?? item.totalSnapshot),
            );
            monthFolioOther -= disc;
            continue;
          }
          const val = toNumber(item.totalSnapshot);
          if (item.itemType === FolioItemType.ROOM_CHARGE) {
            monthFolioRoom += val;
          } else if (item.itemType === FolioItemType.SERVICE) {
            monthFolioService += val;
          } else {
            monthFolioOther += val;
          }
        }
      }

      let bookingCount = 0;
      let roomsSold = 0;
      let accruedMonthRoomRevenue = 0;
      for (const stay of stays) {
        const sStart = stay.checkedInAt || stay.plannedCheckInAt;
        const sEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
        const activeInMonth = getStayActivePlainDates(sStart, sEnd, timeZone).filter(
          (d) =>
            Temporal.PlainDate.compare(d, monthStartPlain) >= 0 &&
            Temporal.PlainDate.compare(d, monthEndPlain) <= 0,
        );
        if (activeInMonth.length > 0) {
          bookingCount++;
          roomsSold += activeInMonth.length;
          accruedMonthRoomRevenue +=
            resolveStayNightlyRate(stay, 0) * activeInMonth.length;
        }
      }

      const monthRoomRevenue =
        monthFolioRoom > 0 ? monthFolioRoom : accruedMonthRoomRevenue;
      const monthServiceRevenue = monthFolioService;
      const monthBilled = Math.max(
        0,
        monthRoomRevenue + monthServiceRevenue + monthFolioOther,
      );
      const monthRevenue =
        monthBilled > 0 ? Math.max(monthBilled, monthPaid) : monthPaid;

      const availableNights = totalRooms * daysInMonth;
      const averageOccupancy =
        availableNights > 0
          ? Math.min(100, Math.round((roomsSold / availableNights) * 1000) / 10)
          : 0;
      const adr =
        roomsSold > 0
          ? Math.round((monthRoomRevenue || monthRevenue) / roomsSold)
          : 0;

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
    stays: StayRecord[],
    startPlain: Temporal.PlainDate,
    endPlain: Temporal.PlainDate,
    timeZone: string,
    totalRevenue: number,
    baseAdr: number,
  ) {
    const sourcesMap = new Map<
      string,
      {
        sourceKey: string;
        sourceName: string;
        sourceType: "OTA" | "DIRECT" | "WALK_IN" | "TA" | "CORPORATE" | "OTHER";
        bookingCount: number;
        guestCount: number;
        roomNights: number;
        revenue: number;
      }
    >();

    const getOrCreate = (
      key: string,
      name: string,
      type: "OTA" | "DIRECT" | "WALK_IN" | "TA" | "CORPORATE" | "OTHER",
    ) => {
      let entry = sourcesMap.get(key);
      if (!entry) {
        entry = {
          sourceKey: key,
          sourceName: name,
          sourceType: type,
          bookingCount: 0,
          guestCount: 0,
          roomNights: 0,
          revenue: 0,
        };
        sourcesMap.set(key, entry);
      }
      return entry;
    };

    for (const stay of stays) {
      const code = (stay.reservationCode || "").toUpperCase();
      const group = (stay.reservation?.groupCode || "").toUpperCase();
      const rate = resolveStayNightlyRate(stay, baseAdr);
      const guests = Math.max(
        1,
        stay.occupants.length,
        stay.reservation?.guestCount || 1,
      );

      const sStart = stay.checkedInAt || stay.plannedCheckInAt;
      const sEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
      const activeNights = Math.max(
        1,
        getStayActivePlainDates(sStart, sEnd, timeZone).filter(
          (d) =>
            Temporal.PlainDate.compare(d, startPlain) >= 0 &&
            Temporal.PlainDate.compare(d, endPlain) <= 0,
        ).length,
      );

      let target;
      if (stay.reservation?.sourceCategory) {
        const cat = String(stay.reservation.sourceCategory);
        const partnerName = (stay.reservation as any).sourcePartner?.name;
        if (cat === "OTA") {
          target = getOrCreate(
            partnerName ? `OTA_${partnerName.toUpperCase().replace(/\s+/g, "_")}` : "OTA_OTHER",
            partnerName || "Kênh OTA",
            "OTA",
          );
        } else if (cat === "TA" || cat === "TRAVEL_AGENCY") {
          target = getOrCreate(
            partnerName ? `TA_${partnerName.toUpperCase().replace(/\s+/g, "_")}` : "TA_OTHER",
            partnerName ? `Đại lý du lịch - ${partnerName}` : "Đại lý du lịch (TA)",
            "TA",
          );
        } else if (cat === "CORPORATE") {
          target = getOrCreate(
            partnerName ? `CORP_${partnerName.toUpperCase().replace(/\s+/g, "_")}` : "CORPORATE_OTHER",
            partnerName ? `Doanh nghiệp - ${partnerName}` : "Khách hàng doanh nghiệp",
            "CORPORATE",
          );
        } else if (cat === "DIRECT") {
          target = getOrCreate("DIRECT", "Đặt phòng trực tiếp (Direct)", "DIRECT");
        } else {
          target = getOrCreate("OTHER", "Nguồn khác", "OTHER");
        }
      } else if (code.includes("BOOKING") || code.includes("BDC") || group.includes("BOOKING")) {
        target = getOrCreate("OTA_BOOKING", "Booking.com", "OTA");
      } else if (code.includes("AGODA") || group.includes("AGODA")) {
        target = getOrCreate("OTA_AGODA", "Agoda", "OTA");
      } else if (code.includes("AIRBNB") || group.includes("AIRBNB")) {
        target = getOrCreate("OTA_AIRBNB", "Airbnb", "OTA");
      } else if (code.startsWith("OTA-") || group.startsWith("CHANNEX:")) {
        target = getOrCreate("OTA_OTHER", "Kênh OTA khác", "OTA");
      } else if (code.startsWith("VSH_") || stay.reservation) {
        target = getOrCreate(
          "DIRECT",
          "Đặt phòng trực tiếp (Website / Hotline)",
          "DIRECT",
        );
      } else {
        target = getOrCreate("WALK_IN", "Khách vãng lai tại quầy", "WALK_IN");
      }

      target.bookingCount += 1;
      target.guestCount += guests;
      target.roomNights += activeNights;
      target.revenue += rate * activeNights;
    }

    if (sourcesMap.size === 0) {
      sourcesMap.set("DIRECT", {
        sourceKey: "DIRECT",
        sourceName: "Đặt phòng trực tiếp",
        sourceType: "DIRECT",
        bookingCount: 0,
        guestCount: 0,
        roomNights: 0,
        revenue: 0,
      });
    }

    const list = Array.from(sourcesMap.values());
    const rawSum = list.reduce((sum, item) => sum + item.revenue, 0);

    return list
      .map((item) => {
        const share =
          rawSum > 0 ? Math.round((item.revenue / rawSum) * 1000) / 10 : 0;
        const normalizedRevenue =
          totalRevenue > 0 && rawSum > 0
            ? Math.round((item.revenue / rawSum) * totalRevenue)
            : item.revenue;
        const adr =
          item.roomNights > 0
            ? Math.round(normalizedRevenue / item.roomNights)
            : item.bookingCount > 0
              ? Math.round(normalizedRevenue / item.bookingCount)
              : baseAdr;

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
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  private buildBookingOwnerBreakdown(
    stays: any[],
    timeZone: string,
    startPlain: Temporal.PlainDate,
    endPlain: Temporal.PlainDate,
    baseAdr: number,
    staffAssignments: any[] = [],
  ) {
    const ownerMap = new Map<
      string,
      {
        ownerUserId: string;
        ownerName: string;
        bookingCount: number;
        roomNights: number;
        revenue: number;
      }
    >();

    for (const stay of stays) {
      const ownerId = stay.reservation?.bookingOwnerUserId || "UNASSIGNED";
      const assigned = staffAssignments.find(
        (s) => s.userId === ownerId || s.user?.id === ownerId,
      );
      const ownerName =
        ownerId === "UNASSIGNED"
          ? "Chưa phân công"
          : assigned?.user?.fullName || `Nhân viên #${ownerId.slice(-6)}`;

      let entry = ownerMap.get(ownerId);
      if (!entry) {
        entry = {
          ownerUserId: ownerId,
          ownerName,
          bookingCount: 0,
          roomNights: 0,
          revenue: 0,
        };
        ownerMap.set(ownerId, entry);
      }

      const rate = resolveStayNightlyRate(stay, baseAdr);
      const sStart = stay.checkedInAt || stay.plannedCheckInAt;
      const sEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
      const activeNights = Math.max(
        1,
        getStayActivePlainDates(sStart, sEnd, timeZone).filter(
          (d) =>
            Temporal.PlainDate.compare(d, startPlain) >= 0 &&
            Temporal.PlainDate.compare(d, endPlain) <= 0,
        ).length,
      );

      entry.bookingCount += 1;
      entry.roomNights += activeNights;
      entry.revenue += rate * activeNights;
    }

    return Array.from(ownerMap.values()).sort((a, b) => b.revenue - a.revenue);
  }

  private buildReceivablesSummary(receivables: any[]) {
    let totalOriginal = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let openCount = 0;
    let overdueCount = 0;
    const now = new Date();

    for (const r of receivables) {
      const orig = toNumber(r.originalAmount);
      const paid = toNumber(r.paidAmount);
      const out = toNumber(r.outstandingAmount);
      totalOriginal += orig;
      totalPaid += paid;
      totalOutstanding += out;
      if (
        r.status === "OPEN" ||
        r.status === "PARTIAL" ||
        r.status === "PARTIALLY_COLLECTED"
      ) {
        openCount++;
        if (r.dueDate && new Date(r.dueDate) < now) {
          overdueCount++;
        }
      }
    }

    return {
      totalOriginal,
      totalPaid,
      totalOutstanding,
      openCount,
      overdueCount,
      count: receivables.length,
    };
  }

  private buildBookingPaymentsSummary(payments: any[]) {
    let totalRequested = 0;
    let totalReceived = 0;
    let depositCount = 0;

    for (const p of payments) {
      totalRequested += toNumber(p.requestedAmount ?? p.amountRequested);
      totalReceived += toNumber(p.receivedAmount ?? p.amountReceived);
      depositCount++;
    }

    return {
      totalRequested,
      totalReceived,
      depositCount,
    };
  }

  private buildStaffBreakdown(
    payments: Array<{
      paidAmount: Prisma.Decimal | number;
      method: PaymentMethod;
      createdByUserId: string | null;
      createdBy: { id: string; fullName: string | null; email: string } | null;
    }>,
    stays: Array<{
      id?: string;
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

    // Seed from active assigned staff
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
          staffName:
            p.createdBy?.fullName || p.createdBy?.email || "Thu ngân lễ tân",
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
      const actorIds = new Set<string>();
      if (s.createdByUserId) actorIds.add(s.createdByUserId);
      if (s.closedByUserId) actorIds.add(s.closedByUserId);
      for (const uid of actorIds) {
        if (staffMap.has(uid)) {
          staffMap.get(uid)!.staysHandled += 1;
        }
      }
    }

    return Array.from(staffMap.values()).sort(
      (a, b) => b.collectedAmount - a.collectedAmount || b.staysHandled - a.staysHandled,
    );
  }

  private buildGuestAnalytics(
    stays: StayRecord[],
    startPlain: Temporal.PlainDate,
    endPlain: Temporal.PlainDate,
    timeZone: string,
  ) {
    const nationStatMap = new Map<
      string,
      { guestCount: number; totalRoomNights: number }
    >();
    let maleCount = 0;
    let femaleCount = 0;
    let otherGender = 0;
    let unspecifiedGender = 0;
    let totalGuests = 0;

    for (const stay of stays) {
      const sStart = stay.checkedInAt || stay.plannedCheckInAt;
      const sEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
      const stayNights = Math.max(
        1,
        getStayActivePlainDates(sStart, sEnd, timeZone).filter(
          (d) =>
            Temporal.PlainDate.compare(d, startPlain) >= 0 &&
            Temporal.PlainDate.compare(d, endPlain) <= 0,
        ).length,
      );

      const occupants =
        stay.occupants.length > 0
          ? stay.occupants
          : [{ nationality: stay.guestNationality, gender: stay.guestGender }];
      for (const occ of occupants) {
        totalGuests++;
        const nation = normalizeNationality(occ.nationality);
        const currentStat = nationStatMap.get(nation) || {
          guestCount: 0,
          totalRoomNights: 0,
        };
        currentStat.guestCount += 1;
        currentStat.totalRoomNights += stayNights;
        nationStatMap.set(nation, currentStat);

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

    const safeTotalGuests = Math.max(1, totalGuests);

    const nationalities: HotelReportsData["guestAnalytics"]["nationalities"] = [];
    let domesticCount = 0;
    let internationalCount = 0;

    for (const [nation, stat] of nationStatMap.entries()) {
      if (nation === "Việt Nam") {
        domesticCount += stat.guestCount;
      } else {
        internationalCount += stat.guestCount;
      }

      const pct = Math.round((stat.guestCount / safeTotalGuests) * 1000) / 10;
      const avgStay =
        stat.guestCount > 0
          ? Math.max(1, Math.round((stat.totalRoomNights / stat.guestCount) * 10) / 10)
          : 1;

      nationalities.push({
        nationality: nation,
        guestCount: stat.guestCount,
        percentage: pct,
        totalRoomNights: stat.totalRoomNights,
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
        domesticPercentage:
          totalGuests > 0
            ? Math.round((domesticCount / safeTotalGuests) * 1000) / 10
            : 0,
        internationalPercentage:
          totalGuests > 0
            ? Math.round((internationalCount / safeTotalGuests) * 1000) / 10
            : 0,
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
