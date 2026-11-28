import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node strip-types requires explicit extensions.
import { buildRevenueBookWorkbook, otherServiceAmount } from "./revenue-book-export.ts";
import type { RevenueBook, RevenueBookEntry } from "../types/revenue-book-contract";

test("retains legacy service money while respecting an explicit modern zero", () => {
  assert.equal(otherServiceAmount({ minibarRevenue: 0.1, laundryRevenue: 0.2, otherRevenue: 15 }), 15.3);
  assert.equal(otherServiceAmount({ minibarRevenue: 20, otherServiceRevenue: 0 }), 0);
  assert.equal(otherServiceAmount(undefined), 0);
});

function account(overrides: Partial<RevenueBookEntry> = {}): RevenueBookEntry {
  return {
    id: "folio-1", source: "FOLIO", date: "2026-10-01", roomId: "room-1", roomNumber: "101", documentNumber: "PT-001",
    description: "Lưu trú phòng 101", category: null, amount: null, roomRevenue: 1000, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0,
    serviceCategoryRevenues: {}, otherServiceRevenue: 0,
    revenueTotal: 1000, closingBalance: 500, balanceAdjustment: 0,
    revenueLines: [
      { date: "2026-10-01", roomRevenue: 500, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 500 },
      { date: "2026-10-02", roomRevenue: 500, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 500 },
    ],
    collections: [
      { id: "bank-1", receivedAt: "2026-10-01T17:30:00Z", amount: 300, method: "BANK_TRANSFER", reference: "CK-001" },
      { id: "cash-1", receivedAt: "2026-10-03T02:00:00Z", amount: 200, method: "CASH", reference: null },
    ],
    notes: null, declarationStatus: "SUBMITTED", version: null, voidedAt: null,
    ...overrides,
  };
}

