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
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from "../domain/schemas/hotel-expense.schema";

import {
  resolveTimeZone,
  VIETNAM_TIME_ZONE,
} from "../../../common/time/vietnam-temporal";

const DEFAULT_TIME_ZONE = VIETNAM_TIME_ZONE;
const normalizeTimeZone = resolveTimeZone;

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
    manualRevenue: number;
    collectedRevenue: number;
    uncollectedRevenue: number;
    operatingExpense: number;
    paidOperatingExpense: number;
    unpaidOperatingExpense: number;
    saasFeeExpense: number;
    totalExpense: number;
    netProfit: number;
    profitMargin: number;
    expenseRatio: number;
    netCashFlow: number;
    adr: number;
    revpar: number;
  };
  revenueByDay: Array<{
    date: string;
    dayLabel: string;
    totalRevenue: number;
    roomRevenue: number;
    serviceRevenue: number;
    manualRevenue: number;
    collectedRevenue: number;
    expense: number;
    paidExpense: number;
    netProfit: number;
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
    manualRevenue: number;
    collectedRevenue: number;
    expense: number;
    paidExpense: number;
    netProfit: number;
    bookingCount: number;
    roomsSold: number;
    averageOccupancy: number;
    adr: number;
  }>;
  expenseByCategory: Array<{
    category: ExpenseCategory | "SAAS_FEE";
    categoryLabel: string;
    amount: number;
    paidAmount: number;
    unpaidAmount: number;
    count: number;
    sharePercent: number;
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
  status: string;
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

    const { startPlain, endPlain, startDate, endDate, rangeKey } = this.resolveDateRange(
      query,
      timeZone,
    );

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
      scope.allowedRoomId !== null ? { hotelId, roomId: scope.allowedRoomId } : { hotelId };
    const paymentWhere: Prisma.PaymentWhereInput =
      scope.allowedRoomId !== null
        ? { hotelId, folio: { roomId: scope.allowedRoomId } }
        : { hotelId };

    const queryWindowDateOnlyStart = new Date(`${queryWindowStartPlain.toString()}T00:00:00.000Z`);
    const endDateOnly = new Date(`${endPlain.toString()}T00:00:00.000Z`);

    const optionalQuery = <T>(fn: (() => Promise<T[]>) | null | undefined): Promise<T[]> =>
      fn ? fn() : Promise.resolve([]);

    const [
      totalRooms,
      occupiedRoomsNow,
      allSucceededPayments,
      allFolioItems,
      allStaysRaw,
      staffAssignments,
      allReceivablesRaw,
      allBookingPaymentsRaw,
      allManualRevenueRaw,
      allExpensesRaw,
      allSaasBillableDaysRaw,
      allReceivableCollectionsRaw,
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
            where: {
              hotelId,
              createdAt: { lte: endDate },
              OR: [
                { createdAt: { gte: startDate, lte: endDate } },
                { transferredAt: { gte: startDate, lte: endDate } },
                { status: { in: ["OPEN", "PARTIALLY_COLLECTED"] } },
                {
                  collections: {
                    some: {
                      isVoided: false,
                      collectedAt: { gte: startDate, lte: endDate },
                    },
                  },
                },
              ],
            },
            select: {
              id: true,
              originalAmount: true,
              paidAmount: true,
              outstandingAmount: true,
              status: true,
              dueDate: true,
              debtorName: true,
              debtorType: true,
              collections: {
                where: {
                  isVoided: false,
                  collectedAt: { gte: startDate, lte: endDate },
                },
                select: {
                  id: true,
                  collectedAmount: true,
                  collectedAt: true,
                  paymentMethod: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      (this.prisma as any).bookingPayment
        ? (this.prisma as any).bookingPayment.findMany({
            where: {
              hotelId,
              ...(scope.allowedRoomId !== null
                ? { reservation: { roomId: scope.allowedRoomId } }
                : {}),
              OR: [
                { receivedAt: { gte: queryWindowStartDate, lte: endDate } },
                { createdAt: { gte: queryWindowStartDate, lte: endDate } },
              ],
            },
            select: {
              id: true,
              intent: true,
              receivedAmount: true,
              requestedAmount: true,
              status: true,
              paymentMethod: true,
              receivedAt: true,
              createdAt: true,
              allocations: {
                select: {
                  id: true,
                  folioId: true,
                  invoiceId: true,
                  allocatedAmount: true,
                  allocatedAt: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      optionalQuery<{
        id: string;
        date: Date;
        category: string;
        amount: Prisma.Decimal | number;
        collections: Array<{ amount: Prisma.Decimal | number; receivedAt: Date }>;
      }>(
        (this.prisma as any).hotelRevenueEntry
          ? () =>
              (this.prisma as any).hotelRevenueEntry.findMany({
                where: {
                  hotelId,
                  voidedAt: null,
                  OR: [
                    { date: { gte: queryWindowDateOnlyStart, lte: endDateOnly } },
                    {
                      collections: {
                        some: { receivedAt: { gte: queryWindowStartDate, lte: endDate } },
                      },
                    },
                  ],
                  ...(scope.allowedRoomId !== null ? { roomId: scope.allowedRoomId } : {}),
                },
                select: {
                  id: true,
                  date: true,
                  category: true,
                  amount: true,
                  collections: {
                    where: { receivedAt: { gte: queryWindowStartDate, lte: endDate } },
                    select: { amount: true, receivedAt: true },
                  },
                },
              })
          : null,
      ),
      optionalQuery<{
        id: string;
        expenseDate: Date;
        category: string;
        amount: Prisma.Decimal | number;
        paidAmount: Prisma.Decimal | number;
        paymentStatus: string;
      }>(
        (this.prisma as any).hotelExpense
          ? () =>
              (this.prisma as any).hotelExpense.findMany({
                where: {
                  hotelId,
                  voidedAt: null,
                  expenseDate: { gte: queryWindowDateOnlyStart, lte: endDateOnly },
                  ...(scope.allowedRoomId !== null ? { roomId: scope.allowedRoomId } : {}),
                },
                select: {
                  id: true,
                  expenseDate: true,
                  category: true,
                  amount: true,
                  paidAmount: true,
                  paymentStatus: true,
                },
              })
          : null,
      ),
      optionalQuery<{ serviceDate: Date; amount: Prisma.Decimal | number }>(
        scope.allowedRoomId === null && (this.prisma as any).platformBillableDay
          ? () =>
              (this.prisma as any).platformBillableDay.findMany({
                where: {
                  hotelId,
                  serviceDate: { gte: queryWindowDateOnlyStart, lte: endDateOnly },
                },
                select: { serviceDate: true, amount: true },
              })
          : null,
      ),
      optionalQuery<{ collectedAmount: Prisma.Decimal | number; collectedAt: Date }>(
        scope.allowedRoomId === null && (this.prisma as any).receivableCollection
          ? () =>
              (this.prisma as any).receivableCollection.findMany({
                where: {
                  hotelId,
                  isVoided: false,
                  collectedAt: { gte: queryWindowStartDate, lte: endDate },
                },
                select: { collectedAmount: true, collectedAt: true },
              })
          : null,
      ),
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
        const discVal = Math.abs(toNumber(item.discountAmountSnapshot ?? item.totalSnapshot));
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
    const daysInRange = Math.max(1, startPlain.until(endPlain, { largestUnit: "days" }).days + 1);
    const availableRoomNights = totalRooms * daysInRange;

    let totalRoomNights = 0;
    let accruedStayRoomRevenue = 0;
    for (const stay of stays) {
      const stayStart = stay.checkedInAt || stay.plannedCheckInAt;
      const stayEnd = stay.checkedOutAt || stay.plannedCheckOutAt;
      const activeDatesInPeriod = getStayActivePlainDates(stayStart, stayEnd, timeZone).filter(
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
    const totalCollected = succeededPayments.reduce((sum, p) => sum + toNumber(p.paidAmount), 0);

    const unallocatedDeposits: Array<{
      id: string;
      paidAmount: number;
      method: PaymentMethod;
      confirmedAt: Date;
    }> = [];

    for (const bp of allBookingPaymentsRaw) {
      if (bp.status === "CANCELLED" || bp.status === "FAILED") continue;
      const rec = toNumber(bp.receivedAmount ?? bp.amountReceived ?? 0);
      if (rec <= 0) continue;
      const allocated = (bp.allocations ?? [])
        .filter((a: any) => a.folioId != null || a.invoiceId != null)
        .reduce((sum: number, a: any) => sum + toNumber(a.allocatedAmount), 0);
      const unallocated = Math.max(0, rec - allocated);
      if (unallocated > 0) {
        unallocatedDeposits.push({
          id: bp.id,
          paidAmount: unallocated,
          method: (bp.paymentMethod as PaymentMethod) || PaymentMethod.CASH,
          confirmedAt: bp.receivedAt ?? bp.createdAt,
        });
      }
    }

    const unallocatedDepositsInPeriod = unallocatedDeposits.filter((d) => {
      const dt = dateToPlainDate(d.confirmedAt, timeZone);
      return (
        Temporal.PlainDate.compare(dt, startPlain) >= 0 &&
        Temporal.PlainDate.compare(dt, endPlain) <= 0
      );
    });
    const depositCollected = unallocatedDepositsInPeriod.reduce((sum, d) => sum + d.paidAmount, 0);

    const startYmd = startPlain.toString();
    const endYmd = endPlain.toString();
    const dateOnlyYmd = (value: Date) => value.toISOString().slice(0, 10);

    const manualEntriesInPeriod = allManualRevenueRaw.filter((entry) => {
      const ymd = dateOnlyYmd(entry.date);
      return ymd >= startYmd && ymd <= endYmd;
    });
    const manualRevenue = manualEntriesInPeriod.reduce((sum, e) => sum + toNumber(e.amount), 0);

    let manualCollected = 0;
    for (const entry of allManualRevenueRaw) {
      for (const col of entry.collections ?? []) {
        const d = dateToPlainDate(col.receivedAt, timeZone);
        if (
          Temporal.PlainDate.compare(d, startPlain) >= 0 &&
          Temporal.PlainDate.compare(d, endPlain) <= 0
        ) {
          manualCollected += toNumber(col.amount);
        }
      }
    }

    const receivableCollected = allReceivableCollectionsRaw
      .filter((col) => {
        const d = dateToPlainDate(col.collectedAt, timeZone);
        return (
          Temporal.PlainDate.compare(d, startPlain) >= 0 &&
          Temporal.PlainDate.compare(d, endPlain) <= 0
        );
      })
      .reduce((sum, col) => sum + toNumber(col.collectedAmount), 0);

    const collectedRevenue = totalCollected + depositCollected + receivableCollected + manualCollected;

    const effectiveServiceRevenue = folioServiceRevenue;
    const effectiveOtherRevenue = folioOtherRevenue;
    const effectiveRoomRevenue = folioRoomRevenue > 0 ? folioRoomRevenue : accruedStayRoomRevenue;

    // Cash receipts, including deposits, do not recognize additional earned revenue.
    const pmsTotalRevenue =
      effectiveRoomRevenue + effectiveServiceRevenue + effectiveOtherRevenue;

    const effectiveTotalRevenue = pmsTotalRevenue + manualRevenue;
    const uncollectedRevenue = Math.max(0, effectiveTotalRevenue - collectedRevenue);

    const expensesInPeriod = allExpensesRaw.filter((exp) => {
      const ymd = dateOnlyYmd(exp.expenseDate);
      return ymd >= startYmd && ymd <= endYmd;
    });
    let operatingExpense = 0;
    let paidOperatingExpense = 0;
    for (const exp of expensesInPeriod) {
      const amt = toNumber(exp.amount);
      const paid = Math.min(amt, Math.max(0, toNumber(exp.paidAmount)));
      operatingExpense += amt;
      paidOperatingExpense += paid;
    }
    const unpaidOperatingExpense = Math.max(0, operatingExpense - paidOperatingExpense);

    const saasDaysInPeriod = allSaasBillableDaysRaw.filter((day) => {
      const ymd = dateOnlyYmd(day.serviceDate);
      return ymd >= startYmd && ymd <= endYmd;
    });
    const saasFeeExpense = saasDaysInPeriod.reduce((sum, day) => sum + toNumber(day.amount), 0);
    const totalExpense = operatingExpense + saasFeeExpense;
    const netProfit = effectiveTotalRevenue - totalExpense;
    const profitMargin =
      effectiveTotalRevenue > 0
        ? Math.round((netProfit / effectiveTotalRevenue) * 1000) / 10
        : totalExpense > 0
          ? -100
          : 0;
    const expenseRatio =
      effectiveTotalRevenue > 0
        ? Math.round((totalExpense / effectiveTotalRevenue) * 1000) / 10
        : totalExpense > 0
          ? 100
          : 0;
    const netCashFlow = collectedRevenue - paidOperatingExpense;

    const occupancyRate =
      availableRoomNights > 0
        ? Math.min(100, Math.round((totalRoomNights / availableRoomNights) * 1000) / 10)
        : 0;

    const currentOccupancyRate =
      totalRooms > 0 ? Math.min(100, Math.round((occupiedRoomsNow / totalRooms) * 1000) / 10) : 0;

    // ADR = Room Revenue / Total Room Nights
    const adr =
      totalRoomNights > 0
        ? Math.round((effectiveRoomRevenue || pmsTotalRevenue) / totalRoomNights)
        : 0;

    // RevPAR = Room Revenue / Available Room Nights
    const revpar =
      availableRoomNights > 0
        ? Math.round((effectiveRoomRevenue || pmsTotalRevenue) / availableRoomNights)
        : 0;

    // Total guests in period
    let totalGuests = 0;
    for (const stay of stays) {
      const occupantCount = stay.occupants.length;
      totalGuests += Math.max(1, occupantCount, stay.reservation?.guestCount || 1);
    }

    // 4. Daily Revenue & Occupancy Breakdown (timezone-accurate via Temporal.PlainDate)
    const combinedDailyPayments = [...succeededPayments, ...unallocatedDepositsInPeriod];
    const revenueByDay = this.buildDailyBreakdown(
      startPlain,
      endPlain,
      timeZone,
      totalRooms,
      combinedDailyPayments,
      folioItems,
      stays,
      allManualRevenueRaw,
      allExpensesRaw,
      allSaasBillableDaysRaw,
      allReceivableCollectionsRaw,
    );

    // 5. Monthly Revenue Breakdown (uses full 12-month window datasets)
    const combinedMonthlyPayments = [...allSucceededPayments, ...unallocatedDeposits];
    const revenueByMonth = this.buildMonthlyBreakdown(
      endPlain,
      timeZone,
      totalRooms,
      combinedMonthlyPayments,
      allFolioItems,
      allStays,
      allManualRevenueRaw,
      allExpensesRaw,
      allSaasBillableDaysRaw,
      allReceivableCollectionsRaw,
    );

    // 6. Expense Category Breakdown (including VietSage SaaS fee)
    const expenseByCategory = this.buildExpenseBreakdown(
      expensesInPeriod,
      saasFeeExpense,
      saasDaysInPeriod.length,
      totalExpense,
    );

    // 7. Revenue by Booking Source
    const revenueBySource = this.buildSourceBreakdown(
      stays,
      startPlain,
      endPlain,
      timeZone,
      pmsTotalRevenue,
      adr,
    );

    // 8. Revenue by Staff Member
    const revenueByStaff = this.buildStaffBreakdown(succeededPayments, stays, staffAssignments);

    // 9. Guest Analytics (Nationalities & Demographics)
    const guestAnalytics = this.buildGuestAnalytics(stays, startPlain, endPlain, timeZone);

    // 10. Payment Methods Breakdown
    const paymentMethods = this.buildPaymentMethodsBreakdown(combinedDailyPayments);

    // 11. Revenue by Booking Owner
    const revenueByBookingOwner = this.buildBookingOwnerBreakdown(
      stays,
      timeZone,
      startPlain,
      endPlain,
      adr,
      staffAssignments,
    );

    // 12. Receivables Summary
    const receivablesSummary = this.buildReceivablesSummary(allReceivablesRaw);

    // 13. Booking Payments / Deposits Summary
    const bookingPaymentsSummary = this.buildBookingPaymentsSummary(
      allBookingPaymentsRaw.filter((payment) => {
        const date = dateToPlainDate(payment.receivedAt ?? payment.createdAt, timeZone);
        return (
          Temporal.PlainDate.compare(date, startPlain) >= 0 &&
          Temporal.PlainDate.compare(date, endPlain) <= 0
        );
      }),
    );

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
        manualRevenue,
        collectedRevenue,
        uncollectedRevenue,
        operatingExpense,
        paidOperatingExpense,
        unpaidOperatingExpense,
        saasFeeExpense,
        totalExpense,
        netProfit,
        profitMargin,
        expenseRatio,
        netCashFlow,
        adr,
        revpar,
      },
      revenueByDay,
      revenueByMonth,
      expenseByCategory,
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
    manualEntries: Array<{
      date: Date;
      amount: Prisma.Decimal | number;
      collections?: Array<{ amount: Prisma.Decimal | number; receivedAt: Date }>;
    }> = [],
    expenses: Array<{
      expenseDate: Date;
      amount: Prisma.Decimal | number;
      paidAmount: Prisma.Decimal | number;
    }> = [],
    saasDays: Array<{ serviceDate: Date; amount: Prisma.Decimal | number }> = [],
    receivableCollections: Array<{ collectedAmount: Prisma.Decimal | number; collectedAt: Date }> = [],
  ) {
    const days: HotelReportsData["revenueByDay"] = [];

    const paymentMap = new Map<string, number>();
    for (const p of payments) {
      if (!p.confirmedAt) continue;
      const key = dateToPlainDate(p.confirmedAt, timeZone).toString();
      paymentMap.set(key, (paymentMap.get(key) || 0) + toNumber(p.paidAmount));
    }

    const manualRevMap = new Map<string, number>();
    const manualColMap = new Map<string, number>();
    for (const entry of manualEntries) {
      const key = entry.date.toISOString().slice(0, 10);
      manualRevMap.set(key, (manualRevMap.get(key) || 0) + toNumber(entry.amount));
      for (const col of entry.collections ?? []) {
        const cKey = dateToPlainDate(col.receivedAt, timeZone).toString();
        manualColMap.set(cKey, (manualColMap.get(cKey) || 0) + toNumber(col.amount));
      }
    }

    const receivableColMap = new Map<string, number>();
    for (const col of receivableCollections) {
      const cKey = dateToPlainDate(col.collectedAt, timeZone).toString();
      receivableColMap.set(cKey, (receivableColMap.get(cKey) || 0) + toNumber(col.collectedAmount));
    }

    const expenseMap = new Map<string, number>();
    const paidExpenseMap = new Map<string, number>();
    for (const exp of expenses) {
      const key = exp.expenseDate.toISOString().slice(0, 10);
      const amt = toNumber(exp.amount);
      const paid = Math.min(amt, Math.max(0, toNumber(exp.paidAmount)));
      expenseMap.set(key, (expenseMap.get(key) || 0) + amt);
      paidExpenseMap.set(key, (paidExpenseMap.get(key) || 0) + paid);
    }

    const saasMap = new Map<string, number>();
    for (const day of saasDays) {
      const key = day.serviceDate.toISOString().slice(0, 10);
      saasMap.set(key, (saasMap.get(key) || 0) + toNumber(day.amount));
    }

    const roomChargeMap = new Map<string, number>();
    const serviceChargeMap = new Map<string, number>();
    const otherChargeMap = new Map<string, number>();
    for (const item of folioItems) {
      const key = dateToPlainDate(item.postedAt, timeZone).toString();
      if (item.itemType === FolioItemType.DISCOUNT) {
        const discVal = Math.abs(toNumber(item.discountAmountSnapshot ?? item.totalSnapshot));
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
      const dayManualRevenue = manualRevMap.get(dateKey) || 0;

      const roomRevenue = dayRoomCharge > 0 ? dayRoomCharge : accruedRoomRevenue;
      const serviceRevenue = dayServiceCharge;
      const pmsRevenue = roomRevenue + serviceRevenue + dayOtherCharge;
      const totalRevenue = pmsRevenue + dayManualRevenue;
      const collectedRevenue =
        dayTotalPaid + (manualColMap.get(dateKey) || 0) + (receivableColMap.get(dateKey) || 0);
      const expense = (expenseMap.get(dateKey) || 0) + (saasMap.get(dateKey) || 0);
      const paidExpense = paidExpenseMap.get(dateKey) || 0;
      const netProfit = totalRevenue - expense;

      const occ =
        totalRooms > 0 ? Math.min(100, Math.round((roomsOccupied / totalRooms) * 1000) / 10) : 0;
      const adr = roomsOccupied > 0 ? Math.round((roomRevenue || pmsRevenue) / roomsOccupied) : 0;

      days.push({
        date: dateKey,
        dayLabel,
        totalRevenue,
        roomRevenue,
        serviceRevenue,
        manualRevenue: dayManualRevenue,
        collectedRevenue,
        expense,
        paidExpense,
        netProfit,
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
    manualEntries: Array<{
      date: Date;
      amount: Prisma.Decimal | number;
      collections?: Array<{ amount: Prisma.Decimal | number; receivedAt: Date }>;
    }> = [],
    expenses: Array<{
      expenseDate: Date;
      amount: Prisma.Decimal | number;
      paidAmount: Prisma.Decimal | number;
    }> = [],
    saasDays: Array<{ serviceDate: Date; amount: Prisma.Decimal | number }> = [],
    receivableCollections: Array<{ collectedAmount: Prisma.Decimal | number; collectedAt: Date }> = [],
  ) {
    const months: HotelReportsData["revenueByMonth"] = [];
    const endYearMonth = endPlain.toPlainYearMonth();

    for (let i = 11; i >= 0; i--) {
      const ym = endYearMonth.subtract({ months: i });
      const monthKey = ym.toString(); // YYYY-MM
      const monthLabel = `Thg ${ym.month}/${ym.year}`;
      const monthStartPlain = ym.toPlainDate({ day: 1 });
      const monthEndPlain = i === 0 ? endPlain : ym.toPlainDate({ day: ym.daysInMonth });
      const monthStartYmd = monthStartPlain.toString();
      const monthEndYmd = monthEndPlain.toString();
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
            const disc = Math.abs(toNumber(item.discountAmountSnapshot ?? item.totalSnapshot));
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

      let monthManualRevenue = 0;
      let monthManualCollected = 0;
      for (const entry of manualEntries) {
        const ymd = entry.date.toISOString().slice(0, 10);
        if (ymd >= monthStartYmd && ymd <= monthEndYmd) {
          monthManualRevenue += toNumber(entry.amount);
        }
        for (const col of entry.collections ?? []) {
          const cPlain = dateToPlainDate(col.receivedAt, timeZone);
          if (
            Temporal.PlainDate.compare(cPlain, monthStartPlain) >= 0 &&
            Temporal.PlainDate.compare(cPlain, monthEndPlain) <= 0
          ) {
            monthManualCollected += toNumber(col.amount);
          }
        }
      }

      let monthReceivableCollected = 0;
      for (const col of receivableCollections) {
        const cPlain = dateToPlainDate(col.collectedAt, timeZone);
        if (
          Temporal.PlainDate.compare(cPlain, monthStartPlain) >= 0 &&
          Temporal.PlainDate.compare(cPlain, monthEndPlain) <= 0
        ) {
          monthReceivableCollected += toNumber(col.collectedAmount);
        }
      }

      let monthOperatingExpense = 0;
      let monthPaidExpense = 0;
      for (const exp of expenses) {
        const ymd = exp.expenseDate.toISOString().slice(0, 10);
        if (ymd >= monthStartYmd && ymd <= monthEndYmd) {
          const amt = toNumber(exp.amount);
          monthOperatingExpense += amt;
          monthPaidExpense += Math.min(amt, Math.max(0, toNumber(exp.paidAmount)));
        }
      }

      let monthSaasExpense = 0;
      for (const day of saasDays) {
        const ymd = day.serviceDate.toISOString().slice(0, 10);
        if (ymd >= monthStartYmd && ymd <= monthEndYmd) {
          monthSaasExpense += toNumber(day.amount);
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
          accruedMonthRoomRevenue += resolveStayNightlyRate(stay, 0) * activeInMonth.length;
        }
      }

      const monthRoomRevenue = monthFolioRoom > 0 ? monthFolioRoom : accruedMonthRoomRevenue;
      const monthServiceRevenue = monthFolioService;
      const monthPmsRevenue = monthRoomRevenue + monthServiceRevenue + monthFolioOther;
      const monthRevenue = monthPmsRevenue + monthManualRevenue;
      const monthExpense = monthOperatingExpense + monthSaasExpense;
      const monthCollected = monthPaid + monthManualCollected + monthReceivableCollected;
      const monthNetProfit = monthRevenue - monthExpense;

      const availableNights = totalRooms * daysInMonth;
      const averageOccupancy =
        availableNights > 0
          ? Math.min(100, Math.round((roomsSold / availableNights) * 1000) / 10)
          : 0;
      const adr = roomsSold > 0 ? Math.round((monthRoomRevenue || monthPmsRevenue) / roomsSold) : 0;

      months.push({
        month: monthKey,
        monthLabel,
        totalRevenue: monthRevenue,
        roomRevenue: monthRoomRevenue,
        serviceRevenue: monthServiceRevenue,
        manualRevenue: monthManualRevenue,
        collectedRevenue: monthCollected,
        expense: monthExpense,
        paidExpense: monthPaidExpense,
        netProfit: monthNetProfit,
        bookingCount,
        roomsSold,
        averageOccupancy,
        adr,
      });
    }

    return months;
  }

  private buildExpenseBreakdown(
    expenses: Array<{
      category: string;
      amount: Prisma.Decimal | number;
      paidAmount: Prisma.Decimal | number;
    }>,
    saasFeeExpense: number,
    saasDaysCount: number,
    totalExpense: number,
  ): HotelReportsData["expenseByCategory"] {
    const map = new Map<
      ExpenseCategory | "SAAS_FEE",
      { amount: number; paidAmount: number; unpaidAmount: number; count: number }
    >();

    for (const exp of expenses) {
      const cat = (
        exp.category in EXPENSE_CATEGORY_LABELS ? exp.category : "OTHER"
      ) as ExpenseCategory;
      const amt = toNumber(exp.amount);
      const paid = Math.min(amt, Math.max(0, toNumber(exp.paidAmount)));
      const unpaid = Math.max(0, amt - paid);
      const current = map.get(cat) ?? { amount: 0, paidAmount: 0, unpaidAmount: 0, count: 0 };
      current.amount += amt;
      current.paidAmount += paid;
      current.unpaidAmount += unpaid;
      current.count += 1;
      map.set(cat, current);
    }

    if (saasFeeExpense > 0) {
      map.set("SAAS_FEE", {
        amount: saasFeeExpense,
        paidAmount: 0,
        unpaidAmount: saasFeeExpense,
        count: saasDaysCount,
      });
    }

    return Array.from(map.entries())
      .map(([category, val]) => ({
        category,
        categoryLabel: EXPENSE_CATEGORY_LABELS[category],
        amount: val.amount,
        paidAmount: val.paidAmount,
        unpaidAmount: val.unpaidAmount,
        count: val.count,
        sharePercent: totalExpense > 0 ? Math.round((val.amount / totalExpense) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
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
      const guests = Math.max(1, stay.occupants.length, stay.reservation?.guestCount || 1);

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
            partnerName
              ? `CORP_${partnerName.toUpperCase().replace(/\s+/g, "_")}`
              : "CORPORATE_OTHER",
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
        target = getOrCreate("DIRECT", "Đặt phòng trực tiếp (Website / Hotline)", "DIRECT");
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
        const share = rawSum > 0 ? Math.round((item.revenue / rawSum) * 1000) / 10 : 0;
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
      const assigned = staffAssignments.find((s) => s.userId === ownerId || s.user?.id === ownerId);
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
      if (r.status === "OPEN" || r.status === "PARTIAL" || r.status === "PARTIALLY_COLLECTED") {
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
      if (p.status === "CANCELLED" || p.status === "FAILED") continue;
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
    const nationStatMap = new Map<string, { guestCount: number; totalRoomNights: number }>();
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
          totalGuests > 0 ? Math.round((domesticCount / safeTotalGuests) * 1000) / 10 : 0,
        internationalPercentage:
          totalGuests > 0 ? Math.round((internationalCount / safeTotalGuests) * 1000) / 10 : 0,
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
