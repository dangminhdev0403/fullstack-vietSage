import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { addDaysYmd, diffCalendarDays, toYmd, VIETNAM_TIME_ZONE } from "../time/vietnam-temporal";

type Money = Prisma.Decimal | number | string;

export interface ReservationQuotedCharge {
  lineType: string;
  serviceDate?: Date | string | null;
  unitPriceSnapshot?: Money | null;
  totalSnapshot?: Money | null;
  quantity?: number;
  taxAmountSnapshot?: Money | null;
  discountAmountSnapshot?: Money | null;
  currency?: string;
}

export interface ReservationQuotedPrice {
  plannedCheckInAt: Date | string;
  plannedCheckOutAt: Date | string;
  nightlyRateSnapshot?: Money | null;
  baseNightlyRateSnapshot?: Money | null;
  chargeLines?: readonly ReservationQuotedCharge[];
  currency?: string;
}

/** Commercial quote shared by booking payments and group projections. */
export function calculateReservationChargeTotal(
  reservation: ReservationQuotedPrice,
  timeZone = VIETNAM_TIME_ZONE,
) {
  const checkIn =
    reservation.plannedCheckInAt instanceof Date
      ? reservation.plannedCheckInAt
      : new Date(reservation.plannedCheckInAt);
  const checkOut =
    reservation.plannedCheckOutAt instanceof Date
      ? reservation.plannedCheckOutAt
      : new Date(reservation.plannedCheckOutAt);
  const nights = Math.max(1, diffCalendarDays(checkIn, checkOut, timeZone));
  const startYmd = toYmd(checkIn, timeZone);
  const lines = reservation.chargeLines ?? [];
  const currency = reservation.currency ?? lines.find((line) => line.currency)?.currency ?? "VND";
  const round = (amount: Prisma.Decimal) =>
    currency === "VND" ? amount.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : amount;
  const agreedRate = reservation.nightlyRateSnapshot ?? reservation.baseNightlyRateSnapshot;
  const fallback = agreedRate == null ? null : round(new Prisma.Decimal(agreedRate));
  const dated = new Map<string, Prisma.Decimal>();
  const ordered: Prisma.Decimal[] = [];
  let extraSubtotal = new Prisma.Decimal(0);

  for (const line of lines) {
    if (line.currency && line.currency !== currency) {
      throw new ConflictException("RESERVATION_CURRENCY_MISMATCH");
    }
    const total = round(
      new Prisma.Decimal(
        line.totalSnapshot ??
          new Prisma.Decimal(line.unitPriceSnapshot ?? 0)
            .mul(line.quantity ?? 1)
            .add(line.taxAmountSnapshot ?? 0)
            .sub(line.discountAmountSnapshot ?? 0),
      ),
    );
    if (line.lineType !== "ROOM_NIGHT") {
      extraSubtotal = extraSubtotal.add(total);
      continue;
    }
    ordered.push(total);
    if (line.serviceDate) {
      const serviceDate =
        line.serviceDate instanceof Date ? line.serviceDate : new Date(line.serviceDate);
      dated.set(toYmd(serviceDate, timeZone), total);
    }
  }

  let roomSubtotal = new Prisma.Decimal(0);
  const nightlyCharges: Array<{ date: string; amount: Prisma.Decimal }> = [];
  for (let index = 0; index < nights; index += 1) {
    const date = addDaysYmd(startYmd, index);
    // A dated schedule never uses unrelated/undated rows to fill its gaps.
    const price = dated.size > 0 ? (dated.get(date) ?? fallback) : (ordered[index] ?? fallback);
    if (price == null) throw new ConflictException("MISSING_AGREED_ROOM_RATE_SNAPSHOT");
    roomSubtotal = roomSubtotal.add(price);
    nightlyCharges.push({ date, amount: price });
  }
  return {
    nights,
    roomSubtotal,
    extraSubtotal,
    totalAmount: roomSubtotal.add(extraSubtotal),
    nightlyCharges,
  };
}
