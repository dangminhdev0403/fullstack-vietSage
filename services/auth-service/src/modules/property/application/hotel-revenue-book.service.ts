import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { addDaysYmd, resolveTimeZone, startOfPlainDate, todayYmd, toYmd } from "../../../common/time/vietnam-temporal";
import { PrismaService } from "../../../prisma/prisma.service";
import { assertBookLimit, projectBookAccount, revenueCategory, totalRevenueBook, type BookAccount, type MoneyEvent } from "../domain/hotel-revenue-book";
import type { RevenueBook } from "../domain/hotel-revenue-book.types";
import type { CollectRevenueEntry, CreateRevenueEntry, RevenueBookCategory, RevenueBookQuery, UpdateRevenueEntry, VoidRevenueEntry } from "../domain/schemas/hotel-revenue-book.schema";
import { HotelAccessService, type HotelRoomScope } from "./hotel-access.service";

function jsonText(value: Prisma.JsonValue | null, key: string): string | null {
  return value && typeof value === "object" && !Array.isArray(value) && typeof value[key] === "string" ? value[key] as string : null;
}
function fingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
const plainDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const changed = () => new ConflictException("Khoản phát sinh đã thay đổi. Vui lòng tải lại báo cáo trước khi tiếp tục.");

@Injectable()
export class HotelRevenueBookService {
  constructor(private readonly prisma: PrismaService, private readonly access: HotelAccessService) {}

