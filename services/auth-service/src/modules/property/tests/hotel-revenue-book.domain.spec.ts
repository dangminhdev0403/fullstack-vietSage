import { Prisma } from "@prisma/client";
import { assertBookLimit, filterRevenueBookEntries, projectBookAccount, revenueCategory, totalRevenueBook, type BookAccount } from "../domain/hotel-revenue-book";
import { collectRevenueEntrySchema, createRevenueEntrySchema, revenueBookQuerySchema } from "../domain/schemas/hotel-revenue-book.schema";

const from = new Date("2026-11-12T17:00:00Z");
const end = new Date("2026-11-14T17:00:00Z");
const zone = "Asia/Ho_Chi_Minh";
const account = (values: Partial<BookAccount> = {}): BookAccount => ({
  id: "manual-1", source: "MANUAL", date: "2026-11-13", roomId: null, roomNumber: null,
  documentNumber: null, description: "Giặt ủi", category: "LAUNDRY", amount: 100,
  notes: null, declarationStatus: null, version: 1, voidedAt: null, charges: [], collections: [], ...values,
});

describe("hotel revenue book monetary projection", () => {
  it("recognizes Vietnamese service groups and preserves an explicit snapshot classification", () => {
    expect(revenueCategory("SERVICE", "Đồ uống")).toBe("MINIBAR");
    expect(revenueCategory("SERVICE", "Giặt ủi thuê ngoài")).toBe("LAUNDRY");
    expect(revenueCategory("SERVICE", "Giặt ủi", "OTHER")).toBe("OTHER");
    expect(revenueCategory("ROOM_CHARGE", "Phòng 101")).toBe("ROOM");
  });

  it("uses hotel-local dates, includes the first instant and excludes the next-period boundary", () => {
    const result = projectBookAccount(account({
      charges: [
        { date: new Date("2026-11-12T16:59:59Z"), amount: 100, category: "ROOM" },
        { date: from, amount: 30, category: "ROOM" },
        { date: new Date("2026-11-13T17:00:00Z"), amount: 40, category: "LAUNDRY" },
        { date: end, amount: 999, category: "OTHER" },
      ],
      collections: [
        { id: "old", date: new Date("2026-11-10T00:00:00Z"), amount: 10, method: "CASH" },
        { id: "cash", date: new Date("2026-11-13T00:00:00Z"), amount: 30, method: "CASH" },
      ],
    }), from, end, zone)!;
    expect(result.revenueLines.map((line) => [line.date, line.revenueTotal])).toEqual([["2026-11-13", 30], ["2026-11-14", 40]]);
    expect(result.openingBalance).toBe(90);
    expect(result.revenueTotal).toBe(70);
    expect(result.closingBalance).toBe(130);
    expect(result.collections.map((payment) => payment.id)).toEqual(["cash"]);
  });

  it("keeps dated voids and refunds in their own period instead of rewriting the original receipt", () => {
    const result = projectBookAccount(account({
      charges: [{ date: new Date("2026-11-01T00:00:00Z"), amount: 100, category: "ROOM" }, { date: from, amount: -100, category: "ROOM" }],
      collections: [{ id: "receipt", date: new Date("2026-11-01T00:00:00Z"), amount: 100, method: "CASH" }, { id: "refund", date: from, amount: -40, method: "CASH" }],
    }), from, end, zone)!;
    expect(result.openingBalance).toBe(0);
    expect(result.revenueTotal).toBe(-100);
    expect(result.closingBalance).toBe(-60);
    expect(totalRevenueBook([result])).toMatchObject({ collectedTotal: -40, cashTotal: -40, revenueTotal: -100, closingBalance: -60 });
  });

  it("cancels deposit credit transfers without counting allocation as another cash receipt", () => {
    const deposit = projectBookAccount(account({ id: "deposit", source: "DEPOSIT", charges: [], collections: [{ id: "receipt", date: new Date("2026-11-01T00:00:00Z"), amount: 100, method: "BANK_TRANSFER" }], adjustments: [{ date: from, amount: 100 }] }), from, end, zone)!;
    const folio = projectBookAccount(account({ id: "folio", source: "FOLIO", charges: [{ date: from, amount: 200, category: "ROOM" }], adjustments: [{ date: from, amount: -100 }] }), from, end, zone)!;
    expect(totalRevenueBook([deposit, folio])).toMatchObject({ openingBalance: -100, revenueTotal: 200, collectedTotal: 0, balanceAdjustment: 0, closingBalance: 100 });
  });

  it("adds currency amounts exactly and fails instead of silently truncating an oversized book", () => {
    const a = projectBookAccount(account({ charges: [{ date: from, amount: new Prisma.Decimal("0.1"), category: "OTHER" }] }), from, end, zone)!;
    const b = projectBookAccount(account({ id: "b", charges: [{ date: from, amount: new Prisma.Decimal("0.2"), category: "OTHER" }] }), from, end, zone)!;
    expect(totalRevenueBook([a, b]).revenueTotal).toBe(0.3);
    expect(() => assertBookLimit(10000)).not.toThrow();
    expect(() => assertBookLimit(10001)).toThrow("10.000");
  });

  it("accepts the frozen collection payload and rejects invalid dates, precision, and upfront overpayment", () => {
    expect(collectRevenueEntrySchema.parse({ receivedAt: "2026-11-13T02:00:00Z", amount: 50, method: "CASH", idempotencyKey: "collect-1", version: 1 })).toMatchObject({ version: 1 });
    expect(revenueBookQuerySchema.safeParse({ from: "2026-11-31", to: "2026-12-01" }).success).toBe(false);
    expect(revenueBookQuerySchema.safeParse({ from: "2026-11-01" }).success).toBe(false);
    expect(createRevenueEntrySchema.safeParse({ date: "2026-11-13", description: "Giặt ủi", category: "LAUNDRY", amount: 10.001, idempotencyKey: "create-1" }).success).toBe(false);
    expect(createRevenueEntrySchema.safeParse({ date: "2026-11-13", description: "Giặt ủi", category: "LAUNDRY", amount: 10, idempotencyKey: "create-1", collection: { receivedAt: "2026-11-13T02:00:00Z", amount: 11, method: "CASH" } }).success).toBe(false);
    expect(createRevenueEntrySchema.safeParse({
      date: "2026-11-13",
      description: "Giặt ủi",
      category: "LAUNDRY",
      amount: 100,
      idempotencyKey: "create-split-1",
      collection: {
        receivedAt: "2026-11-13T02:00:00Z",
        amount: 100,
        splits: [
          { method: "CASH", amount: 40 },
          { method: "BANK_TRANSFER", amount: 60 },
        ],
      },
    }).success).toBe(true);
    expect(collectRevenueEntrySchema.safeParse({
      receivedAt: "2026-11-13T02:00:00Z",
      amount: 100,
      splits: [
        { method: "CASH", amount: 40 },
        { method: "BANK_TRANSFER", amount: 50 },
      ],
      idempotencyKey: "collect-split-mismatch",
      version: 1,
    }).success).toBe(false);
  });

  it("validates multi-dimensional revenue book filter query parameters strictly", () => {
    expect(revenueBookQuerySchema.parse({
      category: "ROOM",
      paymentMethod: "BANK_TRANSFER",
      source: "FOLIO",
      settlementStatus: "UNPAID",
    })).toEqual({
      category: "ROOM",
      paymentMethod: "BANK_TRANSFER",
      source: "FOLIO",
      settlementStatus: "UNPAID",
    });
    expect(revenueBookQuerySchema.safeParse({ category: "SPA" }).success).toBe(false);
    expect(revenueBookQuerySchema.safeParse({ paymentMethod: "MOMO" }).success).toBe(false);
    expect(revenueBookQuerySchema.safeParse({ source: "EXPENSE" }).success).toBe(false);
    expect(revenueBookQuerySchema.safeParse({ settlementStatus: "PARTIAL" }).success).toBe(false);
    expect(revenueBookQuerySchema.safeParse({ unknownParam: "1" }).success).toBe(false);
  });

  it("filters entries by source, category, paymentMethod, settlementStatus, and combined dimensions", () => {
    const folioEntry = projectBookAccount(account({
      id: "folio:1",
      source: "FOLIO",
      category: null,
      amount: null,
      charges: [
        { date: from, amount: 500, category: "ROOM" },
        { date: from, amount: 50, category: "MINIBAR" },
      ],
      collections: [
        { id: "p-1", date: from, amount: 200, method: "BANK_TRANSFER" },
      ],
    }), from, end, zone)!; // closingBalance = +350 (UNPAID)

    const manualSettled = projectBookAccount(account({
      id: "manual-settled",
      source: "MANUAL",
      category: "LAUNDRY",
      amount: 100,
      charges: [{ date: from, amount: 100, category: "LAUNDRY" }],
      collections: [{ id: "p-2", date: from, amount: 100, method: "CASH" }],
    }), from, end, zone)!; // closingBalance = 0 (SETTLED)

    const manualAdvance = projectBookAccount(account({
      id: "manual-advance",
      source: "MANUAL",
      category: "OTHER",
      amount: 80,
      charges: [{ date: end, amount: 80, category: "OTHER" }],
      collections: [{ id: "p-3", date: from, amount: 80, method: "MOMO" }],
    }), from, end, zone)!; // closingBalance = -80 (OVERPAID), otherRevenue = 0 but category = OTHER

    const depositEntry = projectBookAccount(account({
      id: "deposit:1",
      source: "DEPOSIT",
      category: null,
      amount: null,
      charges: [],
      collections: [{ id: "p-4", date: from, amount: 300, method: "CARD" }],
    }), from, end, zone)!; // closingBalance = -300 (OVERPAID)

    const all = [folioEntry, manualSettled, manualAdvance, depositEntry];

    expect(filterRevenueBookEntries(all, {})).toHaveLength(4);
    expect(filterRevenueBookEntries(all, { source: "FOLIO" }).map((e) => e.id)).toEqual(["folio:1"]);
    expect(filterRevenueBookEntries(all, { source: "DEPOSIT" }).map((e) => e.id)).toEqual(["deposit:1"]);
    expect(filterRevenueBookEntries(all, { category: "MINIBAR" }).map((e) => e.id)).toEqual(["folio:1"]);
    expect(filterRevenueBookEntries(all, { category: "ROOM" }).map((e) => e.id)).toEqual(["folio:1"]);
    expect(filterRevenueBookEntries(all, { category: "LAUNDRY" }).map((e) => e.id)).toEqual(["manual-settled"]);
    expect(filterRevenueBookEntries(all, { category: "OTHER" }).map((e) => e.id)).toEqual(["manual-advance"]);

    expect(filterRevenueBookEntries(all, { paymentMethod: "CASH" }).map((e) => e.id)).toEqual(["manual-settled"]);
    expect(filterRevenueBookEntries(all, { paymentMethod: "BANK_TRANSFER" }).map((e) => e.id)).toEqual(["folio:1"]);
    expect(filterRevenueBookEntries(all, { paymentMethod: "CARD" }).map((e) => e.id)).toEqual(["deposit:1"]);
    expect(filterRevenueBookEntries(all, { paymentMethod: "OTHER" }).map((e) => e.id)).toEqual(["manual-advance"]);

    expect(filterRevenueBookEntries(all, { settlementStatus: "UNPAID" }).map((e) => e.id)).toEqual(["folio:1"]);
    expect(filterRevenueBookEntries(all, { settlementStatus: "SETTLED" }).map((e) => e.id)).toEqual(["manual-settled"]);
    expect(filterRevenueBookEntries(all, { settlementStatus: "OVERPAID" }).map((e) => e.id)).toEqual(["manual-advance", "deposit:1"]);

    expect(filterRevenueBookEntries(all, {
      source: "MANUAL",
      paymentMethod: "OTHER",
      settlementStatus: "OVERPAID",
    }).map((e) => e.id)).toEqual(["manual-advance"]);
  });

  it("reconciles opening VND 3,070,000 balance, room charge, supplemental minibar, deposit and payment (Verification Case 1)", () => {
    const priorDate = new Date("2026-10-25T01:00:00Z");
    const periodDate = new Date("2026-11-13T02:00:00Z");
    const laterDate = new Date("2026-11-14T03:00:00Z");

    const folioAccount = projectBookAccount(account({
      id: "folio:reconcile",
      source: "FOLIO",
      charges: [
        { date: priorDate, amount: 1150000, category: "ROOM" },
        { date: priorDate, amount: 1920000, category: "ROOM" },
        { date: periodDate, amount: 1500000, category: "ROOM" },
      ],
      collections: [
        { id: "p-late", date: laterDate, amount: 1000000, method: "BANK_TRANSFER" },
      ],
      adjustments: [
        { date: periodDate, amount: -500000 },
      ],
    }), from, end, zone)!;

    const manualMinibar = projectBookAccount(account({
      id: "manual:minibar",
      source: "MANUAL",
      category: "MINIBAR",
      amount: 250000,
      charges: [{ date: periodDate, amount: 250000, category: "MINIBAR" }],
      collections: [{ id: "c-cash", date: periodDate, amount: 250000, method: "CASH" }],
    }), from, end, zone)!;

    const depositEntry = projectBookAccount(account({
      id: "deposit:500k",
      source: "DEPOSIT",
      charges: [],
      collections: [{ id: "dep-col", date: periodDate, amount: 500000, method: "BANK_TRANSFER" }],
      adjustments: [
        { date: periodDate, amount: 500000 },
      ],
    }), from, end, zone)!;

    const entries = [folioAccount, manualMinibar, depositEntry];
    const totals = totalRevenueBook(entries);

    expect(totals.openingBalance).toBe(3070000);
    expect(totals.roomRevenue).toBe(1500000);
    expect(totals.minibarRevenue).toBe(250000);
    expect(totals.revenueTotal).toBe(1750000);

    expect(totals.cashTotal).toBe(250000);
    expect(totals.bankTransferTotal).toBe(1500000);
    expect(totals.collectedTotal).toBe(1750000);
    expect(totals.cashTotal + totals.bankTransferTotal + totals.otherCollectedTotal).toBe(totals.collectedTotal);

    expect(totals.balanceAdjustment).toBe(0);
    expect(totals.closingBalance).toBe(3070000);
    expect(totals.closingBalance).toBe(totals.openingBalance + totals.revenueTotal - totals.collectedTotal + totals.balanceAdjustment);
  });
});
