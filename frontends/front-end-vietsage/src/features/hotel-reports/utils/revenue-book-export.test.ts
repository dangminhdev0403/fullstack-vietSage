import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node strip-types requires explicit extensions.
import { buildRevenueBookWorkbook } from "./revenue-book-export.ts";
import type { RevenueBook, RevenueBookEntry } from "../types/revenue-book-contract";

function account(overrides: Partial<RevenueBookEntry> = {}): RevenueBookEntry {
  return {
    id: "folio-1", source: "FOLIO", date: "2026-10-01", roomId: "room-1", roomNumber: "101", documentNumber: "PT-001",
    description: "Lưu trú phòng 101", category: null, amount: null, roomRevenue: 1000, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0,
    revenueTotal: 1000, openingBalance: 0, closingBalance: 500, balanceAdjustment: 0,
    revenueLines: [
      { date: "2026-10-01", roomRevenue: 500, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, revenueTotal: 500 },
      { date: "2026-10-02", roomRevenue: 500, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, revenueTotal: 500 },
    ],
    collections: [
      { id: "bank-1", receivedAt: "2026-10-01T17:30:00Z", amount: 300, method: "BANK_TRANSFER", reference: "CK-001" },
      { id: "cash-1", receivedAt: "2026-10-03T02:00:00Z", amount: 200, method: "CASH", reference: null },
    ],
    notes: null, declarationStatus: "Đã khai báo", version: null, voidedAt: null,
    ...overrides,
  };
}

function book(entries: RevenueBookEntry[] = [account()]): RevenueBook {
  return {
    hotelId: "hotel-1", hotelName: "Khách sạn A21", timeZone: "Asia/Ho_Chi_Minh", currency: "VND", from: "2026-10-01", to: "2026-10-31",
    entries, rooms: [{ id: "room-1", number: "101" }], canManage: true,
    summary: {
      roomRevenue: 1000, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, revenueTotal: 1000,
      collectedTotal: 500, cashTotal: 200, bankTransferTotal: 300, otherCollectedTotal: 0, openingBalance: 0, closingBalance: 500, balanceAdjustment: 0,
    },
  };
}

function unzip(bytes: Uint8Array): Map<string, string> {
  const archive = Buffer.from(bytes);
  assert.equal(archive.readUInt32LE(0), 0x04034b50);
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  const count = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);
  const entries = new Map<string, string>();
  for (let index = 0; index < count; index++) {
    assert.equal(archive.readUInt32LE(cursor), 0x02014b50);
    assert.equal(archive.readUInt16LE(cursor + 10), 0, "Archive entries use stored ZIP compression");
    const size = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const local = archive.readUInt32LE(cursor + 42);
    assert.equal(archive.readUInt32LE(local), 0x04034b50);
    assert.equal(archive.readUInt32LE(local + 14), archive.readUInt32LE(cursor + 16), "Local and central CRC agree");
    const name = archive.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    entries.set(name, archive.toString("utf8", start, start + size));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, end);
  return entries;
}

function rowsOf(report: RevenueBook): Record<string, string | number>[] {
  const xml = unzip(buildRevenueBookWorkbook(report)).get("xl/worksheets/sheet1.xml")!;
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells: Record<string, string | number> = {};
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const column = cell[1].match(/r="([A-Z]+)\d+"/)?.[1];
      if (!column || !cell[2]) continue;
      const number = cell[2].match(/<v>([^<]+)<\/v>/)?.[1];
      const text = cell[2].match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1];
      if (number !== undefined) cells[column] = Number(number);
      else if (text !== undefined) cells[column] = text;
    }
    return cells;
  });
}

test("builds a real OOXML ZIP workbook with numeric money, merged A21 headers and print layout", () => {
  const parts = unzip(buildRevenueBookWorkbook(book()));
  assert.equal(parts.size, 6);
  assert.match(parts.get("[Content_Types].xml")!, /spreadsheetml\.sheet\.main\+xml/);
  assert.match(parts.get("_rels/.rels")!, /Target="xl\/workbook.xml"/);
  assert.match(parts.get("xl/workbook.xml")!, /name="Sổ doanh thu"/);
  const sheet = parts.get("xl/worksheets/sheet1.xml")!;
  assert.match(sheet, /mergeCell ref="F6:J6"/);
  assert.match(sheet, /pane ySplit="8"/);
  assert.match(sheet, /orientation="landscape"/);
  assert.match(sheet, /Còn nợ cuối kỳ/);
  assert.match(sheet, /Thanh toán khác/);
  assert.match(sheet, /<c r="F9" s="3"><v>500<\/v>/);
  assert.match(sheet, /<c r="A9" s="6"><v>1<\/v>/, "Sequence numbers are not formatted as money");
});