  async getBook(userId: string, roleId: string, hotelId: string, query: RevenueBookQuery): Promise<RevenueBook> {
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);
    const actor = await this.access.loadActorContext(userId, roleId);
    const timeZone = resolveTimeZone(scope.hotel.timezone);
    const today = todayYmd(timeZone);
    const from = query.from ?? `${today.slice(0, 7)}-01`;
    const to = query.to ?? today;
    const start = startOfPlainDate(from, timeZone);
    const end = startOfPlainDate(addDaysYmd(to, 1), timeZone);
    const roomIds = scope.allowedRoomIds ?? (scope.allowedRoomId ? [scope.allowedRoomId] : null);
    const roomFilter = roomIds === null ? {} : { roomId: { in: roomIds } };
    const instantWindow = { gte: start, lt: end };
    try {
      const data = await this.prisma.$transaction(async (tx) => {
        const [folios, deposits, manual, rooms] = await Promise.all([
          tx.folio.findMany({
            where: {
              hotelId, ...roomFilter, openedAt: { lt: end },
              OR: [
                { status: { in: ["OPEN", "CHECKOUT_PENDING"] } },
                { items: { some: { OR: [{ postedAt: instantWindow }, { voidedAt: instantWindow }] } } },
                { payments: { some: { confirmedAt: { gte: start } } } },
                { payments: { some: { transactions: { some: { status: "REFUNDED", createdAt: { gte: start } } } } } },
                { bookingPaymentAllocations: { some: { allocatedAt: { gte: start } } } },
                { hotelReceivables: { some: { OR: [{ outstandingAmount: { gt: 0 } }, { collections: { some: { collectedAt: { gte: start } } } }] } } },
              ],
            },
            take: 10001,
            include: {
              room: { select: { roomNumber: true } },
              stay: { select: { guestDisplayName: true, kbttGuestDeclarations: { select: { status: true }, take: 1, orderBy: { updatedAt: "desc" } } } },
              items: { where: { postedAt: { lt: end } }, include: { serviceItem: { select: { category: { select: { name: true } } } } } },
              payments: { where: { confirmedAt: { lt: end }, status: { in: ["SUCCEEDED", "REFUNDED"] } }, include: { transactions: { where: { status: "REFUNDED" } } } },
              bookingPaymentAllocations: { where: { allocatedAt: { lt: end }, bookingPayment: { status: { in: ["COMPLETED", "ALLOCATED"] } } } },
              hotelReceivables: { include: { collections: { where: { collectedAt: { lt: end } } } } },
            },
          }),
          tx.bookingPayment.findMany({
            where: { hotelId, receivedAt: { lt: end }, status: { in: ["COMPLETED", "ALLOCATED", "REFUNDED"] }, ...(roomIds === null ? {} : { reservation: { roomId: { in: roomIds } } }) },
            take: 10001,
            include: { allocations: { where: { folioId: { not: null }, allocatedAt: { lt: end } } }, reservation: { select: { guestDisplayName: true, reservationCode: true, roomId: true, room: { select: { roomNumber: true } } } } },
          }),
          tx.hotelRevenueEntry.findMany({
            where: {
              hotelId, ...roomFilter,
              AND: [
                { OR: [{ date: { lt: plainDate(addDaysYmd(to, 1)) } }, { collections: { some: { receivedAt: { lt: end } } } }] },
                { OR: [{ voidedAt: null }, { voidedAt: { gte: start } }] },
              ],
            },
            take: 10001, include: { collections: { where: { receivedAt: { lt: end } }, orderBy: { receivedAt: "asc" } } },
          }),
          tx.room.findMany({ where: { hotelId, ...(roomIds === null ? {} : { id: { in: roomIds } }) }, select: { id: true, roomNumber: true }, orderBy: { roomNumber: "asc" }, take: 10001 }),
        ]);
        assertBookLimit(folios.length); assertBookLimit(deposits.length); assertBookLimit(manual.length); assertBookLimit(rooms.length);
        return { folios, deposits, manual, rooms };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      const accounts: BookAccount[] = [];
      for (const folio of data.folios) {
        if (folio.currency !== "VND") throw new BadRequestException("Báo cáo hiện hỗ trợ VND. Vui lòng đối soát riêng hồ sơ dùng loại tiền khác.");
        const charges: MoneyEvent[] = [];
        for (const item of folio.items) {
          const category = revenueCategory(item.itemType, item.serviceItem?.category.name ?? item.nameSnapshot, jsonText(item.metadataSnapshotJson, "reportCategory"));
          const amount = item.itemType === "DISCOUNT" ? new Prisma.Decimal(item.discountAmountSnapshot.isZero() ? item.totalSnapshot : item.discountAmountSnapshot).abs().neg() : item.totalSnapshot;
          charges.push({ date: item.postedAt, amount, category });
          if (item.voidedAt && item.voidedAt < end) charges.push({ date: item.voidedAt, amount: amount.neg(), category });
        }
        const collections: MoneyEvent[] = [];
        for (const payment of folio.payments) {
          if (jsonText(payment.metadataJson, "source") === "booking_deposit") continue;
          if (!payment.confirmedAt) continue;
          collections.push({ id: payment.id, date: payment.confirmedAt, amount: payment.paidAmount, method: payment.method, reference: payment.paymentNumber });
          if (payment.refundedAmount.gt(0)) {
            const refundTotal = payment.transactions.reduce((sum, event) => sum.add(event.amount), new Prisma.Decimal(0));
            if (!refundTotal.equals(payment.refundedAmount)) throw new BadRequestException("Có khoản hoàn tiền chưa có lịch sử giao dịch đầy đủ. Vui lòng đối soát khoản hoàn tiền trước khi xuất báo cáo.");
            for (const refund of payment.transactions) collections.push({ id: refund.id, date: refund.processedAt ?? refund.createdAt, amount: refund.amount.neg(), method: payment.method, reference: payment.paymentNumber });
          }
        }
        for (const receivable of folio.hotelReceivables) for (const collection of receivable.collections) {
          collections.push({ id: collection.id, date: collection.collectedAt, amount: collection.collectedAmount, method: collection.paymentMethod, reference: collection.reference });
          if (collection.isVoided) {
            if (!collection.voidedAt) throw new BadRequestException("Có khoản thu nợ đã hủy thiếu ngày điều chỉnh. Vui lòng đối soát trước khi xuất báo cáo.");
            collections.push({ id: `${collection.id}:void`, date: collection.voidedAt, amount: collection.collectedAmount.neg(), method: collection.paymentMethod, reference: collection.reference });
          }
        }
        accounts.push({
          id: `folio:${folio.id}`, source: "FOLIO", date: toYmd(folio.openedAt, timeZone), roomId: folio.roomId, roomNumber: folio.room.roomNumber,
          documentNumber: folio.folioNumber, description: folio.stay.guestDisplayName, category: null, amount: null, notes: null,
          declarationStatus: folio.stay.kbttGuestDeclarations[0]?.status ?? null, version: null, voidedAt: folio.voidedAt?.toISOString() ?? null,
          charges, collections, adjustments: folio.bookingPaymentAllocations.map((allocation) => ({ date: allocation.allocatedAt, amount: allocation.allocatedAmount.neg() })),
        });
      }
      for (const deposit of data.deposits) {
        if (deposit.status === "REFUNDED") throw new BadRequestException("Có tiền đặt cọc đã hoàn chưa có ngày hoàn chi tiết. Vui lòng đối soát khoản cọc trước khi xuất báo cáo.");
        accounts.push({
          id: `deposit:${deposit.id}`, source: "DEPOSIT", date: toYmd(deposit.receivedAt, timeZone), roomId: deposit.reservation?.roomId ?? null,
          roomNumber: deposit.reservation?.room?.roomNumber ?? null, documentNumber: deposit.reservation?.reservationCode ?? deposit.transactionReference,
          description: `Tiền đặt cọc${deposit.reservation?.guestDisplayName ? ` · ${deposit.reservation.guestDisplayName}` : ""}`, category: null, amount: null,
          notes: deposit.notes, declarationStatus: null, version: null, voidedAt: null, charges: [],
          collections: [{ id: deposit.id, date: deposit.receivedAt, amount: deposit.receivedAmount, method: deposit.paymentMethod, reference: deposit.transactionReference }],
          adjustments: deposit.allocations.map((allocation) => ({ date: allocation.allocatedAt, amount: allocation.allocatedAmount })),
        });
      }
      for (const entry of data.manual) {
        const businessDate = entry.date.toISOString().slice(0, 10);
        const category = entry.category as RevenueBookCategory;
        const charges: MoneyEvent[] = [{ date: startOfPlainDate(businessDate, timeZone), amount: entry.amount, category }];
        if (entry.voidedAt) charges.push({ date: new Date(Math.max(entry.voidedAt.getTime(), charges[0].date.getTime())), amount: entry.amount.neg(), category });
        accounts.push({
          id: entry.id, source: "MANUAL", date: businessDate, roomId: entry.roomId, roomNumber: entry.roomNumberSnapshot,
          documentNumber: entry.documentNumber, description: entry.description, category, amount: entry.amount.toNumber(), notes: entry.notes,
          declarationStatus: null, version: entry.version, voidedAt: entry.voidedAt?.toISOString() ?? null, charges,
          collections: entry.collections.map((collection) => ({ id: collection.id, date: collection.receivedAt, amount: collection.amount, method: collection.method, reference: collection.reference })),
        });
      }
      const entries = accounts.map((account) => projectBookAccount(account, start, end, timeZone)).filter((entry) => entry !== null).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
      assertBookLimit(entries.length);
      return {
        hotelId, hotelName: scope.hotel.name, timeZone, currency: "VND", from, to, entries, summary: totalRevenueBook(entries),
        rooms: data.rooms.map((room) => ({ id: room.id, number: room.roomNumber })),
        canManage: actor.isSuperAdmin || actor.permissions?.has("hotel.billing.manage") === true,
      };
    } catch (error) { return this.storageError(error); }
  }

  private async room(scope: HotelRoomScope, roomId?: string | null) {
    this.access.assertRoomAccess(scope, roomId);
    if (!roomId) return null;
    const room = await this.prisma.room.findFirst({ where: { id: roomId, hotelId: scope.hotel.id }, select: { roomNumber: true } });
    if (!room) throw new NotFoundException("Không tìm thấy phòng trong khách sạn này");
    return room.roomNumber;
  }
  private collectionTime(receivedAt: string) {
    const date = new Date(receivedAt);
    if (date.getTime() > Date.now() + 60_000) throw new BadRequestException("Ngày nhận tiền không được ở tương lai");
    return date;
  }
  private async audit(tx: Prisma.TransactionClient, actorId: string, tenantId: string, id: string, action: string, metadata: Prisma.InputJsonObject) {
    await tx.auditLog.create({ data: { actorId, tenantId, entityType: "HotelRevenueEntry", entityId: id, action, metadata } });
  }
  private storageError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2021" || error.code === "P2022") throw new ServiceUnavailableException("Sổ doanh thu cần được cập nhật dữ liệu trước khi sử dụng. Vui lòng liên hệ quản trị viên.");
      if (error.code === "P2034") throw changed();
    }
    throw error;
  }
  private assertReplay(hash: string, existing: { requestHash: string; id: string; version?: number }) {
    if (hash !== existing.requestHash) throw new ConflictException("Yêu cầu đã được dùng cho nội dung khác. Vui lòng tải lại và thử lại.");
  }
  async create(userId: string, roleId: string, hotelId: string, input: CreateRevenueEntry) {
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);
    const roomNumberSnapshot = await this.room(scope, input.roomId);
    const requestHash = fingerprint(input);
    if (input.collection) this.collectionTime(input.collection.receivedAt);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.hotelRevenueEntry.findUnique({ where: { hotelId_idempotencyKey: { hotelId, idempotencyKey: input.idempotencyKey } } });
        if (existing) { this.access.assertRoomAccess(scope, existing.roomId); this.assertReplay(requestHash, existing); return { id: existing.id, version: existing.version }; }
        const entry = await tx.hotelRevenueEntry.create({ data: {
          hotelId, roomId: input.roomId || null, roomNumberSnapshot, date: plainDate(input.date), description: input.description,
          category: input.category, amount: input.amount, documentNumber: input.documentNumber || null, notes: input.notes || null,
          idempotencyKey: input.idempotencyKey, requestHash, createdByUserId: userId,
          ...(input.collection ? { collections: { create: { amount: input.collection.amount, method: input.collection.method, receivedAt: new Date(input.collection.receivedAt), reference: input.collection.reference || null, idempotencyKey: `initial:${requestHash}`, requestHash: fingerprint(input.collection), createdByUserId: userId } } } : {}),
        } });
        await this.audit(tx, userId, scope.hotel.tenantId, entry.id, "HOTEL_REVENUE_ENTRY_CREATED", { hotelId, input });
        return { id: entry.id, version: entry.version };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.hotelRevenueEntry.findUnique({ where: { hotelId_idempotencyKey: { hotelId, idempotencyKey: input.idempotencyKey } } });
        if (existing) { this.access.assertRoomAccess(scope, existing.roomId); this.assertReplay(requestHash, existing); return { id: existing.id, version: existing.version }; }
      }
      return this.storageError(error);
    }
  }
  private async lockedEntry(tx: Prisma.TransactionClient, scope: HotelRoomScope, id: string) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "HotelRevenueEntry" WHERE id = ${id} AND "hotelId" = ${scope.hotel.id} FOR UPDATE`;
    if (!locked.length) throw new NotFoundException("Không tìm thấy khoản phát sinh");
    const entry = await tx.hotelRevenueEntry.findFirst({ where: { id, hotelId: scope.hotel.id }, include: { collections: true } });
    if (!entry) throw new NotFoundException("Không tìm thấy khoản phát sinh");
    this.access.assertRoomAccess(scope, entry.roomId);
    return entry;
  }
  async update(userId: string, roleId: string, hotelId: string, id: string, input: UpdateRevenueEntry) {
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);
    const roomNumberSnapshot = await this.room(scope, input.roomId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const entry = await this.lockedEntry(tx, scope, id);
        if (entry.version !== input.version) throw changed();
        if (entry.voidedAt) throw new BadRequestException("Khoản phát sinh đã hủy không thể chỉnh sửa");
        const collected = entry.collections.reduce((sum, value) => sum.add(value.amount), new Prisma.Decimal(0));
        if (collected.gt(input.amount)) throw new BadRequestException("Số tiền phát sinh không được nhỏ hơn số tiền đã thu");
        const updated = await tx.hotelRevenueEntry.update({ where: { id }, data: { date: plainDate(input.date), description: input.description, category: input.category, amount: input.amount, roomId: input.roomId || null, roomNumberSnapshot, documentNumber: input.documentNumber || null, notes: input.notes || null, version: { increment: 1 } } });
        await this.audit(tx, userId, scope.hotel.tenantId, id, "HOTEL_REVENUE_ENTRY_UPDATED", { hotelId, before: { date: entry.date.toISOString().slice(0, 10), description: entry.description, category: entry.category, amount: entry.amount.toString(), roomId: entry.roomId, documentNumber: entry.documentNumber, notes: entry.notes, version: entry.version }, after: input });
        return { id, version: updated.version };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { return this.storageError(error); }
  }
  async collect(userId: string, roleId: string, hotelId: string, id: string, input: CollectRevenueEntry) {
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);
    const receivedAt = this.collectionTime(input.receivedAt);
    const requestHash = fingerprint({ entryId: id, ...input });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const entry = await this.lockedEntry(tx, scope, id);
        const existing = await tx.hotelRevenueCollection.findUnique({ where: { hotelId_idempotencyKey: { hotelId, idempotencyKey: input.idempotencyKey } } });
        if (existing) { this.assertReplay(requestHash, existing); return { id, version: entry.version }; }
        if (entry.version !== input.version) throw changed();
        if (entry.voidedAt) throw new BadRequestException("Khoản phát sinh đã hủy không thể thu tiền");
        const collected = entry.collections.reduce((sum, value) => sum.add(value.amount), new Prisma.Decimal(0));
        if (collected.add(input.amount).gt(entry.amount)) throw new BadRequestException("Số tiền thu vượt quá số còn phải thu");
        await tx.hotelRevenueCollection.create({ data: { hotelId, entryId: id, amount: input.amount, method: input.method, receivedAt, reference: input.reference || null, idempotencyKey: input.idempotencyKey, requestHash, createdByUserId: userId } });
        const updated = await tx.hotelRevenueEntry.update({ where: { id }, data: { version: { increment: 1 } } });
        await this.audit(tx, userId, scope.hotel.tenantId, id, "HOTEL_REVENUE_ENTRY_COLLECTED", { hotelId, input });
        return { id, version: updated.version };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.hotelRevenueCollection.findUnique({ where: { hotelId_idempotencyKey: { hotelId, idempotencyKey: input.idempotencyKey } } });
        if (existing) { this.assertReplay(requestHash, existing); const entry = await this.prisma.hotelRevenueEntry.findFirst({ where: { id, hotelId } }); if (entry) { this.access.assertRoomAccess(scope, entry.roomId); return { id, version: entry.version }; } }
      }
      return this.storageError(error);
    }
  }
  async void(userId: string, roleId: string, hotelId: string, id: string, input: VoidRevenueEntry) {
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const entry = await this.lockedEntry(tx, scope, id);
        if (entry.voidedAt) return { id, version: entry.version };
        if (entry.version !== input.version) throw changed();
        if (entry.collections.length) throw new BadRequestException("Khoản này đã có tiền thu. Vui lòng đối soát và xử lý hoàn tiền với quản lý trước khi hủy.");
        const updated = await tx.hotelRevenueEntry.update({ where: { id }, data: { voidedAt: new Date(), voidReason: input.reason, version: { increment: 1 } } });
        await this.audit(tx, userId, scope.hotel.tenantId, id, "HOTEL_REVENUE_ENTRY_VOIDED", { hotelId, reason: input.reason });
        return { id, version: updated.version };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { return this.storageError(error); }
  }
}
