import { BadRequestException, HttpException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { addDaysYmd, resolveTimeZone, startOfPlainDate, todayPlainDate } from "../../../common/time/vietnam-temporal";
import type { PrismaService } from "../../../prisma/prisma.service";
import type { HotelRoomScope } from "../../property/property-public";
import type { CashMovementItem, CashMovementsResponse, ListCashMovementsQuery } from "../domain/schemas/billing.schema";

const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const sourceLimit = 10000;

function metadata(value: Prisma.JsonValue | undefined): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function account(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value.trim() || null : null;
}

async function loadSources(tx: Prisma.TransactionClient, hotelId: string, ids: string[] | null, start: Date, end: Date) {
  const window = { gte: start, lt: end };
  const roomFilter = ids === null ? {} : { roomId: { in: ids } };
  const room = { select: { roomNumber: true } } as const;
  const stay = { select: { guestDisplayName: true, reservationCode: true, reservation: { select: { reservationCode: true } }, room } } as const;
  const take = sourceLimit + 1;
  const expenseRoomSql = ids === null ? Prisma.empty : Prisma.sql`AND e."roomId" IN (${Prisma.join(ids)})`;
  const [payments, deposits, collections, manual, expenses, residual] = await Promise.all([
    tx.payment.findMany({
      where: { hotelId, folio: { hotelId, ...roomFilter }, status: { in: ["SUCCEEDED", "REFUNDED"] }, OR: [
        { confirmedAt: window },
        // Undated or partially documented refunds can affect any later period.
        { confirmedAt: { lt: end }, OR: [{ refundedAmount: { gt: 0 } }, { status: "REFUNDED" }] },
        { confirmedAt: null, createdAt: { lt: end } },
        { transactions: { some: { status: "REFUNDED", OR: [{ processedAt: window }, { processedAt: null, createdAt: window }] } } },
      ] },
      select: {
        id: true, stayId: true, invoiceId: true, folioId: true, paymentNumber: true, status: true, provider: true,
        method: true, paidAmount: true, refundedAmount: true, currency: true, confirmedAt: true, metadataJson: true,
        invoice: { select: { invoiceNumber: true } }, stay,
        transactions: { where: { status: "REFUNDED", hotelId }, select: { id: true, amount: true, currency: true, processedAt: true, createdAt: true, rawPayloadJson: true } },
      }, take,
    }),
    tx.bookingPayment.findMany({
      where: { hotelId, ...(ids === null ? {} : { reservation: { hotelId, ...roomFilter } }), OR: [
        { receivedAt: window, status: { in: ["COMPLETED", "ALLOCATED"] } },
        { receivedAt: { lt: end }, status: "REFUNDED" },
      ] },
      select: { id: true, status: true, receivedAmount: true, receivedAt: true, paymentMethod: true, transactionReference: true, destinationAccount: true,
        reservation: { select: { guestDisplayName: true, reservationCode: true, room } }, group: { select: { groupCode: true } } }, take,
    }),
    tx.receivableCollection.findMany({
      where: { hotelId, receivable: { hotelId, folio: { hotelId, ...roomFilter } }, OR: [
        { collectedAt: window }, { isVoided: true, voidedAt: window },
        { isVoided: true, voidedAt: null, collectedAt: { lt: end } },
      ] },
      select: { id: true, collectedAt: true, collectedAmount: true, voidedAt: true, isVoided: true, paymentMethod: true,
        reference: true, destinationAccount: true, receivable: { select: { debtorName: true, invoiceId: true, stayId: true, folioId: true,
          invoice: { select: { invoiceNumber: true } }, stay, folio: { select: { currency: true } } } } }, take,
    }),
    tx.hotelRevenueCollection.findMany({
      where: { hotelId, entry: { hotelId, ...roomFilter }, receivedAt: window }, select: { id: true, receivedAt: true, amount: true, method: true, reference: true, destinationAccount: true,
        entry: { select: { description: true, documentNumber: true, roomNumberSnapshot: true, room } } }, take,
    }),
    tx.hotelExpensePayment.findMany({
      where: { hotelId, paidAt: window, expense: { hotelId, ...roomFilter } },
      select: { id: true, amount: true, paidAt: true, paymentMethod: true, paymentAccount: true,
        expense: { select: { title: true, vendorName: true, roomNumberSnapshot: true, documentNumber: true, room } } }, take,
    }),
    // Old cumulative balances have no verifiable transaction date. A subsequent dated payment must not erase that balance.
    tx.$queryRaw<Array<{ amount: Prisma.Decimal; count: bigint; invalid: bigint }>>`
      WITH residuals AS (
        SELECT e.id, e."paidAmount" - COALESCE(SUM(p.amount), 0) AS residual
        FROM "HotelExpense" e LEFT JOIN "HotelExpensePayment" p ON p."expenseId" = e.id AND p."hotelId" = e."hotelId"
        WHERE e."hotelId" = ${hotelId} ${expenseRoomSql}
        GROUP BY e.id, e."paidAmount"
      )
      SELECT COALESCE(SUM(residual) FILTER (WHERE residual > 0), 0) AS amount,
             COUNT(*) FILTER (WHERE residual > 0) AS count,
             COUNT(*) FILTER (WHERE residual < 0) AS invalid FROM residuals`,
  ]);
  if ([payments, deposits, collections, manual, expenses].some(rows => rows.length > sourceLimit)) {
    throw new BadRequestException("Số chứng từ vượt giới hạn đối soát. Vui lòng chọn kỳ ngắn hơn.");
  }
  if (Number(residual[0].invalid) > 0) throw new BadRequestException("Tổng các lần chi vượt số đã trả trên chứng từ. Vui lòng đối soát chi phí.");
  return { payments, deposits, collections, manual, expenses, undated: { amount: residual[0].amount.toNumber(), expenseCount: Number(residual[0].count) } };
}

function projectSources(data: Awaited<ReturnType<typeof loadSources>>, start: Date, end: Date) {
  const items: CashMovementItem[] = [];
  type SourceEvent = Pick<CashMovementItem, "id" | "sourceType" | "movementType" | "description" | "paymentMethod">
    & Partial<Pick<CashMovementItem, "destinationAccount" | "referenceCode" | "payerOrPayee" | "roomNumber" | "bookingCode" | "stayId" | "invoiceId" | "folioId" | "currency">>;
  function add(date: Date, amount: Prisma.Decimal, event: SourceEvent) {
    if (date < start || date >= end || amount.isZero()) return;
    if (!amount.isFinite() || amount.lt(0)) throw new BadRequestException("Giá trị giao dịch chưa hợp lệ. Vui lòng đối soát chứng từ.");
    items.push({
      destinationAccount: null, referenceCode: null, payerOrPayee: null, roomNumber: null,
      bookingCode: null, stayId: null, invoiceId: null, folioId: null, currency: "VND", ...event,
      amount: amount.toNumber(), transactionDate: date.toISOString(), isLegacyAccount: !event.destinationAccount,
    });
  }
  for (const p of data.payments) {
    const meta = metadata(p.metadataJson);
    if (meta.source === "booking_deposit" || meta.bookingPaymentAllocationId || meta.bookingPaymentId || meta.syntheticDepositAllocation === true) continue;
    const ref = p.paymentNumber;
    if (!p.confirmedAt) throw new BadRequestException(`Thanh toán ${ref} thiếu ngày xác nhận. Vui lòng đối soát chứng từ.`);
    const base = { paymentMethod: p.method, currency: p.currency, referenceCode: p.invoice?.invoiceNumber ?? ref, roomNumber: p.stay.room?.roomNumber ?? null,
      bookingCode: p.stay.reservationCode ?? p.stay.reservation?.reservationCode ?? null, payerOrPayee: p.stay.guestDisplayName, stayId: p.stayId, invoiceId: p.invoiceId, folioId: p.folioId };
    const receipt = { ...base, movementType: "RECEIPT", sourceType: meta.source === "front_desk" || ["MANUAL", "BANK_TRANSFER"].includes(p.provider) ? "FRONT_DESK_PAYMENT" : "ONLINE_PAYMENT",
      description: `Thanh toán hóa đơn ${base.referenceCode}` } as const;
    if (Array.isArray(meta.splits) && meta.splits.length > 0) {
      let sum = money(0);
      for (const [index, raw] of meta.splits.entries()) {
        const leg = metadata(raw);
        if ((typeof leg.amount !== "number" && typeof leg.amount !== "string") || typeof leg.method !== "string") throw new BadRequestException(`Thanh toán ${ref} thiếu thông tin chia phương thức.`);
        const amount = money(leg.amount);
        if (!amount.gt(0)) throw new BadRequestException(`Thanh toán ${ref} có số tiền chia không hợp lệ.`);
        sum = sum.plus(amount);
        add(p.confirmedAt, amount, { ...receipt, id: `pay-${p.id}-leg-${index}`, paymentMethod: leg.method, destinationAccount: account(leg.destinationAccount) });
      }
      if (!sum.eq(p.paidAmount)) throw new BadRequestException(`Tổng các phương thức thanh toán ${ref} không khớp với số tiền đã thu.`);
    } else {
      add(p.confirmedAt, p.paidAmount, { ...receipt, id: `pay-${p.id}`, destinationAccount: account(meta.destinationAccount) });
    }
    const refunded = p.transactions.reduce((sum, row) => sum.plus(row.amount), money(0));
    if (!refunded.eq(p.refundedAmount) || (p.status === "REFUNDED" && refunded.isZero())) throw new BadRequestException(`Thanh toán ${ref} thiếu lịch sử hoàn tiền. Vui lòng đối soát chứng từ.`);
    for (const refund of p.transactions) {
      if (refund.currency !== p.currency) throw new BadRequestException(`Đơn vị tiền hoàn của thanh toán ${ref} khác chứng từ gốc.`);
      const refundMeta = metadata(refund.rawPayloadJson);
      add(refund.processedAt ?? refund.createdAt, refund.amount, { ...base, id: `refund-${refund.id}`, movementType: "DISBURSEMENT", sourceType: "PAYMENT_REFUND",
        description: `Hoàn thanh toán ${base.referenceCode}`, paymentMethod: account(refundMeta.method) ?? (Array.isArray(meta.splits) ? "OTHER" : p.method), destinationAccount: account(refundMeta.paymentAccount) });
    }
  }
  for (const d of data.deposits) {
    if (d.status === "REFUNDED") throw new BadRequestException(`Tiền cọc ${d.transactionReference ?? d.reservation?.reservationCode ?? d.id} chưa có ngày hoàn tiền. Vui lòng đối soát chứng từ.`);
    add(d.receivedAt, d.receivedAmount, { id: `dep-${d.id}`, sourceType: "BOOKING_DEPOSIT", movementType: "RECEIPT", paymentMethod: d.paymentMethod,
      destinationAccount: d.destinationAccount?.trim() || null,
      description: "Thu tiền đặt cọc", referenceCode: d.transactionReference, payerOrPayee: d.reservation?.guestDisplayName ?? null,
      bookingCode: d.reservation?.reservationCode ?? d.group?.groupCode ?? null, roomNumber: d.reservation?.room?.roomNumber ?? null });
  }
  for (const c of data.collections) {
    const r = c.receivable;
    const base = { paymentMethod: c.paymentMethod, destinationAccount: c.destinationAccount, payerOrPayee: r.debtorName, currency: r.folio.currency,
      referenceCode: c.reference ?? r.invoice?.invoiceNumber ?? null, roomNumber: r.stay.room?.roomNumber ?? null,
      bookingCode: r.stay.reservationCode ?? r.stay.reservation?.reservationCode ?? null, stayId: r.stayId, invoiceId: r.invoiceId, folioId: r.folioId };
    add(c.collectedAt, c.collectedAmount, { ...base, id: `col-${c.id}`, movementType: "RECEIPT", sourceType: "RECEIVABLE_COLLECTION", description: `Thu công nợ ${r.debtorName}` });
    if (c.isVoided) {
      if (!c.voidedAt) throw new BadRequestException(`Khoản thu nợ ${c.reference ?? c.id} thiếu ngày điều chỉnh. Vui lòng đối soát chứng từ.`);
      add(c.voidedAt, c.collectedAmount, { ...base, id: `col-void-${c.id}`, movementType: "DISBURSEMENT", sourceType: "RECEIVABLE_REVERSAL", description: `Đảo khoản thu nợ ${r.debtorName}` });
    }
  }
  for (const c of data.manual) {
    add(c.receivedAt, c.amount, { id: `manual-${c.id}`, movementType: "RECEIPT", sourceType: "MANUAL_COLLECTION", paymentMethod: c.method,
      destinationAccount: c.destinationAccount?.trim() || null,
      description: c.entry.description, referenceCode: c.reference ?? c.entry.documentNumber, roomNumber: c.entry.room?.roomNumber ?? c.entry.roomNumberSnapshot });
  }
  for (const leg of data.expenses) {
    const e = leg.expense;
    add(leg.paidAt, leg.amount.abs(), { id: `exp-leg-${leg.id}`, movementType: leg.amount.lt(0) ? "RECEIPT" : "DISBURSEMENT", sourceType: "HOTEL_EXPENSE",
      description: leg.amount.lt(0) ? `Điều chỉnh hoàn chi · ${e.title}` : e.title, paymentMethod: leg.paymentMethod ?? "OTHER",
      destinationAccount: leg.paymentAccount, referenceCode: e.documentNumber, payerOrPayee: e.vendorName, roomNumber: e.room?.roomNumber ?? e.roomNumberSnapshot });
  }
  return items;
}

function summarize(items: CashMovementItem[], query: ListCashMovementsQuery) {
  const search = query.q?.trim().toLocaleLowerCase("vi");
  const dest = query.destinationAccount?.trim().toLocaleLowerCase("vi");
  const filtered = items.filter(item =>
    (!query.movementType || query.movementType === "ALL" || query.movementType === item.movementType)
    && (!query.paymentMethod || item.paymentMethod === query.paymentMethod.toUpperCase())
    && (!dest || (["legacy", "null"].includes(dest) ? item.destinationAccount === null : item.destinationAccount?.toLocaleLowerCase("vi") === dest))
    && (!search || [item.description, item.payerOrPayee, item.referenceCode, item.bookingCode, item.destinationAccount, item.roomNumber].some(v => v?.toLocaleLowerCase("vi").includes(search))));
  const currencies = new Set(filtered.map(i => i.currency));
  if (currencies.size > 1) throw new BadRequestException("Các chứng từ trong phạm vi dùng nhiều đơn vị tiền. Vui lòng đối soát riêng từng loại tiền.");
  const currency = filtered[0]?.currency ?? "VND";
  const groups = () => ({ cashIn: money(0), cashOut: money(0), count: 0 });
  const accounts = new Map<string | null, ReturnType<typeof groups>>();
  const methods = new Map<string, ReturnType<typeof groups>>();
  const total = groups();
  let receiptCount = 0;
  for (const item of filtered) {
    const key = item.movementType === "RECEIPT" ? "cashIn" : "cashOut";
    const byAccount = accounts.get(item.destinationAccount) ?? groups();
    const byMethod = methods.get(item.paymentMethod) ?? groups();
    for (const bucket of [byAccount, byMethod, total]) {
      bucket[key] = bucket[key].plus(item.amount);
      bucket.count++;
    }
    receiptCount += Number(item.movementType === "RECEIPT");
    accounts.set(item.destinationAccount, byAccount);
    methods.set(item.paymentMethod, byMethod);
  }
  const summary = { entryCount: filtered.length, receiptCount, disbursementCount: filtered.length - receiptCount,
    totalCashIn: total.cashIn.toNumber(), totalCashOut: total.cashOut.toNumber(), netCashFlow: total.cashIn.minus(total.cashOut).toNumber(),
    byMethod: Object.fromEntries([...methods].map(([method, g]) => [method, { cashIn: g.cashIn.toNumber(), cashOut: g.cashOut.toNumber() }])),
    byAccount: [...accounts].map(([name, g]) => ({ accountName: name ?? "Chưa xác định tài khoản", isLegacy: name === null, cashIn: g.cashIn.toNumber(),
      cashOut: g.cashOut.toNumber(), netCash: g.cashIn.minus(g.cashOut).toNumber(), transactionCount: g.count }))
      .sort((a,b) => b.cashIn + b.cashOut - a.cashIn - a.cashOut),
  };
  filtered.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || a.id.localeCompare(b.id));
  const pageSize = query.pageSize ?? 50;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(query.page ?? 1, totalPages);
  return { currency, summary, page, pageSize, totalPages, items: filtered.slice((page - 1) * pageSize, page * pageSize) };
}

