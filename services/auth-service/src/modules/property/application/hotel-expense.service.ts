import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "@prisma/client";
import { resolveTimeZone } from "../../../common/time/vietnam-temporal";
import { PrismaService } from "../../../prisma/prisma.service";
import { HotelAccessService, type HotelRoomScope } from "./hotel-access.service";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type CreateHotelExpenseInput,
  type ExpenseCategory,
  type ExpensePaymentMethod,
  type ExpensePaymentStatus,
  type ListHotelExpensesQuery,
  type PayHotelExpenseInput,
  type UpdateHotelExpenseInput,
  type VoidHotelExpenseInput,
} from "../domain/schemas/hotel-expense.schema";

const MAX_RANGE_DAYS = 366;

const num = (value: Prisma.Decimal | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
};

const plainDateFromYmd = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

const ymdFromDate = (value: Date): string => value.toISOString().slice(0, 10);

const fingerprint = (payload: unknown): string =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

function isMissingExpenseStorageError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022";
  }
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /HotelExpense|hotelExpense/i.test(msg) && /does not exist|findMany/i.test(msg);
}

function resolvePaymentAllocation(input: {
  expenseDate: string;
  amount: number;
  paidAmount?: number;
  paymentStatus: ExpensePaymentStatus;
  paymentMethod?: ExpensePaymentMethod | null;
  paidAt?: string | null;
}) {
  if (input.paymentStatus === "PAID") {
    return {
      paidAmount: input.amount,
      paymentStatus: "PAID" as const,
      paymentMethod: input.paymentMethod ?? ("CASH" as const),
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(`${input.expenseDate}T12:00:00.000Z`),
    };
  }
  if (input.paymentStatus === "UNPAID") {
    return {
      paidAmount: 0,
      paymentStatus: "UNPAID" as const,
      paymentMethod: null,
      paidAt: null,
    };
  }
  const partialPaid = Math.max(0, Math.min(input.amount, input.paidAmount ?? 0));
  if (partialPaid <= 0 || partialPaid >= input.amount) {
    throw new BadRequestException(
      "Thanh toán một phần cần số tiền đã trả lớn hơn 0 và nhỏ hơn tổng chi phí",
    );
  }
  return {
    paidAmount: partialPaid,
    paymentStatus: "PARTIAL" as const,
    paymentMethod: input.paymentMethod ?? ("BANK_TRANSFER" as const),
    paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
  };
}

