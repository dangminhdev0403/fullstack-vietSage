import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Temporal } from "@js-temporal/polyfill";
import {
  FolioItemType,
  GuestStayStatus,
  HotelStaffAssignmentStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReservationStatus,
  RoomStatus,
  UserRoleStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { calculateReservationChargeTotal, type ReservationQuotedCharge } from "../../../common/pricing/reservation-charge-total";
import { aggregateMarket, type MarketEvent, type MarketRoom, type MarketDimensions } from "./hotel-report-market";
import { HotelAccessService, type HotelRoomScope } from "./hotel-access.service";
import type {
  GetHotelReportsQuery,
  UpsertHotelRevenueTargetInput,
} from "../domain/schemas/hotel-reports.schema";
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

const REVENUE_TARGET_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

function roundPercent1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function extractRevenueTargets(brandSettings: unknown): Record<string, number> {
  if (!brandSettings || typeof brandSettings !== "object" || Array.isArray(brandSettings)) {
    return {};
  }
  const rawTargets = (brandSettings as Record<string, unknown>).revenueTargets;
  if (!rawTargets || typeof rawTargets !== "object" || Array.isArray(rawTargets)) {
    return {};
  }
  const targets: Record<string, number> = {};
  for (const [month, value] of Object.entries(rawTargets as Record<string, unknown>)) {
    if (!REVENUE_TARGET_MONTH_REGEX.test(month)) continue;
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      targets[month] = parsed;
    }
  }
  return targets;
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
    occupancyRate: number | null;
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
    revpar: number | null;
    onBooksRooms?: number;
    onBooksRoomNights?: number;
    onBooksRevenue?: number;
    onBooksRoomRevenue?: number;
    projectedRoomNights?: number;
    projectedRoomRevenue?: number;
    onBooksOccupancyRate?: number | null;
    onBooksAdr?: number;
    availableRoomNights?: number | null;
    totalAvailableRoomNights?: number | null;
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
    occupancyRate: number | null;
    availableRoomNights: number | null;
    actualRooms: number;
    actualRevenue: number;
    projectedRooms: number;
    projectedRevenue: number;
    onBooksRooms: number;
    onBooksRevenue: number;
    onBooksOccupancyRate: number | null;
    isFuture: boolean;
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
    averageOccupancy: number | null;
    availableRoomNights: number | null;
    adr: number;
    previousMonthRevenue: number | null;
    momChangePercent: number | null;
    previousYearRevenue: number | null;
    yoyChangePercent: number | null;
    targetRevenue: number | null;
    targetAchievementPercent: number | null;
  }>;
  quarterlySummary: Array<{
    quarter: string;
    label: string;
    actualRevenue: number;
    targetRevenue: number | null;
    achievementPercent: number | null;
    netProfit: number;
    monthsIncluded: number;
  }>;
  canManageTargets: boolean;
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
    actualRevenue: number;
    projectedRevenue: number;
    roomNights: number;
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
  marketDimensions: MarketDimensions;
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

export interface UpsertHotelRevenueTargetResult {
  hotelId: string;
  month: string;
  targetAmount: number | null;
  revenueTargets: Record<string, number>;
}

type StayRecord = {
  id: string;
  reservationId?: string | null;
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
    id?: string; roomNumber?: string; type?: string | null;
    price: Prisma.Decimal | number | null;
    roomType: { id?: string; name?: string; basePrice: Prisma.Decimal | number | null } | null;
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
    chargeLines?: ReservationQuotedCharge[];
    sourceCategory?: any;
    sourcePartnerId?: string | null;
    bookingOwnerUserId?: string | null;
    sourcePartner?: { id: string; name: string; category?: any } | null;
  } | null;
};