export async function readCashMovements(prisma: PrismaService, hotelId: string, scope: HotelRoomScope, query: ListCashMovementsQuery): Promise<CashMovementsResponse> {
  const timeZone = resolveTimeZone(scope.hotel.timezone);
  const today = todayPlainDate(timeZone);
  const from = query.from ?? today.with({ day: 1 }).toString();
  const to = query.to ?? today.with({ day: today.daysInMonth }).toString();
  if (from > to) throw new BadRequestException("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
  const start = startOfPlainDate(from, timeZone);
  const end = startOfPlainDate(addDaysYmd(to, 1), timeZone);
  const ids = scope.allowedRoomId
    ? (scope.allowedRoomIds ?? [scope.allowedRoomId]).filter(id => id === scope.allowedRoomId)
    : scope.allowedRoomIds ?? null;
  const period = { hotelId, timeZone, from, to };
  if (ids?.length === 0) return { ...period, ...summarize([], query), undatedExpensePayments: { amount: 0, expenseCount: 0 } };
  try {
    const data = await prisma.$transaction(tx => loadSources(tx, hotelId, ids, start, end), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { ...period, ...summarize(projectSources(data, start, end), query), undatedExpensePayments: data.undated };
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new ServiceUnavailableException("Không đủ dữ liệu để đối soát sổ thu chi. Vui lòng thử lại.", { cause: error });
  }
}
