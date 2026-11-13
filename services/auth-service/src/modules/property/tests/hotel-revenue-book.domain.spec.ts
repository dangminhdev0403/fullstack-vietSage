import { Prisma } from "@prisma/client";
import { assertBookLimit, projectBookAccount, revenueCategory, totalRevenueBook, type BookAccount } from "../domain/hotel-revenue-book";
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
  });
});