type ReservationRecord = {
  chargeLines?: ReservationQuotedCharge[];
  projection?: NightProjection[];
  roomTypeSnapshot?: string | null;
  id: string;
  reservationCode: string;
  groupCode?: string | null;
  guestDisplayName?: string;
  status: string;
  plannedCheckInAt: Date;
  plannedCheckOutAt: Date;
  nightlyRateSnapshot: Prisma.Decimal | number | null;
  baseNightlyRateSnapshot: Prisma.Decimal | number | null;
  guestCount?: number | null;
  roomId?: string | null;
  roomTypeId?: string | null;
  sourceCategory?: any;
  sourcePartnerId?: string | null;
  bookingOwnerUserId?: string | null;
  stay?: {
    id: string;
    status: string;
  } | null;
  room?: {
    id?: string; roomNumber?: string; type?: string | null;
    price: Prisma.Decimal | number | null;
    roomType: { id?: string; name?: string; basePrice: Prisma.Decimal | number | null } | null;
  } | null;
  roomType?: {
    id?: string; name?: string;
    basePrice: Prisma.Decimal | number | null;
  } | null;
  sourcePartner?: {
    id: string;
    name: string;
    category?: any;
  } | null;
};

function scopedRoomIds(scope: HotelRoomScope): string[] | null {
  if (scope.allowedRoomId != null) {
    return scope.allowedRoomIds == null || scope.allowedRoomIds.includes(scope.allowedRoomId)
      ? [scope.allowedRoomId] : [];
  }
  return scope.allowedRoomIds ?? null;
}

type Availability = Map<string, number | null>;

function availableNights(from: Temporal.PlainDate, to: Temporal.PlainDate, rooms: number, days: Availability) {
  let total = 0;
  for (let d = from; Temporal.PlainDate.compare(d, to) <= 0; d = d.add({ days: 1 })) {
    const key = d.toString();
    const capacity = days.has(key) ? days.get(key)! : rooms;
    if (capacity === null) return null;
    total += capacity;
  }
  return total;
}

function occupancy(sold: number, capacity: number | null) {
  return capacity === null ? null : capacity === 0 ? 0 : roundPercent1(100 * sold / capacity);
}

const marketRoomSelect = {
  id: true, roomNumber: true, type: true, roomType: { select: { id: true, name: true } },
} as const;

const groupAttribution = {
  select: { sourceCategory: true, bookingOwnerUserId: true, sourcePartner: { select: { id: true, name: true } } },
} as const;
const marketReservationSelect = {
  group: groupAttribution,
  reservationCode: true, groupCode: true, sourceCategory: true, bookingOwnerUserId: true,
  sourcePartner: { select: { id: true, name: true } },
} as const;

