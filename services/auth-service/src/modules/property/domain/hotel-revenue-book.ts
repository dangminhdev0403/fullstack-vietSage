import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { toYmd } from "../../../common/time/vietnam-temporal";
import type { RevenueBookEntry, RevenueBookTotals } from "./hotel-revenue-book.types";
import type {
  RevenueBookCategory,
  RevenueBookCategoryFilter,
  RevenueBookPaymentMethodFilter,
  RevenueBookSettlementStatusFilter,
  RevenueBookSourceFilter,
} from "./schemas/hotel-revenue-book.schema";

const STANDARD_PAYMENT_METHODS = new Set(["CASH", "BANK_TRANSFER", "CARD"]);

export type RevenueBookBucket = RevenueBookCategory | "CHANNEL";

export interface RevenueBookFilters {
  category?: RevenueBookCategoryFilter;
  paymentMethod?: RevenueBookPaymentMethodFilter;
  source?: RevenueBookSourceFilter;
  settlementStatus?: RevenueBookSettlementStatusFilter;
}

export type MoneyEvent = { date: Date; amount: Prisma.Decimal | number; category?: RevenueBookBucket; id?: string; method?: string; reference?: string | null; splitGroupId?: string | null };
export type BookAccount = Pick<RevenueBookEntry, "id" | "source" | "date" | "roomId" | "roomNumber" | "documentNumber" | "description" | "category" | "amount" | "notes" | "declarationStatus" | "version" | "voidedAt"> & {
  charges: MoneyEvent[];
  collections: MoneyEvent[];
  adjustments?: MoneyEvent[];
};
const decimal = (value: Prisma.Decimal | number) => new Prisma.Decimal(value);
const sum = (events: MoneyEvent[]) => events.reduce((total, event) => total.add(event.amount), new Prisma.Decimal(0));
export function revenueCategory(itemType: string, name: string, explicit?: unknown): RevenueBookCategory {
  if (explicit === "ROOM" || explicit === "MINIBAR" || explicit === "LAUNDRY" || explicit === "OTHER") return explicit;
  if (itemType === "ROOM_CHARGE") return "ROOM";
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/đ/g, "d");
  if (/minibar|nuoc uong|beverage|do uong/.test(normalized)) return "MINIBAR";
  if (/giat|laundry/.test(normalized)) return "LAUNDRY";
  return "OTHER";
}
export function isSalesChannelBooking(booking?: {
  sourceCategory?: string | null;
  groupCode?: string | null;
  group?: { sourceCategory?: string | null; groupCode?: string | null } | null;
} | null): boolean {
  const category = booking?.sourceCategory ?? booking?.group?.sourceCategory ?? null;
  if (category === "OTA" || category === "TRAVEL_AGENCY") return true;
  if (category) return false;
  const groupCode = booking?.groupCode ?? booking?.group?.groupCode ?? null;
  return Boolean(groupCode?.startsWith("CHANNEX:"));
}
export function projectBookAccount(account: BookAccount, from: Date, end: Date, timeZone: string): RevenueBookEntry | null {
  const inPeriod = (event: MoneyEvent) => event.date >= from && event.date < end;
  const charges = account.charges.filter(inPeriod);
  const collections = account.collections.filter(inPeriod);
  const adjustments = (account.adjustments ?? []).filter(inPeriod);
  const revenueTotal = sum(charges);
  const collectedTotal = sum(collections);
  const adjustment = sum(adjustments);
  if (!charges.length && !collections.length && adjustment.isZero()) return null;
  const closing = revenueTotal.sub(collectedTotal).add(adjustment);
  const lines = new Map<string, { ROOM: Prisma.Decimal; CHANNEL: Prisma.Decimal; MINIBAR: Prisma.Decimal; LAUNDRY: Prisma.Decimal; OTHER: Prisma.Decimal }>();
  for (const charge of charges) {
    const key = toYmd(charge.date, timeZone);
    const line = lines.get(key) ?? { ROOM: decimal(0), CHANNEL: decimal(0), MINIBAR: decimal(0), LAUNDRY: decimal(0), OTHER: decimal(0) };
    const category = charge.category ?? "OTHER";
    line[category] = line[category].add(charge.amount);
    lines.set(key, line);
  }
  const byCategory = (category: RevenueBookBucket) => sum(charges.filter((charge) => (charge.category ?? "OTHER") === category)).toNumber();
  return {
    id: account.id, source: account.source, date: account.date, roomId: account.roomId, roomNumber: account.roomNumber,
    documentNumber: account.documentNumber, description: account.description, category: account.category, amount: account.amount,
    notes: account.notes, declarationStatus: account.declarationStatus, version: account.version, voidedAt: account.voidedAt,
    roomRevenue: byCategory("ROOM"), channelRevenue: byCategory("CHANNEL"), minibarRevenue: byCategory("MINIBAR"), laundryRevenue: byCategory("LAUNDRY"), otherRevenue: byCategory("OTHER"),
    revenueTotal: revenueTotal.toNumber(), closingBalance: closing.toNumber(), balanceAdjustment: adjustment.toNumber(),
    revenueLines: [...lines.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, line]) => ({
      date, roomRevenue: line.ROOM.toNumber(), channelRevenue: line.CHANNEL.toNumber(), minibarRevenue: line.MINIBAR.toNumber(), laundryRevenue: line.LAUNDRY.toNumber(), otherRevenue: line.OTHER.toNumber(),
      revenueTotal: line.ROOM.add(line.CHANNEL).add(line.MINIBAR).add(line.LAUNDRY).add(line.OTHER).toNumber(),
    })),
    collections: collections.sort((a, b) => a.date.getTime() - b.date.getTime()).map((collection) => ({
      id: collection.id!, receivedAt: collection.date.toISOString(), amount: decimal(collection.amount).toNumber(), method: collection.method ?? "OTHER", reference: collection.reference ?? null,
      ...(collection.splitGroupId ? { splitGroupId: collection.splitGroupId } : {}),
    })),
  };
}
export function filterRevenueBookEntries(
  entries: RevenueBookEntry[],
  filters: RevenueBookFilters,
): RevenueBookEntry[] {
  return entries.filter((entry) => {
    if (filters.source && entry.source !== filters.source) {
      return false;
    }
    if (filters.category) {
      const matchesCategory =
        entry.category === filters.category ||
        (filters.category === "ROOM" && entry.roomRevenue !== 0) ||
        (filters.category === "CHANNEL" && entry.channelRevenue !== 0) ||
        (filters.category === "MINIBAR" && entry.minibarRevenue !== 0) ||
        (filters.category === "LAUNDRY" && entry.laundryRevenue !== 0) ||
        (filters.category === "OTHER" && entry.otherRevenue !== 0);
      if (!matchesCategory) return false;
    }
    if (filters.paymentMethod) {
      const matchesPaymentMethod = entry.collections.some((collection) =>
        filters.paymentMethod === "OTHER"
          ? !STANDARD_PAYMENT_METHODS.has(collection.method)
          : collection.method === filters.paymentMethod,
      );
      if (!matchesPaymentMethod) return false;
    }
    if (filters.settlementStatus) {
      if (filters.settlementStatus === "SETTLED" && entry.closingBalance !== 0) return false;
      if (filters.settlementStatus === "UNPAID" && !(entry.closingBalance > 0)) return false;
      if (filters.settlementStatus === "OVERPAID" && !(entry.closingBalance < 0)) return false;
    }
    return true;
  });
}
export function totalRevenueBook(entries: RevenueBookEntry[]): RevenueBookTotals {
  const fields = ["roomRevenue", "channelRevenue", "minibarRevenue", "laundryRevenue", "otherRevenue", "revenueTotal", "closingBalance", "balanceAdjustment"] as const;
  const totals: RevenueBookTotals = { roomRevenue: 0, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, revenueTotal: 0, collectedTotal: 0, cashTotal: 0, bankTransferTotal: 0, otherCollectedTotal: 0, closingBalance: 0, balanceAdjustment: 0 };
  for (const field of fields) totals[field] = entries.reduce((total, entry) => total.add(entry[field]), decimal(0)).toNumber();
  for (const collection of entries.flatMap((entry) => entry.collections)) {
    totals.collectedTotal = decimal(totals.collectedTotal).add(collection.amount).toNumber();
    const field = collection.method === "CASH" ? "cashTotal" : collection.method === "BANK_TRANSFER" ? "bankTransferTotal" : "otherCollectedTotal";
    totals[field] = decimal(totals[field]).add(collection.amount).toNumber();
  }
  return totals;
}
export function assertBookLimit(count: number): void {
  if (count > 10000) throw new BadRequestException("Báo cáo vượt giới hạn 10.000 hồ sơ. Vui lòng chọn khoảng thời gian ngắn hơn hoặc liên hệ quản lý để đối soát.");
}