test("allocates revenue and receipts to their actual dates without duplicating multi-day stay revenue", () => {
  const rows = rowsOf(book());
  const details = rows.filter((row) => typeof row.A === "number");
  assert.equal(details.length, 3);
  assert.equal(details.reduce((sum, row) => sum + Number(row.J ?? 0), 0), 1000);
  assert.equal(details.reduce((sum, row) => sum + Number(row.O ?? 0), 0), 500);
  assert.equal(details.filter((row) => row.Q !== undefined).length, 1, "Closing account balance appears once");
  assert.deepEqual(details.map((row) => [row.B, row.J ?? 0, row.O ?? 0]), [
    ["01/10/2026", 500, 0], ["02/10/2026", 500, 300], ["03/10/2026", 0, 200],
  ]);
  assert.equal(details[1].K, "02/10/2026");
  assert.equal(details[1].M, "00:30", "Transfer time uses hotel time, crossing UTC midnight");
  const daily = rows.filter((row) => String(row.A).startsWith("Cộng ngày"));
  assert.deepEqual(daily.map((row) => [row.A, row.J, row.O]), [
    ["Cộng ngày 01/10/2026", 500, 0], ["Cộng ngày 02/10/2026", 500, 300], ["Cộng ngày 03/10/2026", 0, 200],
  ]);
  assert.equal(rows.find((row) => row.A === "TỔNG KỲ")!.Q, 500);
});

test("multiple same-day receipts retain one revenue row and exact cent totals", () => {
  const entry = account({
    revenueLines: [{ date: "2026-10-01", roomRevenue: 1, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, revenueTotal: 1 }],
    collections: [
      { id: "a", amount: 0.1, method: "CASH", receivedAt: "2026-10-01T00:00:00Z", reference: null },
      { id: "b", amount: 0.2, method: "CARD", receivedAt: "2026-10-01T01:00:00Z", reference: null },
    ],
  });
  const rows = rowsOf(book([entry]));
  const details = rows.filter((row) => typeof row.A === "number");
  assert.equal(details.length, 2);
  assert.equal(details.filter((row) => row.J !== undefined).length, 1);
  assert.equal(details[1].P, 0.2, "Card payment remains an explicit other payment");
  assert.equal(rows.find((row) => String(row.A).startsWith("Cộng ngày"))!.O, 0.3);
});

test("old-debt collections do not become revenue and carry-only accounts keep an undated balance", () => {
  const debt = account({ date: "2026-09-15", revenueTotal: 0, revenueLines: [], openingBalance: 100, closingBalance: 40,
    collections: [{ id: "old", amount: 60, method: "CASH", receivedAt: "2026-10-05T00:00:00Z", reference: null }],
  });
  const carry = account({ id: "carry", revenueLines: [], collections: [], openingBalance: 50, closingBalance: 50 });
  const report = book([debt, carry]);
  report.summary = { ...report.summary, revenueTotal: 0, roomRevenue: 0, collectedTotal: 60, cashTotal: 60, bankTransferTotal: 0, openingBalance: 150, closingBalance: 90 };
  const rows = rowsOf(report);
  const details = rows.filter((row) => typeof row.A === "number");
  assert.equal(details.reduce((sum, row) => sum + Number(row.J ?? 0), 0), 0);
  assert.equal(details.find((row) => row.O === 60)!.B, "05/10/2026");
  assert.equal(details.find((row) => row.Q === 50)!.B, undefined);
  assert.equal(rows.find((row) => row.A === "Công nợ đầu kỳ")!.Q, 150);
  assert.equal(rows.find((row) => row.A === "TỔNG KỲ")!.Q, 90);
});

test("untrusted names remain escaped inline strings and cannot inject formulas or XML", () => {
  const report = book([account({ description: '=HYPERLINK("https://example.invalid") & <row>\u0001', notes: "+SUM(A1:A9)", documentNumber: "@malicious" })]);
  report.hotelName = "A & B <hotel>";
  const xml = [...unzip(buildRevenueBookWorkbook(report)).values()].join("\n");
  assert.match(xml, /A &amp; B &lt;HOTEL&gt;/);
  assert.match(xml, /=HYPERLINK\(&quot;https:\/\/example.invalid&quot;\) &amp; &lt;row&gt;/);
  assert.match(xml, /\+SUM\(A1:A9\)/);
  assert.doesNotMatch(xml, /<f\b|\u0001/);
});

test("exports empty periods and credits using authoritative summary balances", () => {
  const report = book([]);
  report.summary = { roomRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, revenueTotal: 0, collectedTotal: 0, cashTotal: 0, bankTransferTotal: 0, otherCollectedTotal: 0, openingBalance: -500, closingBalance: -500, balanceAdjustment: 0 };
  const rows = rowsOf(report);
  assert.equal(rows.filter((row) => typeof row.A === "number").length, 0);
  assert.equal(rows.find((row) => row.A === "TỔNG KỲ")!.Q, -500);
});

test("rejects invalid numeric money instead of emitting a broken workbook", () => {
  const report = book();
  report.summary.revenueTotal = Number.NaN;
  assert.throws(() => buildRevenueBookWorkbook(report), /số tiền không hợp lệ/);
});