const quoteLinesSelect = {
  orderBy: [{ serviceDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  select: { lineType: true, serviceDate: true, totalSnapshot: true, currency: true },
} satisfies Prisma.Reservation$chargeLinesArgs;

type NightProjection = { date: string; amount: number };

function projectedNights(res: ReservationRecord, timeZone: string): NightProjection[] {
  return calculateReservationChargeTotal(res, timeZone).nightlyCharges
    .map(({ date, amount }) => ({ date, amount: amount.toNumber() }));
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

    // Ensure our single DB query batch also covers the 24-month trend window
    // (12 displayed months + MoM and YoY comparison baselines)
    const twentyFourMonthsStartPlain = endPlain
      .toPlainYearMonth()
      .subtract({ months: 23 })
      .toPlainDate({ day: 1 });
    const queryWindowStartPlain =
      Temporal.PlainDate.compare(startPlain, twentyFourMonthsStartPlain) < 0
        ? startPlain
        : twentyFourMonthsStartPlain;
    const queryWindowStartDate = plainDateStartUtc(queryWindowStartPlain, timeZone);

    const allowedIds = scopedRoomIds(scope);
    const roomFilter = allowedIds === null ? {} : { roomId: { in: allowedIds } };
    const roomWhere: Prisma.RoomWhereInput = {
      hotelId, ...(allowedIds === null ? {} : { id: { in: allowedIds } }),
    };
    const stayWhere: Prisma.GuestStayWhereInput = { hotelId, ...roomFilter };
    const paymentWhere: Prisma.PaymentWhereInput = {
      hotelId, ...(allowedIds === null ? {} : { folio: roomFilter }),
    };
    const reservationWhere: Prisma.ReservationWhereInput = {
      hotelId, ...roomFilter,
      status: { in: [ReservationStatus.CONFIRMED, ReservationStatus.ARRIVAL_READY] },
      plannedCheckInAt: { lte: endDate },
      plannedCheckOutAt: { gte: queryWindowStartDate },
    };

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
      hotelBrandRecord,
      actorContext,
      allReservationsRaw,
      roomCatalog,
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
          ...(allowedIds === null ? {} : { folio: roomFilter }),
        },
        select: {
          id: true,
          itemType: true,
          totalSnapshot: true,
          discountAmountSnapshot: true,
          postedAt: true,
          postedByUserId: true,
          folio: { select: { room: { select: marketRoomSelect } } },
          stay: { select: {
            guestNationality: true,
            occupants: { where: { isPrimary: true }, select: { nationality: true } },
            reservation: { select: marketReservationSelect },
          } },
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
          reservationId: true,
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
              ...marketRoomSelect, price: true,
              roomType: { select: { id: true, name: true, basePrice: true } },
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
              group: groupAttribution,
              chargeLines: quoteLinesSelect,
              sourcePartner: { select: { id: true, name: true, category: true } },
            },
          },
        },
      }),
      allowedIds === null ? this.prisma.hotelStaffAssignment.findMany({
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
      }) : [],
      (this.prisma as any).hotelReceivable
        ? (this.prisma as any).hotelReceivable.findMany({
            where: {
              hotelId,
              ...(allowedIds === null ? {} : { folio: roomFilter }),
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
              ...(allowedIds !== null
                ? { reservation: roomFilter }
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
        room?: MarketRoom | null;
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
                  ...roomFilter,
                },
                select: {
                  id: true,
                  date: true,
                  room: { select: marketRoomSelect },
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
                  ...roomFilter,
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
        allowedIds === null && (this.prisma as any).platformBillableDay
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
        (this.prisma as any).receivableCollection
          ? () =>
              (this.prisma as any).receivableCollection.findMany({
                where: {
                  hotelId,
                  isVoided: false,
                  ...(allowedIds === null ? {} : { receivable: { folio: roomFilter } }),
                  collectedAt: { gte: queryWindowStartDate, lte: endDate },
                },
                select: { collectedAmount: true, collectedAt: true },
              })
          : null,
      ),
      allowedIds === null && typeof (this.prisma as any).hotel?.findUnique === "function"
        ? (this.prisma as any).hotel.findUnique({
            where: { id: hotelId },
            select: { brandSettings: true },
          })
        : Promise.resolve(null),
      allowedIds === null &&
      typeof (this.hotelAccessService as any).loadActorContext === "function"
        ? this.hotelAccessService.loadActorContext(actorUserId, activeRoleId)
        : Promise.resolve(null),
      optionalQuery<ReservationRecord>(
        (this.prisma as any).reservation
          ? () =>
              (this.prisma as any).reservation.findMany({
                where: reservationWhere,
                select: {
                  id: true,
                  reservationCode: true,
                  groupCode: true,
                  guestDisplayName: true,
                  status: true,
                  plannedCheckInAt: true,
                  plannedCheckOutAt: true,
                  nightlyRateSnapshot: true,
                  baseNightlyRateSnapshot: true,
                  guestCount: true,
                  group: groupAttribution,
              chargeLines: quoteLinesSelect,
                  roomTypeSnapshot: true,
                  roomId: true,
                  roomTypeId: true,
                  sourceCategory: true,
                  sourcePartnerId: true,
                  bookingOwnerUserId: true,
                  stay: {
                    select: {
                      id: true,
                      status: true,
                    },
                  },
                  room: {
                    select: {
                      ...marketRoomSelect, price: true,
                      roomType: { select: { id: true, name: true, basePrice: true } },
                    },
                  },
                  roomType: {
                    select: {
                      id: true, name: true, basePrice: true,
                    },
                  },
                  sourcePartner: {
                    select: {
                      id: true,
                      name: true,
                      category: true,
                    },
                  },
                },
              })
          : null,
      ),
      optionalQuery<{ type: string | null }>(
        typeof (this.prisma as any).room?.findMany === "function"
          ? () => this.prisma.room.findMany({ where: roomWhere, select: { type: true } })
          : null,
      ),
    ]);

    const typeCounts = new Map<string, number>();
    for (const room of roomCatalog) {
      const key = room.type?.trim();
      if (key) typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
    }
    const capacityRows = await optionalQuery<{
      date: Date;
      roomType: string;
      totalRooms: number;
      blockedRooms: number;
    }>(
      typeof (this.prisma as any).channelDailyAvailability?.findMany === "function"
        ? () =>
            this.prisma.channelDailyAvailability.findMany({
              where: {
                hotelId,
                date: { gte: queryWindowDateOnlyStart, lte: endDateOnly },
                ...(allowedIds === null ? {} : { roomType: { in: [...typeCounts.keys()] } }),
              },
              select: { date: true, roomType: true, totalRooms: true, blockedRooms: true },
            })
        : null,
    );
    const capacityByDay: Availability = new Map();
    for (const row of capacityRows) {
      const key = row.date.toISOString().slice(0, 10);
      const base = capacityByDay.has(key) ? capacityByDay.get(key)! : totalRooms;
      if (base === null) continue;
      const physical = typeCounts.get(row.roomType) ?? 0;
      if (physical === 0) continue;
      // ARI identifies a room type, not which individual rooms were blocked.
      if (allowedIds !== null) {
        if (row.blockedRooms >= row.totalRooms && row.blockedRooms > 0) {
          capacityByDay.set(key, Math.max(0, base - physical));
        } else if (row.blockedRooms > 0 || row.totalRooms < physical) {
          capacityByDay.set(key, null);
        }
      } else {
        const sellable = Math.min(physical, Math.max(0, row.totalRooms - row.blockedRooms));
        capacityByDay.set(key, Math.max(0, base - physical + sellable));
      }
    }
    const revenueTargets = allowedIds === null ? extractRevenueTargets(hotelBrandRecord?.brandSettings) : {};
    const canManageTargets =
      allowedIds === null &&
      Boolean(
        actorContext?.isSuperAdmin ||
          actorContext?.permissions?.has("hotel.billing.manage") === true,
      );

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
    const availableRoomNights = availableNights(startPlain, endPlain, totalRooms, capacityByDay);

    let totalRoomNights = 0;

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

      }
    }

    // Deduplicate bookings converted to stays and filter cancelled bookings
    const convertedReservationIds = new Set<string>();
    const convertedReservationCodes = new Set<string>();
    for (const stay of allStays) {
      if ((stay as any).reservationId) {
        convertedReservationIds.add((stay as any).reservationId);
      }
      if (stay.reservation?.id) {
        convertedReservationIds.add(stay.reservation.id);
      }
      if (stay.reservationCode) {
        convertedReservationCodes.add(stay.reservationCode);
      }
    }

    const unconvertedReservations = ((allReservationsRaw as ReservationRecord[]) ?? []).filter((res) => {
      if (
        res.status === ReservationStatus.CANCELLED ||
        res.status === "CANCELLED" ||
        res.status === ReservationStatus.NO_SHOW ||
        res.status === "NO_SHOW"
      ) {
        return false;
      }
      if (res.stay != null && res.stay.id) {
        return false;
      }
      if (convertedReservationIds.has(res.id)) {
        return false;
      }
      if (res.status === ReservationStatus.CHECKED_IN || res.status === "CHECKED_IN") {
        return false;
      }
      if (res.reservationCode && convertedReservationCodes.has(res.reservationCode)) {
        return false;
      }
      return true;
    });

    const inPeriod = (date: string) => date >= startPlain.toString() && date <= endPlain.toString();
    const activeUnconvertedReservations = unconvertedReservations
      .filter((res) => res.plannedCheckInAt <= endDate && res.plannedCheckOutAt >= startDate)
      .map((res) => ({ ...res, projection: projectedNights(res, timeZone).filter((n) => inPeriod(n.date)) }))
      .filter((res) => res.projection.length > 0);
    const forecastNights = activeUnconvertedReservations.flatMap((res) => res.projection);
    const projectedRoomNights = forecastNights.length;
    const projectedRoomRevenue = forecastNights.reduce((sum, night) => sum + night.amount, 0);

    const onBooksRoomNights = totalRoomNights + projectedRoomNights;
    const onBooksRoomRevenue = folioRoomRevenue + projectedRoomRevenue;
    const onBooksOccupancyRate = occupancy(onBooksRoomNights, availableRoomNights);
    const onBooksAdr =
      onBooksRoomNights > 0
        ? Math.round(onBooksRoomRevenue / onBooksRoomNights)
        : 0;

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
    const effectiveRoomRevenue = folioRoomRevenue;

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

    const occupancyRate = occupancy(totalRoomNights, availableRoomNights);
    const currentOccupancyRate =
      totalRooms > 0 ? roundPercent1((occupiedRoomsNow / totalRooms) * 100) : 0;
    const adr = totalRoomNights > 0 ? Math.round(effectiveRoomRevenue / totalRoomNights) : 0;
    const revpar = availableRoomNights === null ? null :
      availableRoomNights > 0 ? Math.round(effectiveRoomRevenue / availableRoomNights) : 0;

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
      activeUnconvertedReservations,
      capacityByDay,
    );

    // 5. Monthly Revenue Breakdown (uses full 24-month window datasets for MoM/YoY baselines, outputs 12 months)
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
      revenueTargets,
      capacityByDay,
    );
    const quarterlySummary = this.buildQuarterlySummary(revenueByMonth);

    // 6. Expense Category Breakdown (including VietSage SaaS fee)
    const expenseByCategory = this.buildExpenseBreakdown(
      expensesInPeriod,
      saasFeeExpense,
      saasDaysInPeriod.length,
      totalExpense,
    );

    // 7. Revenue by Booking Source
    const marketEvents: MarketEvent[] = [];
    for (const item of folioItems) {
      const amount = item.itemType === FolioItemType.DISCOUNT
        ? -Math.abs(toNumber(item.discountAmountSnapshot ?? item.totalSnapshot)) : toNumber(item.totalSnapshot);
      marketEvents.push({
        booking: item.stay?.reservation, room: item.folio?.room,
        nationality: normalizeNationality(item.stay?.occupants?.[0]?.nationality ?? item.stay?.guestNationality),
        actual: amount, actualRoom: item.itemType === FolioItemType.ROOM_CHARGE ? amount : 0,
      });
    }
    for (const entry of manualEntriesInPeriod) marketEvents.push({ room: entry.room, actual: toNumber(entry.amount) });
    for (const stay of stays) {
      const dates = getStayActivePlainDates(
        stay.checkedInAt ?? stay.plannedCheckInAt, stay.checkedOutAt ?? stay.plannedCheckOutAt, timeZone,
      );
      const occupants = stay.occupants ?? [];
      marketEvents.push({
        booking: stay.reservation, room: stay.room,
        nationality: normalizeNationality(occupants.find((o) => o.isPrimary)?.nationality ?? stay.guestNationality),
        sold: dates.filter((d) => inPeriod(d.toString())).length, bookings: 1,
        guests: Math.max(1, occupants.length, stay.reservation?.guestCount ?? 0),
      });
    }
    for (const res of activeUnconvertedReservations) {
      marketEvents.push({
        booking: res, room: res.room, roomType: res.roomType?.name ?? res.roomTypeSnapshot,
        projected: res.projection.reduce((sum, night) => sum + night.amount, 0),
        reserved: res.projection.length, bookings: 1, guests: Math.max(1, res.guestCount ?? 0),
      });
    }
    const staffNameMap = new Map<string, string>(
      staffAssignments.map(
        (a: { userId: string; user?: { fullName?: string | null; email?: string | null } | null }) =>
          [a.userId, a.user?.fullName ?? a.user?.email ?? ""] as [string, string],
      ),
    );
    const { marketDimensions, revenueBySource, revenueByBookingOwner } = aggregateMarket(
      marketEvents,
      staffNameMap,
    );

    // 8. Revenue by Staff Member
    const revenueByStaff = this.buildStaffBreakdown(succeededPayments, stays, staffAssignments);

    // 9. Guest Analytics (Nationalities & Demographics)
    const guestAnalytics = this.buildGuestAnalytics(stays, startPlain, endPlain, timeZone);

    // 10. Payment Methods Breakdown
    const paymentMethods = this.buildPaymentMethodsBreakdown(combinedDailyPayments);

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
        onBooksRooms: onBooksRoomNights,
        onBooksRoomNights,
        onBooksRevenue: onBooksRoomRevenue,
        onBooksRoomRevenue,
        projectedRoomNights,
        projectedRoomRevenue,
        onBooksOccupancyRate,
        onBooksAdr,
        availableRoomNights,
        totalAvailableRoomNights: availableRoomNights,
      },
      revenueByDay,
      revenueByMonth,
      quarterlySummary,
      canManageTargets,
      expenseByCategory,
      revenueBySource,
      revenueByStaff,
      revenueByBookingOwner,
      marketDimensions,
      guestAnalytics,
      paymentMethods,
      receivablesSummary,
      bookingPaymentsSummary,
    };
  }

  async upsertRevenueTarget(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    input: UpsertHotelRevenueTargetInput,
  ): Promise<UpsertHotelRevenueTargetResult> {
    const scope = await this.hotelAccessService.resolveRoomScope(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    if (scopedRoomIds(scope) !== null) {
      throw new ForbiddenException(
        "Tài khoản chỉ được phân quyền theo phòng nên không thể cập nhật mục tiêu doanh thu khách sạn",
      );
    }

    const roundedAmount = Math.round(input.targetAmount);
    const nextTargetAmount = roundedAmount > 0 ? roundedAmount : null;

    return this.prisma.$transaction(async (tx) => {
      const hotel = await tx.hotel.findUnique({
        where: { id: hotelId },
        select: { id: true, tenantId: true, brandSettings: true },
      });
      if (!hotel) {
        throw new NotFoundException("Không tìm thấy khách sạn");
      }

      const existingBrandSettings =
        hotel.brandSettings &&
        typeof hotel.brandSettings === "object" &&
        !Array.isArray(hotel.brandSettings)
          ? { ...(hotel.brandSettings as Record<string, unknown>) }
          : {};

      const existingTargets = extractRevenueTargets(existingBrandSettings);
      const revenueTargets: Record<string, number> = { ...existingTargets };
      if (nextTargetAmount === null) {
        delete revenueTargets[input.month];
      } else {
        revenueTargets[input.month] = nextTargetAmount;
      }

      const nextBrandSettings: Prisma.InputJsonObject = {
        ...(existingBrandSettings as Prisma.InputJsonObject),
        revenueTargets,
      };

      await tx.hotel.update({
        where: { id: hotelId },
        data: {
          brandSettings: nextBrandSettings,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          tenantId: hotel.tenantId ?? scope.hotel?.tenantId,
          entityType: "Hotel",
          entityId: hotelId,
          action: "HOTEL_REVENUE_TARGET_UPDATED",
          metadata: {
            hotelId,
            month: input.month,
            previousTargetAmount: existingTargets[input.month] ?? null,
            targetAmount: nextTargetAmount,
          },
        },
      });

      return {
        hotelId,
        month: input.month,
        targetAmount: nextTargetAmount,
        revenueTargets,
      };
    });
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
    unconvertedReservations: ReservationRecord[] = [],
    capacityByDay: Availability = new Map(),
  ) {
    const days: HotelReportsData["revenueByDay"] = [];
    const todayPlain = Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate();

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
    const stayOccupancyMap = new Map<string, number>();
    for (const stay of stays) {
      const activeDates = getStayActivePlainDates(
        stay.checkedInAt ?? stay.plannedCheckInAt, stay.checkedOutAt ?? stay.plannedCheckOutAt, timeZone,
      );
      for (const d of activeDates) {
        const key = d.toString();
        stayOccupancyMap.set(key, (stayOccupancyMap.get(key) ?? 0) + 1);
      }
    }
    const reservationProjectionMap = new Map<string, { projectedRooms: number; projectedRevenue: number }>();
    for (const res of unconvertedReservations) {
      for (const night of res.projection ?? projectedNights(res, timeZone)) {
        const current = reservationProjectionMap.get(night.date) ?? { projectedRooms: 0, projectedRevenue: 0 };
        current.projectedRooms++;
        current.projectedRevenue += night.amount;
        reservationProjectionMap.set(night.date, current);
      }
    }

    let cursor = startPlain;
    let safety = 0;
    while (Temporal.PlainDate.compare(cursor, endPlain) <= 0 && safety < 730) {
      const dateKey = cursor.toString();
      const dayLabel = `${cursor.day}/${cursor.month}`;

      const roomsOccupied = stayOccupancyMap.get(dateKey) ?? 0;
      const capacity = capacityByDay.has(dateKey) ? capacityByDay.get(dateKey)! : totalRooms;

      const resStat = reservationProjectionMap.get(dateKey);
      const projectedRooms = resStat?.projectedRooms || 0;
      const projectedRevenue = resStat?.projectedRevenue || 0;

      const dayTotalPaid = paymentMap.get(dateKey) || 0;
      const dayRoomCharge = roomChargeMap.get(dateKey) || 0;
      const dayServiceCharge = serviceChargeMap.get(dateKey) || 0;
      const dayOtherCharge = otherChargeMap.get(dateKey) || 0;
      const dayManualRevenue = manualRevMap.get(dateKey) || 0;

      const actualRooms = roomsOccupied;
      const actualRevenue = dayRoomCharge;
      const onBooksRooms = actualRooms + projectedRooms;
      const onBooksRevenue = actualRevenue + projectedRevenue;
      const onBooksOccupancyRate = occupancy(onBooksRooms, capacity);
      const isFuture = Temporal.PlainDate.compare(cursor, todayPlain) > 0;
      const dayRevenue = actualRevenue + dayServiceCharge + dayOtherCharge + dayManualRevenue;
      const collectedRevenue =
        dayTotalPaid + (manualColMap.get(dateKey) || 0) + (receivableColMap.get(dateKey) || 0);
      const expense = (expenseMap.get(dateKey) || 0) + (saasMap.get(dateKey) || 0);
      const paidExpense = paidExpenseMap.get(dateKey) || 0;
      const netProfit = dayRevenue - expense;
      const occ = occupancy(actualRooms, capacity);
      const adr = actualRooms > 0 ? Math.round(actualRevenue / actualRooms) : 0;

      days.push({
        date: dateKey,
        dayLabel,
        totalRevenue: dayRevenue,
        roomRevenue: actualRevenue,
        serviceRevenue: dayServiceCharge,
        manualRevenue: dayManualRevenue,
        collectedRevenue,
        expense,
        paidExpense,
        netProfit,
        availableRoomNights: capacity,
        roomsOccupied: actualRooms,
        adr,
        occupancyRate: occ,
        actualRooms,
        actualRevenue,
        projectedRooms,
        projectedRevenue,
        onBooksRooms,
        onBooksRevenue,
        onBooksOccupancyRate,
        isFuture,
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
    revenueTargets: Record<string, number> = {},
    capacityByDay: Availability = new Map(),
  ) {
    type BaseMonthlyItem = Omit<
      HotelReportsData["revenueByMonth"][number],
      | "previousMonthRevenue"
      | "momChangePercent"
      | "previousYearRevenue"
      | "yoyChangePercent"
      | "targetRevenue"
      | "targetAchievementPercent"
    >;

    const windowMonths: BaseMonthlyItem[] = [];
    const endYearMonth = endPlain.toPlainYearMonth();

    for (let i = 23; i >= 0; i--) {
      const ym = endYearMonth.subtract({ months: i });
      const monthKey = ym.toString(); // YYYY-MM
      const monthLabel = `Thg ${ym.month}/${ym.year}`;
      const monthStartPlain = ym.toPlainDate({ day: 1 });
      const monthEndPlain = i === 0 ? endPlain : ym.toPlainDate({ day: ym.daysInMonth });
      const monthStartYmd = monthStartPlain.toString();
      const monthEndYmd = monthEndPlain.toString();


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

        }
      }

      const monthRoomRevenue = monthFolioRoom;
      const monthServiceRevenue = monthFolioService;
      const monthPmsRevenue = monthRoomRevenue + monthServiceRevenue + monthFolioOther;
      const monthRevenue = monthPmsRevenue + monthManualRevenue;
      const monthExpense = monthOperatingExpense + monthSaasExpense;
      const monthCollected = monthPaid + monthManualCollected + monthReceivableCollected;
      const monthNetProfit = monthRevenue - monthExpense;

      const capacity = availableNights(monthStartPlain, monthEndPlain, totalRooms, capacityByDay);
      const averageOccupancy = occupancy(roomsSold, capacity);
      const adr = roomsSold > 0 ? Math.round(monthRoomRevenue / roomsSold) : 0;

      windowMonths.push({
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
        availableRoomNights: capacity,
        adr,
      });
    }

    const months: HotelReportsData["revenueByMonth"] = [];
    for (let idx = 12; idx < windowMonths.length; idx++) {
      const current = windowMonths[idx];
      const previousMonth = windowMonths[idx - 1];
      const previousYear = windowMonths[idx - 12];

      const previousMonthRevenue = previousMonth ? previousMonth.totalRevenue : null;
      const momChangePercent =
        previousMonthRevenue !== null && previousMonthRevenue > 0
          ? roundPercent1(((current.totalRevenue - previousMonthRevenue) / previousMonthRevenue) * 100)
          : null;

      const previousYearRevenue = previousYear ? previousYear.totalRevenue : null;
      const yoyChangePercent =
        previousYearRevenue !== null && previousYearRevenue > 0
          ? roundPercent1(((current.totalRevenue - previousYearRevenue) / previousYearRevenue) * 100)
          : null;

      const rawTarget = revenueTargets[current.month];
      const targetRevenue =
        typeof rawTarget === "number" && Number.isFinite(rawTarget) && rawTarget > 0
          ? rawTarget
          : null;
      const targetAchievementPercent =
        targetRevenue !== null && targetRevenue > 0
          ? roundPercent1((current.totalRevenue / targetRevenue) * 100)
          : null;

      months.push({
        ...current,
        previousMonthRevenue,
        momChangePercent,
        previousYearRevenue,
        yoyChangePercent,
        targetRevenue,
        targetAchievementPercent,
      });
    }

    return months;
  }

  private buildQuarterlySummary(
    revenueByMonth: HotelReportsData["revenueByMonth"],
  ): HotelReportsData["quarterlySummary"] {
    const quarterMap = new Map<
      string,
      {
        quarter: string;
        label: string;
        actualRevenue: number;
        targetRevenue: number;
        hasTarget: boolean;
        netProfit: number;
        monthsIncluded: number;
      }
    >();

    for (const item of revenueByMonth) {
      const [yearStr, monthStr] = item.month.split("-");
      const year = Number(yearStr);
      const monthNum = Number(monthStr);
      const q = Math.ceil(monthNum / 3);
      const quarter = `${year}-Q${q}`;

      let entry = quarterMap.get(quarter);
      if (!entry) {
        entry = {
          quarter,
          label: `Quý ${q}/${year}`,
          actualRevenue: 0,
          targetRevenue: 0,
          hasTarget: false,
          netProfit: 0,
          monthsIncluded: 0,
        };
        quarterMap.set(quarter, entry);
      }

      entry.actualRevenue += item.totalRevenue;
      entry.netProfit += item.netProfit;
      entry.monthsIncluded += 1;
      if (item.targetRevenue !== null && item.targetRevenue > 0) {
        entry.targetRevenue += item.targetRevenue;
        entry.hasTarget = true;
      }
    }

    return Array.from(quarterMap.values()).map((entry) => {
      const targetRevenue = entry.hasTarget ? entry.targetRevenue : null;
      const achievementPercent =
        targetRevenue !== null && targetRevenue > 0
          ? roundPercent1((entry.actualRevenue / targetRevenue) * 100)
          : null;
      return {
        quarter: entry.quarter,
        label: entry.label,
        actualRevenue: entry.actualRevenue,
        targetRevenue,
        achievementPercent,
        netProfit: entry.netProfit,
        monthsIncluded: entry.monthsIncluded,
      };
    });
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
