import type { RevenueBook, RevenueBookEntry } from "../types/revenue-book-contract";

type Revenue = Pick<RevenueBookEntry, "roomRevenue" | "minibarRevenue" | "laundryRevenue" | "otherRevenue" | "revenueTotal">;
type Collection = RevenueBookEntry["collections"][number];
type Activity = { entry: RevenueBookEntry; date: string; revenue?: Revenue; collection?: Collection; closing?: number };
type Cell = string | number | null | undefined;
const encoder = new TextEncoder();
const columns = "ABCDEFGHIJKLMNOPQRS";
const emptyRevenue = (): Revenue => ({ roomRevenue: 0, minibarRevenue: 0, laundryRevenue: 0, otherRevenue: 0, revenueTotal: 0 });
const addMoney = (left: number, right: number) => (Math.round(left * 100) + Math.round(right * 100)) / 100;

function escapeXml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function cell(value: Cell, column: number, row: number, total = false): string {
  const address = `${columns[column]}${row}`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Báo cáo có số tiền không hợp lệ.");
    return `<c r="${address}" s="${total ? 5 : column === 0 ? 6 : 3}"><v>${value}</v></c>`;
  }
  if (value == null || value === "") return `<c r="${address}" s="${total ? 4 : 6}"/>`;
  // All user text is an inline string, including values beginning with =, +, - or @.
  return `<c r="${address}" s="${total ? 4 : 6}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function dateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function localParts(instant: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function buildActivities(book: RevenueBook): Activity[] {
  const activities: Activity[] = [];
  for (const entry of book.entries) {
    const dates = new Map<string, { revenue: Revenue; hasRevenue: boolean; collections: Collection[] }>();
    const day = (date: string) => {
      if (!dates.has(date)) dates.set(date, { revenue: emptyRevenue(), hasRevenue: false, collections: [] });
      return dates.get(date)!;
    };
    for (const line of entry.revenueLines) {
      const group = day(line.date);
      group.hasRevenue = true;
      for (const key of Object.keys(group.revenue) as Array<keyof Revenue>) group.revenue[key] = addMoney(group.revenue[key], line[key]);
    }
    for (const collection of entry.collections) day(localParts(collection.receivedAt, book.timeZone).date).collections.push(collection);
    const ownActivities: Activity[] = [];
    for (const [date, group] of [...dates.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      group.collections.sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
      for (let index = 0; index < Math.max(1, group.collections.length); index++) {
        ownActivities.push({ entry, date, revenue: index === 0 && group.hasRevenue ? group.revenue : undefined, collection: group.collections[index] });
      }
    }
    if (ownActivities.length === 0) ownActivities.push({ entry, date: "" });
    ownActivities[ownActivities.length - 1].closing = entry.closingBalance;
    activities.push(...ownActivities);
  }
  return activities.sort((left, right) => left.date.localeCompare(right.date) || (left.entry.roomNumber ?? "").localeCompare(right.entry.roomNumber ?? "", "vi", { numeric: true }) || left.entry.id.localeCompare(right.entry.id));
}

function sheetXml(book: RevenueBook): string {
  const rows: string[] = [];
  const merges = ["A1:S1", "A2:S2", "A3:S3", "A4:P4", "R4:S4", "A5:P5", "R5:S5", "F6:J6", "K6:N6", "M7:N7"];
  let rowNumber = 0;
  const addRow = (values: Cell[], total = false, height?: number) => {
    rowNumber++;
    if (rowNumber > 1_048_576) throw new Error("Báo cáo quá nhiều dòng. Vui lòng chọn khoảng ngày ngắn hơn.");
    rows.push(`<row r="${rowNumber}"${height ? ` ht="${height}" customHeight="1"` : ""}>${values.map((value, index) => cell(value, index, rowNumber, total)).join("")}</row>`);
    return rowNumber;
  };
  const title = (text: string, height = 26) => {
    rowNumber++;
    rows.push(`<row r="${rowNumber}" ht="${height}" customHeight="1"><c r="A${rowNumber}" s="1" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c></row>`);
  };
  title(book.hotelName.toLocaleUpperCase("vi-VN"));
  title("SỔ THEO DÕI DOANH THU", 30);
  title(`Từ ${dateLabel(book.from)} đến ${dateLabel(book.to)} · ${book.currency}`, 22);
  addRow(["Công nợ đầu kỳ", ...Array<null>(15).fill(null), book.summary.openingBalance, book.currency], true);
  addRow(["Điều chỉnh công nợ không qua thu tiền", ...Array<null>(15).fill(null), book.summary.balanceAdjustment, "", ""], true);
  const headers: Cell[][] = [
    ["TT", "Ngày/Tháng", "Số phòng", "Số chứng từ", "Diễn giải", "Doanh thu", null, null, null, null, "Khách hàng thanh toán", null, null, null, "Tổng thanh toán", "Thanh toán khác", "Còn nợ cuối kỳ", "Khai báo", "Ghi chú"],
    [null, null, null, null, null, "Tiền phòng", "Minibar/Nước uống", "Giặt ủi", "Dịch vụ khác", "Tổng doanh thu", "Ngày thanh toán", "Tiền mặt", "Chuyển khoản"],
    [null, null, null, null, null, null, null, null, null, null, null, null, "Giờ CK", "Số tiền"],
  ];
  for (const values of headers) {
    rowNumber++;
    rows.push(`<row r="${rowNumber}" ht="30" customHeight="1">${Array.from({ length: 19 }, (_, index) => `<c r="${columns[index]}${rowNumber}" s="2" t="inlineStr"><is><t>${escapeXml(String(values[index] ?? ""))}</t></is></c>`).join("")}</row>`);
  }
  for (const column of ["A", "B", "C", "D", "E", "O", "P", "Q", "R", "S"]) merges.push(`${column}6:${column}8`);
  for (const column of ["F", "G", "H", "I", "J", "K", "L"]) merges.push(`${column}7:${column}8`);

  let date = "";
  let dayRevenue = emptyRevenue();
  let dayCash = 0;
  let dayBank = 0;
  let dayOther = 0;
  let sequence = 0;
  const subtotal = () => {
    if (!date) return;
    const r = addRow([`Cộng ngày ${dateLabel(date)}`, null, null, null, null, dayRevenue.roomRevenue, dayRevenue.minibarRevenue, dayRevenue.laundryRevenue, dayRevenue.otherRevenue, dayRevenue.revenueTotal, null, dayCash, null, dayBank, addMoney(addMoney(dayCash, dayBank), dayOther), dayOther], true);
    merges.push(`A${r}:E${r}`);
  };
  for (const activity of buildActivities(book)) {
    if (activity.date !== date) {
      subtotal();
      date = activity.date;
      dayRevenue = emptyRevenue();
      dayCash = dayBank = dayOther = 0;
    }
    const { entry, revenue, collection } = activity;
    const paid = collection?.amount ?? 0;
    const cash = collection?.method === "CASH" ? paid : 0;
    const bank = collection?.method === "BANK_TRANSFER" ? paid : 0;
    const other = collection && collection.method !== "CASH" && collection.method !== "BANK_TRANSFER" ? paid : 0;
    const local = collection ? localParts(collection.receivedAt, book.timeZone) : null;
    const notes = [entry.notes, !activity.date ? "Số dư chuyển sang" : null, entry.voidedAt ? "Đã hủy khoản phát sinh" : null, collection?.reference ? `Tham chiếu: ${collection.reference}` : null].filter(Boolean).join("; ");
    addRow([
      ++sequence, activity.date ? dateLabel(activity.date) : null, entry.roomNumber, entry.documentNumber, entry.description,
      revenue?.roomRevenue, revenue?.minibarRevenue, revenue?.laundryRevenue, revenue?.otherRevenue, revenue?.revenueTotal,
      local ? dateLabel(local.date) : null, collection ? cash : null, bank ? local?.time : null, collection ? bank : null,
      collection ? paid : null, collection ? other : null, activity.closing, entry.declarationStatus, notes,
    ]);
    if (revenue) for (const key of Object.keys(dayRevenue) as Array<keyof Revenue>) dayRevenue[key] = addMoney(dayRevenue[key], revenue[key]);
    dayCash = addMoney(dayCash, cash);
    dayBank = addMoney(dayBank, bank);
    dayOther = addMoney(dayOther, other);
  }
  subtotal();
  const s = book.summary;
  const totalRow = addRow(["TỔNG KỲ", null, null, null, null, s.roomRevenue, s.minibarRevenue, s.laundryRevenue, s.otherRevenue, s.revenueTotal, null, s.cashTotal, null, s.bankTransferTotal, s.collectedTotal, s.otherCollectedTotal, s.closingBalance], true, 28);
  merges.push(`A${totalRow}:E${totalRow}`);
  const noteRow = addRow(["Cột còn nợ là số dư cuối kỳ; số âm là tiền khách còn dư. Tổng thanh toán đã bao gồm thanh toán khác."], false, 30);
  merges.push(`A${noteRow}:S${noteRow}`);
  const widths = [6, 14, 12, 22, 38, 18, 18, 18, 18, 20, 18, 18, 12, 18, 20, 18, 20, 18, 38];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:S${rowNumber}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;[Red]-#,##0.00"/></numFmts><fonts count="3"><font><sz val="12"/><name val="Times New Roman"/></font><font><b/><sz val="16"/><name val="Times New Roman"/></font><font><b/><sz val="12"/><name val="Times New Roman"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="2" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// OOXML is a ZIP package. Stored entries keep this bounded report dependency-free.
function zip(parts: Record<string, string>): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const header = (size: number) => new Uint8Array(size);
  for (const [name, xml] of Object.entries(parts)) {
    const filename = encoder.encode(name);
    const data = encoder.encode(xml);
    const crc = crc32(data);
    const entry = header(30 + filename.length);
    const view = new DataView(entry.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true); view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, filename.length, true);
    entry.set(filename, 30);
    local.push(entry, data);
    const directory = header(46 + filename.length);
    const dv = new DataView(directory.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, 0x800, true);
    dv.setUint16(14, 33, true); dv.setUint32(16, crc, true); dv.setUint32(20, data.length, true); dv.setUint32(24, data.length, true); dv.setUint16(28, filename.length, true); dv.setUint32(42, offset, true);
    directory.set(filename, 46);
    central.push(directory);
    offset += entry.length + data.length;
  }
  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
  const end = header(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, central.length, true); endView.setUint16(10, central.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...local, ...central, end]) { result.set(part, cursor); cursor += part.length; }
  return result;
}

export function buildRevenueBookWorkbook(book: RevenueBook): Uint8Array {
  return zip({
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sổ doanh thu" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">\'Sổ doanh thu\'!$1:$8</definedName></definedNames></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": styles,
    "xl/worksheets/sheet1.xml": sheetXml(book),
  });
}

export function exportRevenueBook(book: RevenueBook): void {
  const bytes = new Uint8Array(buildRevenueBookWorkbook(book));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `so-doanh-thu-${book.from}_${book.to}.xlsx`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