function book(entries: RevenueBookEntry[] = [account()]): RevenueBook {
  return {
    hotelId: "hotel-1", hotelName: "Khách sạn VietSage", timeZone: "Asia/Ho_Chi_Minh", currency: "VND", from: "2026-10-01", to: "2026-10-31",
    entries,
    serviceCategories: [{ id: "cat-laundry", name: "Giặt ủi", sortOrder: 40 }],
    rooms: [{ id: "room-1", number: "101" }],
    canManage: true,
    summary: {
      roomRevenue: 1000, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 1000,
      collectedTotal: 500, cashTotal: 200, bankTransferTotal: 300, otherCollectedTotal: 0, closingBalance: 500, balanceAdjustment: 0,
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

function rowsOf(
  report: RevenueBook,
  overrides?: Parameters<typeof buildRevenueBookWorkbook>[1],
): Record<string, string | number>[] {
  const xml = unzip(buildRevenueBookWorkbook(report, overrides)).get("xl/worksheets/sheet1.xml")!;
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

test("builds a real OOXML ZIP workbook with numeric money, merged revenue ledger headers and print layout", () => {
  const parts = unzip(buildRevenueBookWorkbook(book()));
  assert.equal(parts.size, 6);
  assert.match(parts.get("[Content_Types].xml")!, /spreadsheetml\.sheet\.main\+xml/);
  assert.match(parts.get("_rels/.rels")!, /Target="xl\/workbook.xml"/);
  assert.match(parts.get("xl/workbook.xml")!, /name="Sổ doanh thu"/);
  const sheet = parts.get("xl/worksheets/sheet1.xml")!;
  assert.match(sheet, /mergeCell ref="F5:I5"/);
  assert.match(sheet, /pane ySplit="8"/);
  assert.match(sheet, /orientation="landscape"/);
  assert.match(sheet, /Còn nợ/);
  assert.match(sheet, /Thanh toán khác/);
  assert.match(sheet, /<c r="F9" s="3"><v>500<\/v>/);
  assert.match(sheet, /<c r="A9" s="6"><v>1<\/v>/, "Sequence numbers are not formatted as money");
});

test("allocates revenue and receipts to their actual dates without duplicating multi-day stay revenue", () => {
  const rows = rowsOf(book());
  const details = rows.filter((row) => typeof row.A === "number");
  assert.equal(details.length, 3);
  assert.equal(details.reduce((sum, row) => sum + Number(row.I ?? 0), 0), 1000);
  assert.equal(details.reduce((sum, row) => sum + Number(row.N ?? 0), 0), 500);
  assert.equal(details.filter((row) => row.P !== undefined).length, 1, "Closing account balance appears once");
  assert.deepEqual(details.map((row) => [row.B, row.I ?? 0, row.N ?? 0]), [
    ["01/10/2026", 500, 0], ["02/10/2026", 500, 300], ["03/10/2026", 0, 200],
  ]);
  assert.equal(details[1].J, "02/10/2026");
  assert.equal(details[1].L, "00:30", "Transfer time uses hotel time, crossing UTC midnight");
  const daily = rows.filter((row) => String(row.A).startsWith("Cộng ngày"));
  assert.deepEqual(daily.map((row) => [row.A, row.I, row.N]), [
    ["Cộng ngày 01/10/2026", 500, 0], ["Cộng ngày 02/10/2026", 500, 300], ["Cộng ngày 03/10/2026", 0, 200],
  ]);
  assert.equal(rows.find((row) => row.A === "TỔNG KỲ")!.P, 500);
});

test("multiple same-day receipts retain one revenue row and exact cent totals", () => {
  const entry = account({
    revenueLines: [{ date: "2026-10-01", roomRevenue: 1, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 1 }],
    collections: [
      { id: "a", amount: 0.1, method: "CASH", receivedAt: "2026-10-01T00:00:00Z", reference: null },
      { id: "b", amount: 0.2, method: "CARD", receivedAt: "2026-10-01T01:00:00Z", reference: null },
    ],
  });
  const rows = rowsOf(book([entry]));
  const details = rows.filter((row) => typeof row.A === "number");
  assert.equal(details.length, 2);
  assert.equal(details.filter((row) => row.I !== undefined).length, 1);
  assert.equal(details[1].O, 0.2, "Card payment remains an explicit other payment");
  assert.equal(rows.find((row) => String(row.A).startsWith("Cộng ngày"))!.N, 0.3);
});

test("declaration status uses Vietnamese labels with a safe unknown fallback and blank null", () => {
  for (const [status, label] of [["SUBMITTED", "Đã khai báo"], ["READY", "Chờ gửi"], ["FUTURE_STATUS", "Chưa xác định"], [null, undefined]] as const) {
    const details = rowsOf(book([account({ declarationStatus: status })])).filter((row) => typeof row.A === "number");
    assert.ok(details.length > 0);
    assert.ok(details.every((row) => row.Q === label), `Status ${status} should display ${label}`);
  }
});

test("old-debt collections do not become revenue and opening balance row is omitted", () => {
  const debt = account({ date: "2026-09-15", revenueTotal: 0, revenueLines: [], closingBalance: -60,
    collections: [{ id: "old", amount: 60, method: "CASH", receivedAt: "2026-10-05T00:00:00Z", reference: null }],
  });
  const report = book([debt]);
  report.summary = { ...report.summary, revenueTotal: 0, roomRevenue: 0, collectedTotal: 60, cashTotal: 60, bankTransferTotal: 0, closingBalance: -60 };
  const rows = rowsOf(report);
  const details = rows.filter((row) => typeof row.A === "number");
  assert.equal(details.reduce((sum, row) => sum + Number(row.I ?? 0), 0), 0);
  assert.equal(details.find((row) => row.N === 60)!.B, "05/10/2026");
  assert.equal(rows.find((row) => row.A === "Công nợ đầu kỳ"), undefined);
  assert.equal(rows.find((row) => row.A === "TỔNG KỲ")!.P, -60);
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
  report.summary = { roomRevenue: 0, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 0, collectedTotal: 0, cashTotal: 0, bankTransferTotal: 0, otherCollectedTotal: 0, closingBalance: -500, balanceAdjustment: 0 };
  const rows = rowsOf(report);
  assert.equal(rows.filter((row) => typeof row.A === "number").length, 0);
  assert.equal(rows.find((row) => row.A === "TỔNG KỲ")!.P, -500);
});

test("rejects invalid numeric money instead of emitting a broken workbook", () => {
  const report = book();
  report.summary.revenueTotal = Number.NaN;
  assert.throws(() => buildRevenueBookWorkbook(report), /số tiền không hợp lệ/);
});

test("merges split cash + bank transfer payments onto one row and omits transfer time for cash-only rows", () => {
  const splitEntry = account({
    id: "folio-split",
    revenueLines: [
      { date: "2026-10-02", roomRevenue: 1_000_000, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 1_000_000 },
    ],
    collections: [
      { id: "leg-cash", receivedAt: "2026-10-02T07:25:00Z", amount: 400_000, method: "CASH", reference: "P-1", splitGroupId: "grp-1" },
      { id: "leg-bank", receivedAt: "2026-10-02T07:25:00Z", amount: 600_000, method: "BANK_TRANSFER", reference: "P-2", splitGroupId: "grp-1" },
    ],
    roomRevenue: 1_000_000,
    revenueTotal: 1_000_000,
    closingBalance: 0,
  });
  const cashOnlyEntry = account({
    id: "folio-cash",
    roomNumber: "102",
    revenueLines: [
      { date: "2026-10-02", roomRevenue: 500_000, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 500_000 },
    ],
    collections: [
      { id: "only-cash", receivedAt: "2026-10-02T09:10:00Z", amount: 500_000, method: "CASH", reference: "P-3" },
    ],
    roomRevenue: 500_000,
    revenueTotal: 500_000,
    closingBalance: 0,
  });

  const report = book([splitEntry, cashOnlyEntry]);
  report.summary = {
    roomRevenue: 1_500_000, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 1_500_000,
    collectedTotal: 1_500_000, cashTotal: 900_000, bankTransferTotal: 600_000, otherCollectedTotal: 0,
    closingBalance: 0, balanceAdjustment: 0,
  };
  const rows = rowsOf(report);
  const details = rows.filter((row) => typeof row.A === "number");
  assert.equal(details.length, 2, "Split payment merges into 1 row alongside cash-only row");

  const splitRow = details.find((row) => row.C === "101")!;
  assert.equal(splitRow.K, 400_000, "Cash column shows cash leg");
  assert.equal(splitRow.L, "14:25", "Transfer time column shows bank transfer time in Asia/Ho_Chi_Minh");
  assert.equal(splitRow.M, 600_000, "Bank transfer column shows bank leg");
  assert.equal(splitRow.N, 1_000_000, "Total payment column sums cash + bank transfer");

  const cashRow = details.find((row) => row.C === "102")!;
  assert.equal(cashRow.K, 500_000);
  assert.equal(cashRow.L, undefined, "Cash-only row must not display Giờ CK");
  assert.equal(cashRow.M, 0);
  assert.equal(cashRow.N, 500_000);
});

test("folds minibar revenue into other revenue and ignores payment/time text overrides on export", () => {
  const entry = account({
    id: "folio-minibar",
    roomNumber: "205",
    roomRevenue: 1_000_000,
    minibarRevenue: 120_000,
    laundryRevenue: 50_000,
    otherRevenue: 30_000,
    serviceCategoryRevenues: { "cat-laundry": 50_000 },
    otherServiceRevenue: 150_000,
    revenueTotal: 1_200_000,
    closingBalance: 0,
    revenueLines: [
      {
        date: "2026-10-05",
        roomRevenue: 1_000_000,
        channelRevenue: 0,
        minibarRevenue: 120_000,
        laundryRevenue: 50_000,
        otherRevenue: 30_000,
        serviceCategoryRevenues: { "cat-laundry": 50_000 },
        otherServiceRevenue: 150_000,
        revenueTotal: 1_200_000,
      },
    ],
    collections: [
      {
        id: "cash-only",
        receivedAt: "2026-10-05T03:15:00Z",
        amount: 1_200_000,
        method: "CASH",
        reference: "PT-205",
      },
    ],
  });
  const report = book([entry]);
  report.summary = {
    roomRevenue: 1_000_000,
    channelRevenue: 0,
    minibarRevenue: 120_000,
    laundryRevenue: 50_000,
    otherRevenue: 30_000,
    serviceCategoryRevenues: { "cat-laundry": 50_000 },
    otherServiceRevenue: 150_000,
    revenueTotal: 1_200_000,
    collectedTotal: 1_200_000,
    cashTotal: 1_200_000,
    bankTransferTotal: 0,
    otherCollectedTotal: 0,
    closingBalance: 0,
    balanceAdjustment: 0,
  };
  const rowKey = "folio-minibar_2026-10-05_cash-only";
  const xml = unzip(
    buildRevenueBookWorkbook(report, {
      textOverrides: {
        [`hotel-1:roomNumber:${rowKey}`]: "205A",
        [`hotel-1:paymentDate:${rowKey}`]: "99/99/2099",
        [`hotel-1:bankTime:${rowKey}`]: "11",
      },
    }),
  ).get("xl/worksheets/sheet1.xml")!;
  const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
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
  const detail = rows.find((row) => row.A === 1)!;
  assert.equal(detail.C, "205A", "Non-financial room text override still applies");
  assert.equal(detail.F, 1_000_000);
  assert.equal(detail.G, 50_000);
  assert.equal(detail.H, 150_000, "Other revenue includes minibar revenue so columns reconcile");
  assert.equal(detail.I, 1_200_000);
  assert.equal(detail.J, "05/10/2026", "Payment date ignores tampered text override");
  assert.equal(detail.L, undefined, "Bank transfer time ignores tampered text override");
  const totalRow = rows.find((row) => row.A === "TỔNG KỲ")!;
  assert.equal(totalRow.H, 150_000);
  assert.equal(totalRow.I, 1_200_000);
});

test("reconciles in-period room charge, supplemental minibar, deposit, and later payment with Excel parity (Verification Case 1)", () => {
  const folioEntry = account({
    id: "folio-reconcile",
    roomNumber: "101",
    documentNumber: "F-001",
    description: "Khách lưu trú phòng 101",
    roomRevenue: 1_500_000,
    revenueTotal: 1_500_000,
    closingBalance: 0,
    balanceAdjustment: -500_000,
    revenueLines: [
      { date: "2026-10-02", roomRevenue: 1_500_000, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 1_500_000 },
    ],
    collections: [
      { id: "bank-late", receivedAt: "2026-10-04T08:00:00Z", amount: 1_000_000, method: "BANK_TRANSFER", reference: "CK-101" },
    ],
    notes: "Khách hẹn chuyển khoản nốt",
  });

  const minibarEntry = account({
    id: "manual-minibar",
    source: "MANUAL",
    roomNumber: null,
    documentNumber: "PT-MB01",
    description: "Minibar bổ sung ngoài danh mục",
    category: "MINIBAR",
    minibarRevenue: 250_000,
    otherRevenue: 0,
    otherServiceRevenue: 250_000,
    revenueTotal: 250_000,
    closingBalance: 0,
    balanceAdjustment: 0,
    revenueLines: [
      { date: "2026-10-02", roomRevenue: 0, channelRevenue: 0, minibarRevenue: 250_000, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 250_000, revenueTotal: 250_000 },
    ],
    collections: [
      { id: "cash-mb", receivedAt: "2026-10-02T10:00:00Z", amount: 250_000, method: "CASH", reference: null },
    ],
    notes: "Đã thu tiền mặt tại quầy",
  });

  const depositEntry = account({
    id: "deposit-500k",
    source: "DEPOSIT",
    roomNumber: "101",
    documentNumber: "R-100",
    description: "Tiền đặt cọc · Khách lưu trú",
    revenueTotal: 0,
    closingBalance: 0,
    balanceAdjustment: 500_000,
    revenueLines: [],
    collections: [
      { id: "dep-pay", receivedAt: "2026-10-02T04:00:00Z", amount: 500_000, method: "BANK_TRANSFER", reference: "CK-COC" },
    ],
    notes: "Cọc qua tài khoản Vietcombank",
  });

  const report = book([folioEntry, minibarEntry, depositEntry]);
  report.summary = {
    roomRevenue: 1_500_000,
    channelRevenue: 0,
    minibarRevenue: 250_000,
    laundryRevenue: 0,
    otherRevenue: 0,
    serviceCategoryRevenues: {},
    otherServiceRevenue: 250_000,
    revenueTotal: 1_750_000,
    collectedTotal: 1_750_000,
    cashTotal: 250_000,
    bankTransferTotal: 1_500_000,
    otherCollectedTotal: 0,
    closingBalance: 0,
    balanceAdjustment: 0,
  };

  const rows = rowsOf(report);
  const totalRow = rows.find((row) => row.A === "TỔNG KỲ")!;

  assert.equal(rows.find((row) => row.A === "Công nợ đầu kỳ"), undefined);
  assert.equal(report.summary.closingBalance, 0);
  assert.equal(
    report.summary.closingBalance,
    report.summary.revenueTotal - report.summary.collectedTotal + report.summary.balanceAdjustment,
  );
  assert.equal(report.summary.cashTotal + report.summary.bankTransferTotal + report.summary.otherCollectedTotal, report.summary.collectedTotal);

  assert.equal(totalRow.F, 1_500_000, "Room revenue matches in Excel");
  assert.equal(totalRow.H, 250_000, "Other revenue (including minibar) matches in Excel");
  assert.equal(totalRow.I, 1_750_000, "Total revenue matches in Excel");
  assert.equal(totalRow.K, 250_000, "Cash matches in Excel");
  assert.equal(totalRow.M, 1_500_000, "Bank transfer matches in Excel");
  assert.equal(totalRow.N, 1_750_000, "Total collected matches in Excel");
  assert.equal(totalRow.P, 0, "Closing balance matches in Excel");

  const details = rows.filter((row) => typeof row.A === "number");
  const folioRow = details.find((row) => row.C === "101" && row.D === "F-001")!;
  assert.equal(folioRow.R, "Khách hẹn chuyển khoản nốt", "Authoritative note appears in Excel column R");
});

test("folds channelRevenue into roomRevenue by default and separates Doanh thu Kênh bán when showChannelRevenue is enabled", () => {
  const otaEntry = account({
    id: "folio-ota",
    roomNumber: "201",
    roomRevenue: 0,
    channelRevenue: 1_200_000,
    revenueTotal: 1_200_000,
    closingBalance: 0,
    revenueLines: [
      { date: "2026-10-06", roomRevenue: 0, channelRevenue: 1_200_000, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 1_200_000 },
    ],
    collections: [
      { id: "ota-bank", receivedAt: "2026-10-06T05:00:00Z", amount: 1_200_000, method: "BANK_TRANSFER", reference: "OTA-1" },
    ],
  });
  const directEntry = account({
    id: "folio-direct",
    roomNumber: "202",
    roomRevenue: 800_000,
    channelRevenue: 0,
    revenueTotal: 800_000,
    closingBalance: 0,
    revenueLines: [
      { date: "2026-10-06", roomRevenue: 800_000, channelRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, serviceCategoryRevenues: {}, otherServiceRevenue: 0, revenueTotal: 800_000 },
    ],
    collections: [
      { id: "dir-cash", receivedAt: "2026-10-06T06:00:00Z", amount: 800_000, method: "CASH", reference: null },
    ],
  });
  const report = book([otaEntry, directEntry]);
  report.summary = {
    roomRevenue: 800_000,
    channelRevenue: 1_200_000,
    minibarRevenue: 0,
    laundryRevenue: 0,
    otherRevenue: 0,
    serviceCategoryRevenues: {},
    otherServiceRevenue: 0,
    revenueTotal: 2_000_000,
    collectedTotal: 2_000_000,
    cashTotal: 800_000,
    bankTransferTotal: 1_200_000,
    otherCollectedTotal: 0,
    closingBalance: 0,
    balanceAdjustment: 0,
  };

  // Default (hidden): 18 columns A..R, channelRevenue folded into room column F
  const hiddenSheet = unzip(buildRevenueBookWorkbook(report)).get("xl/worksheets/sheet1.xml")!;
  assert.doesNotMatch(hiddenSheet, /Doanh thu Kênh bán/);
  assert.match(hiddenSheet, /mergeCell ref="F5:I5"/);
  const hiddenRows = rowsOf(report);
  const hiddenTotal = hiddenRows.find((row) => row.A === "TỔNG KỲ")!;
  assert.equal(hiddenTotal.F, 2_000_000);
  assert.equal(hiddenTotal.I, 2_000_000);

  // Enabled: 19 columns A..S, channelRevenue separated into column G
  const shownSheet = unzip(buildRevenueBookWorkbook(report, { showChannelRevenue: true })).get("xl/worksheets/sheet1.xml")!;
  assert.match(shownSheet, /Doanh thu Kênh bán/);
  assert.match(shownSheet, /mergeCell ref="F5:J5"/);
  assert.match(shownSheet, /dimension ref="A1:S/);
  const shownRows = rowsOf(report, { showChannelRevenue: true });
  const shownDetails = shownRows.filter((row) => typeof row.A === "number");
  const otaRow = shownDetails.find((row) => row.C === "201")!;
  assert.equal(otaRow.F, 0);
  assert.equal(otaRow.G, 1_200_000);
  assert.equal(otaRow.J, 1_200_000);
  const shownTotal = shownRows.find((row) => row.A === "TỔNG KỲ")!;
  assert.equal(shownTotal.F, 800_000);
  assert.equal(shownTotal.G, 1_200_000);
  assert.equal(shownTotal.J, 2_000_000);
  assert.equal(shownTotal.O, 2_000_000);
  assert.equal(shownTotal.Q, 0);
});

test("renders dynamic active serviceCategories columns in Excel and folds hidden categories into other service revenue", () => {
  const entry = account({
    id: "folio-dynamic",
    roomNumber: "301",
    roomRevenue: 1_000_000,
    channelRevenue: 0,
    serviceCategoryRevenues: {
      "cat-roomsvc": 100_000,
      "cat-laundry": 80_000,
      "cat-drinks": 60_000,
      "cat-concierge": 200_000,
    },
    otherServiceRevenue: 50_000,
    revenueTotal: 1_490_000,
    closingBalance: 0,
    revenueLines: [
      {
        date: "2026-10-08",
        roomRevenue: 1_000_000,
        channelRevenue: 0,
        minibarRevenue: 60_000,
        laundryRevenue: 80_000,
        otherRevenue: 350_000,
        serviceCategoryRevenues: {
          "cat-roomsvc": 100_000,
          "cat-laundry": 80_000,
          "cat-drinks": 60_000,
          "cat-concierge": 200_000,
        },
        otherServiceRevenue: 50_000,
        revenueTotal: 1_490_000,
      },
    ],
    collections: [
      { id: "pay-dyn", receivedAt: "2026-10-08T04:00:00Z", amount: 1_490_000, method: "CASH", reference: null },
    ],
  });
  const report = book([entry]);
  report.serviceCategories = [
    { id: "cat-roomsvc", name: "Dịch vụ phòng", sortOrder: 10 },
    { id: "cat-laundry", name: "Giặt ủi", sortOrder: 40 },
    { id: "cat-housekeeping", name: "Dọn phòng", sortOrder: 60 },
    { id: "cat-maint", name: "Bảo trì", sortOrder: 70 },
    { id: "cat-drinks", name: "Đồ uống", sortOrder: 80 },
    { id: "cat-concierge", name: "Concierge", sortOrder: 100 },
  ];
  report.summary = {
    roomRevenue: 1_000_000,
    channelRevenue: 0,
    minibarRevenue: 60_000,
    laundryRevenue: 80_000,
    otherRevenue: 350_000,
    serviceCategoryRevenues: {
      "cat-roomsvc": 100_000,
      "cat-laundry": 80_000,
      "cat-drinks": 60_000,
      "cat-concierge": 200_000,
    },
    otherServiceRevenue: 50_000,
    revenueTotal: 1_490_000,
    collectedTotal: 1_490_000,
    cashTotal: 1_490_000,
    bankTransferTotal: 0,
    otherCollectedTotal: 0,
    closingBalance: 0,
    balanceAdjustment: 0,
  };

  // All 6 active categories visible -> 23 columns (A..W):
  // F=Tiền phòng, G=Dịch vụ phòng, H=Giặt ủi, I=Dọn phòng, J=Bảo trì, K=Đồ uống, L=Concierge, M=Dịch vụ khác, N=Tổng doanh thu
  const fullSheet = unzip(buildRevenueBookWorkbook(report)).get("xl/worksheets/sheet1.xml")!;
  assert.match(fullSheet, /dimension ref="A1:W/);
  assert.match(fullSheet, /Dịch vụ phòng/);
  assert.match(fullSheet, /Concierge/);
  const fullRows = rowsOf(report);
  const fullTotal = fullRows.find((row) => row.A === "TỔNG KỲ")!;
  assert.equal(fullTotal.F, 1_000_000);
  assert.equal(fullTotal.G, 100_000);
  assert.equal(fullTotal.H, 80_000);
  assert.equal(fullTotal.I, 0);
  assert.equal(fullTotal.J, 0);
  assert.equal(fullTotal.K, 60_000);
  assert.equal(fullTotal.L, 200_000);
  assert.equal(fullTotal.M, 50_000);
  assert.equal(fullTotal.N, 1_490_000);

  // Hide Concierge -> folds 200_000 into Dịch vụ khác (50_000 + 200_000 = 250_000)
  const hiddenRows = rowsOf(report, { hiddenServiceCategoryIds: ["cat-concierge"] });
  const hiddenTotal = hiddenRows.find((row) => row.A === "TỔNG KỲ")!;
  assert.equal(hiddenTotal.L, 250_000);
  assert.equal(hiddenTotal.M, 1_490_000);
});