@Injectable()
export class HotelExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HotelAccessService,
  ) {}

  private resolvePeriodWindow(query: ListHotelExpensesQuery, rawTimeZone: string | null | undefined) {
    const timeZone = resolveTimeZone(rawTimeZone);
    const today = Temporal.Now.plainDateISO(timeZone);
    const defaultFrom = today.with({ day: 1 }).toString();
    const defaultTo = today.with({ day: today.daysInMonth }).toString();

    const from = query.from ?? query.to ?? defaultFrom;
    const to = query.to ?? query.from ?? defaultTo;

    const fromPlain = Temporal.PlainDate.from(from);
    const toPlain = Temporal.PlainDate.from(to);
    if (Temporal.PlainDate.compare(fromPlain, toPlain) > 0) {
      throw new BadRequestException("Ngày bắt đầu không được lớn hơn ngày kết thúc");
    }
    const daySpan = fromPlain.until(toPlain, { largestUnit: "day" }).days + 1;
    if (daySpan > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Khoảng thời gian tra cứu chi phí tối đa ${MAX_RANGE_DAYS} ngày`);
    }

    return { from, to, timeZone };
  }

  private async resolveRoomSnapshot(scope: HotelRoomScope, roomId?: string | null): Promise<string | null> {
    if (!roomId) {
      if (scope.allowedRoomId !== null || scope.allowedRoomIds) {
        this.access.assertRoomAccess(scope, null);
      }
      return null;
    }
    this.access.assertRoomAccess(scope, roomId);
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, hotelId: scope.hotel.id },
      select: { id: true, roomNumber: true },
    });
    if (!room) {
      throw new NotFoundException("Không tìm thấy phòng thuộc khách sạn");
    }
    return room.roomNumber;
  }

  private storageError(error: unknown): never {
    if (isMissingExpenseStorageError(error)) {
      throw new ServiceUnavailableException(
        "Sổ chi phí tạm thời không khả dụng. Vui lòng thử lại sau.",
      );
    }
    throw error;
  }

  private async lockActiveExpense(
    tx: Prisma.TransactionClient,
    scope: HotelRoomScope,
    id: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "HotelExpense" WHERE id = ${id} AND "hotelId" = ${scope.hotel.id} FOR UPDATE`;
    const row = await tx.hotelExpense.findFirst({
      where: { id, hotelId: scope.hotel.id },
    });
    if (!row) {
      throw new NotFoundException("Không tìm thấy khoản chi phí");
    }
    if (row.roomId || scope.allowedRoomId !== null || scope.allowedRoomIds) {
      this.access.assertRoomAccess(scope, row.roomId);
    }
    return row;
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actorId: string,
    tenantId: string,
    entityId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        actorId,
        tenantId,
        action,
        entityType: "HOTEL_EXPENSE",
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  async listExpenses(
    userId: string,
    roleId: string,
    hotelId: string,
    query: ListHotelExpensesQuery,
  ) {
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);
    const { from, to, timeZone } = this.resolvePeriodWindow(query, scope.hotel.timezone);
    const fromDate = plainDateFromYmd(from);
    const toDate = plainDateFromYmd(to);

    const roomWhere: Prisma.HotelExpenseWhereInput = scope.allowedRoomIds
      ? { roomId: { in: scope.allowedRoomIds } }
      : scope.allowedRoomId
        ? { roomId: scope.allowedRoomId }
        : {};

    const where: Prisma.HotelExpenseWhereInput = {
      hotelId,
      expenseDate: { gte: fromDate, lte: toDate },
      ...(query.category ? { category: query.category } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.includeVoided ? {} : { voidedAt: null }),
      ...roomWhere,
    };

    const [rows, saasRows, rooms] = await Promise.all([
      this.prisma.hotelExpense.findMany({
        where,
        include: {
          room: { select: { roomNumber: true } },
        },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.platformBillableDay.findMany({
        where: {
          hotelId,
          serviceDate: { gte: fromDate, lte: toDate },
        },
        select: { amount: true },
      }),
      this.prisma.room.findMany({
        where: {
          hotelId,
          ...(scope.allowedRoomIds
            ? { id: { in: scope.allowedRoomIds } }
            : scope.allowedRoomId
              ? { id: scope.allowedRoomId }
              : {}),
        },
        select: { id: true, roomNumber: true },
        orderBy: { roomNumber: "asc" },
      }),
    ]).catch((error: unknown) => this.storageError(error));

    const saasFeeInPeriod = saasRows.reduce((sum, item) => sum + num(item.amount), 0);

    const categoryMap = new Map<
      ExpenseCategory,
      { amount: number; paidAmount: number; unpaidAmount: number; count: number }
    >();
    for (const cat of EXPENSE_CATEGORIES) {
      categoryMap.set(cat, { amount: 0, paidAmount: 0, unpaidAmount: 0, count: 0 });
    }

    let totalExpense = 0;
    let paidExpense = 0;
    let unpaidExpense = 0;
    let activeCount = 0;
    let unpaidCount = 0;

    const items = rows.map((row) => {
      const amount = num(row.amount);
      const paidAmount = Math.min(amount, Math.max(0, num(row.paidAmount)));
      const unpaidAmount = Math.max(0, amount - paidAmount);
      const isVoided = Boolean(row.voidedAt);
      const cat = (
        EXPENSE_CATEGORIES.includes(row.category as ExpenseCategory) ? row.category : "OTHER"
      ) as ExpenseCategory;

      if (!isVoided) {
        activeCount += 1;
        totalExpense += amount;
        paidExpense += paidAmount;
        unpaidExpense += unpaidAmount;
        if (unpaidAmount > 0) {
          unpaidCount += 1;
        }
        const bucket = categoryMap.get(cat)!;
        bucket.amount += amount;
        bucket.paidAmount += paidAmount;
        bucket.unpaidAmount += unpaidAmount;
        bucket.count += 1;
      }

      return {
        id: row.id,
        expenseDate: ymdFromDate(row.expenseDate),
        category: cat,
        categoryLabel: EXPENSE_CATEGORY_LABELS[cat],
        title: row.title,
        vendorName: row.vendorName,
        roomId: row.roomId,
        roomNumber: row.room?.roomNumber ?? row.roomNumberSnapshot ?? null,
        amount,
        paidAmount,
        unpaidAmount,
        paymentStatus: row.paymentStatus as ExpensePaymentStatus,
        paymentMethod: row.paymentMethod as ExpensePaymentMethod | null,
        paidAt: row.paidAt ? row.paidAt.toISOString() : null,
        documentNumber: row.documentNumber,
        notes: row.notes,
        version: row.version,
        voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
        voidReason: row.voidReason,
        createdAt: row.createdAt.toISOString(),
      };
    });

    const totalWithSaas = totalExpense + saasFeeInPeriod;

    const byCategory = EXPENSE_CATEGORIES.map((cat) => {
      const stat = categoryMap.get(cat)!;
      return {
        category: cat,
        categoryLabel: EXPENSE_CATEGORY_LABELS[cat],
        amount: stat.amount,
        paidAmount: stat.paidAmount,
        unpaidAmount: stat.unpaidAmount,
        count: stat.count,
        sharePercent: totalExpense > 0 ? Math.round((stat.amount / totalExpense) * 1000) / 10 : 0,
      };
    }).sort((a, b) => b.amount - a.amount);

    return {
      hotelId: scope.hotel.id,
      hotelName: scope.hotel.name,
      currency: "VND",
      timeZone,
      from,
      to,
      summary: {
        totalExpense,
        paidExpense,
        unpaidExpense,
        saasFeeInPeriod,
        totalWithSaas,
        entryCount: activeCount,
        unpaidCount,
      },
      byCategory,
      items,
      rooms,
    };
  }

  async create(
    userId: string,
    roleId: string,
    hotelId: string,
    input: CreateHotelExpenseInput,
  ) {
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);
    const roomNumberSnapshot = await this.resolveRoomSnapshot(scope, input.roomId);
    const payment = resolvePaymentAllocation(input);
    const { idempotencyKey, ...hashPayload } = input;
    const requestHash = fingerprint(hashPayload);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.hotelExpense.findUnique({
            where: { hotelId_idempotencyKey: { hotelId, idempotencyKey } },
          });
          if (existing) {
            if (existing.requestHash !== requestHash) {
              throw new ConflictException("Yêu cầu ghi chi phí trùng mã nhưng nội dung khác nhau");
            }
            return { id: existing.id, version: existing.version };
          }

          const created = await tx.hotelExpense.create({
            data: {
              hotelId,
              roomId: input.roomId || null,
              roomNumberSnapshot,
              expenseDate: plainDateFromYmd(input.expenseDate),
              category: input.category,
              title: input.title,
              vendorName: input.vendorName || null,
              amount: input.amount,
              paidAmount: payment.paidAmount,
              paymentStatus: payment.paymentStatus,
              paymentMethod: payment.paymentMethod,
              paidAt: payment.paidAt,
              documentNumber: input.documentNumber || null,
              notes: input.notes || null,
              idempotencyKey,
              requestHash,
              createdByUserId: userId,
            },
          });

          await this.writeAudit(tx, userId, scope.hotel.tenantId, created.id, "HOTEL_EXPENSE_CREATED", {
            hotelId,
            category: input.category,
            amount: input.amount,
            paymentStatus: payment.paymentStatus,
            expenseDate: input.expenseDate,
          });

          return { id: created.id, version: created.version };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.hotelExpense.findUnique({
          where: { hotelId_idempotencyKey: { hotelId, idempotencyKey } },
        });
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictException("Yêu cầu ghi chi phí trùng mã nhưng nội dung khác nhau");
          }
          return { id: existing.id, version: existing.version };
        }
      }
      return this.storageError(error);
    }
  }

  async update(
    userId: string,
    roleId: string,
    hotelId: string,
    expenseId: string,
    input: UpdateHotelExpenseInput,
  ) {
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);
    const roomNumberSnapshot = await this.resolveRoomSnapshot(scope, input.roomId);
    const payment = resolvePaymentAllocation(input);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const entry = await this.lockActiveExpense(tx, scope, expenseId);
          if (entry.version !== input.version) {
            throw new ConflictException("Khoản chi đã được cập nhật trước đó, vui lòng tải lại");
          }
          if (entry.voidedAt) {
            throw new BadRequestException("Khoản chi đã hủy không thể chỉnh sửa");
          }

          const updated = await tx.hotelExpense.update({
            where: { id: expenseId },
            data: {
              expenseDate: plainDateFromYmd(input.expenseDate),
              category: input.category,
              title: input.title,
              vendorName: input.vendorName || null,
              roomId: input.roomId || null,
              roomNumberSnapshot,
              amount: input.amount,
              paidAmount: payment.paidAmount,
              paymentStatus: payment.paymentStatus,
              paymentMethod: payment.paymentMethod,
              paidAt: payment.paidAt,
              documentNumber: input.documentNumber || null,
              notes: input.notes || null,
              version: { increment: 1 },
            },
          });

          await this.writeAudit(tx, userId, scope.hotel.tenantId, expenseId, "HOTEL_EXPENSE_UPDATED", {
            hotelId,
            before: {
              amount: num(entry.amount),
              paidAmount: num(entry.paidAmount),
              paymentStatus: entry.paymentStatus,
              category: entry.category,
              expenseDate: ymdFromDate(entry.expenseDate),
            },
            after: {
              amount: input.amount,
              paidAmount: payment.paidAmount,
              paymentStatus: payment.paymentStatus,
              category: input.category,
              expenseDate: input.expenseDate,
            },
          });

          return { id: updated.id, version: updated.version };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.storageError(error);
    }
  }

  async markPaid(
    userId: string,
    roleId: string,
    hotelId: string,
    expenseId: string,
    input: PayHotelExpenseInput,
  ) {
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const entry = await this.lockActiveExpense(tx, scope, expenseId);
          if (entry.version !== input.version) {
            throw new ConflictException("Khoản chi đã được cập nhật trước đó, vui lòng tải lại");
          }
          if (entry.voidedAt) {
            throw new BadRequestException("Khoản chi đã hủy không thể thanh toán");
          }

          const totalAmount = num(entry.amount);
          const alreadyPaid = num(entry.paidAmount);
          const remaining = Math.max(0, totalAmount - alreadyPaid);
          if (remaining <= 0 || entry.paymentStatus === "PAID") {
            throw new BadRequestException("Khoản chi này đã được tất toán toàn bộ");
          }

          const applied = input.markFull ? remaining : (input.payAmount ?? 0);
          if (applied <= 0) {
            throw new BadRequestException("Số tiền thanh toán phải lớn hơn 0");
          }
          if (applied > remaining + 0.01) {
            throw new BadRequestException("Số tiền thanh toán vượt quá số dư còn nợ của khoản chi");
          }

          const nextPaid = Math.min(totalAmount, alreadyPaid + applied);
          const nextStatus: ExpensePaymentStatus = nextPaid >= totalAmount - 0.01 ? "PAID" : "PARTIAL";
          const mergedNotes = input.notes
            ? [entry.notes, input.notes].filter(Boolean).join("\n")
            : entry.notes;

          const updated = await tx.hotelExpense.update({
            where: { id: expenseId },
            data: {
              paidAmount: nextStatus === "PAID" ? totalAmount : nextPaid,
              paymentStatus: nextStatus,
              paymentMethod: input.paymentMethod,
              paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
              notes: mergedNotes ? mergedNotes.slice(0, 1000) : null,
              version: { increment: 1 },
            },
          });

          await this.writeAudit(tx, userId, scope.hotel.tenantId, expenseId, "HOTEL_EXPENSE_PAID", {
            hotelId,
            appliedAmount: applied,
            nextPaidAmount: num(updated.paidAmount),
            nextStatus,
            paymentMethod: input.paymentMethod,
          });

          return { id: updated.id, version: updated.version };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.storageError(error);
    }
  }

  async voidExpense(
    userId: string,
    roleId: string,
    hotelId: string,
    expenseId: string,
    input: VoidHotelExpenseInput,
  ) {
    const scope = await this.access.resolveRoomScope(userId, roleId, hotelId);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const entry = await this.lockActiveExpense(tx, scope, expenseId);
          if (entry.voidedAt) {
            return { id: entry.id, version: entry.version };
          }
          if (entry.version !== input.version) {
            throw new ConflictException("Khoản chi đã được cập nhật trước đó, vui lòng tải lại");
          }

          const updated = await tx.hotelExpense.update({
            where: { id: expenseId },
            data: {
              voidedAt: new Date(),
              voidReason: input.reason,
              version: { increment: 1 },
            },
          });

          await this.writeAudit(tx, userId, scope.hotel.tenantId, expenseId, "HOTEL_EXPENSE_VOIDED", {
            hotelId,
            reason: input.reason,
            amount: num(entry.amount),
          });

          return { id: updated.id, version: updated.version };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      return this.storageError(error);
    }
  }
}
