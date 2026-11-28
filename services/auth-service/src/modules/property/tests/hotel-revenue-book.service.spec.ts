import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { HotelRevenueBookService } from "../application/hotel-revenue-book.service";
import type { HotelAccessService } from "../application/hotel-access.service";
import type { PrismaService } from "../../../prisma/prisma.service";
import { collectRevenueEntrySchema, createRevenueEntrySchema, updateRevenueEntrySchema, updateRevenueNoteSchema } from "../domain/schemas/hotel-revenue-book.schema";

const D = (amount: string | number) => new Prisma.Decimal(amount);
const collectionInput = () => collectRevenueEntrySchema.parse({ amount: 40, method: "CASH", receivedAt: "2026-11-13T02:00:00Z", idempotencyKey: "collect-once", version: 1 });
const createInput = () => createRevenueEntrySchema.parse({ date: "2026-11-13", description: "Giặt ủi ngoài danh mục", category: "LAUNDRY", amount: 100, idempotencyKey: "create-once" });
const entryFixture = () => ({ id: "entry-1", hotelId: "hotel-a", roomId: null as string | null, roomNumberSnapshot: null, date: new Date("2026-11-13T00:00:00Z"), description: "Giặt ủi ngoài danh mục", category: "LAUNDRY", amount: D(100), documentNumber: null, notes: null, version: 1, voidedAt: null as Date | null, collections: [] as Array<{ id: string; amount: Prisma.Decimal; receivedAt: Date; method: string; reference: null; idempotencyKey: string; requestHash: string }> });

// Interpret only ordinary scalar/boolean/relation predicates at the mocked DB boundary.
// This lets the future-service receipt regression exercise the real query selection.
function matches(value: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== "object") return value === condition;
  const row = value as Record<string, unknown>;
  const comparable = (input: unknown) => input instanceof Date ? input.getTime() : input as number;
  return Object.entries(condition).every(([key, expected]) => {
    if (key === "AND") return (Array.isArray(expected) ? expected : [expected]).every((part) => matches(value, part));
    if (key === "OR") return (expected as unknown[]).some((part) => matches(value, part));
    if (key === "lt") return comparable(value) < comparable(expected);
    if (key === "gte") return comparable(value) >= comparable(expected);
    if (key === "in") return (expected as unknown[]).includes(value);
    if (key === "some") return Array.isArray(value) && value.some((item) => matches(item, expected));
    return matches(row?.[key], expected);
  });
}

function setup() {
  const entry = entryFixture();
  const scope = { hotel: { id: "hotel-a", tenantId: "tenant-a", name: "A21", timezone: "Asia/Ho_Chi_Minh" }, allowedRoomId: null, allowedRoomIds: null };
  const access = {
    resolveRoomScope: jest.fn().mockResolvedValue(scope),
    loadActorContext: jest.fn().mockResolvedValue({ isSuperAdmin: false, permissions: new Set(["hotel.billing.manage"]) }),
    assertRoomAccess: jest.fn(),
  };
  const notesStore: Array<{ hotelId: string; accountKey: string; roomId: string | null; notes: string }> = [];
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: entry.id }]),
    folio: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id: string; hotelId: string } }) => {
        if (where.id === "folio-1") return { id: "folio-1", roomId: "room-1" };
        if (where.id === "folio-2") return { id: "folio-2", roomId: "foreign-room" };
        return null;
      }),
    },
    bookingPayment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: Record<string, any> }) => {
        if (where.id === "dep-1") return { id: "dep-1", notes: null, reservation: { roomId: "room-1" } };
        if (where.id === "dep-legacy") return { id: "dep-legacy", notes: "Cọc chuyển khoản cũ", reservation: { roomId: "room-1" } };
        if (where.idempotencyKey?.startsWith?.includes("depgrp")) {
          return {
            id: "dep-cash",
            notes: "Cọc kết hợp",
            reservationId: "res-1",
            groupId: null,
            reservation: { roomId: "room-1" },
          };
        }
        return null;
      }),
      update: jest.fn().mockImplementation(async ({ where, data }: Record<string, any>) => ({ id: where.id, ...data })),
      updateMany: jest.fn().mockImplementation(async ({ where, data }: Record<string, any>) => ({ count: 1 })),
    },
    room: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue({ roomNumber: "101" }) },
    hotelRevenueEntry: {
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) => where.id === entry.id ? entry : null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...entry, ...data, version: 1 })),
      update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(entry, { ...data, version: entry.version + 1 }); return entry; }),
    },
    hotelRevenueCollection: {
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { hotelId_idempotencyKey: { idempotencyKey: string } } }) => entry.collections.find((item) => item.idempotencyKey === where.hotelId_idempotencyKey.idempotencyKey) ?? null),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { const payment = { ...data, id: "collection-1", amount: D(data.amount as number), reference: null } as typeof entry.collections[number]; entry.collections.push(payment); return payment; }),
    },
    hotelRevenueNote: {
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { hotelId_accountKey: { hotelId: string; accountKey: string } } }) => {
        return notesStore.find((n) => n.hotelId === where.hotelId_accountKey.hotelId && n.accountKey === where.hotelId_accountKey.accountKey) ?? null;
      }),
      findMany: jest.fn().mockImplementation(async ({ where }: { where: { hotelId: string; roomId?: { in: string[] } } }) => {
        return notesStore.filter((n) => n.hotelId === where.hotelId && (!where.roomId || (n.roomId && where.roomId.in.includes(n.roomId))));
      }),
      upsert: jest.fn().mockImplementation(async ({ create, update, where }: { create: Record<string, unknown>; update: Record<string, unknown>; where: { hotelId_accountKey: { hotelId: string; accountKey: string } } }) => {
        const existingIdx = notesStore.findIndex((n) => n.hotelId === where.hotelId_accountKey.hotelId && n.accountKey === where.hotelId_accountKey.accountKey);
        const record = { hotelId: where.hotelId_accountKey.hotelId, accountKey: where.hotelId_accountKey.accountKey, roomId: (create.roomId ?? update.roomId ?? null) as string | null, notes: (create.notes ?? update.notes ?? "") as string };
        if (existingIdx >= 0) {
          notesStore[existingIdx] = record;
        } else {
          notesStore.push(record);
        }
        return record;
      }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  const prisma = { ...tx, $transaction: jest.fn().mockImplementation(async (run: (client: typeof tx) => unknown) => run(tx)) };
  const service = new HotelRevenueBookService(prisma as unknown as PrismaService, access as unknown as HotelAccessService);
  return { service, prisma, tx, entry, access };
}

describe("hotel revenue book workflows", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date("2026-11-14T00:00:00Z")); });
  afterEach(() => { jest.useRealTimers(); });
  it("creates a standalone off-catalog entry with audit and no fabricated room or guest", async () => {
    const { service, tx } = setup();
    expect(await service.create("user-a", "role-a", "hotel-a", createInput())).toEqual({ id: "entry-1", version: 1 });
    expect(tx.hotelRevenueEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ hotelId: "hotel-a", roomId: null, description: "Giặt ủi ngoài danh mục", category: "LAUNDRY" }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorId: "user-a", tenantId: "tenant-a", action: "HOTEL_REVENUE_ENTRY_CREATED" }) }));
  });

  it("denies hotel access before reading or writing data", async () => {
    const { service, access, prisma, tx } = setup();
    access.resolveRoomScope.mockRejectedValue(new ForbiddenException("Khách sạn không thuộc phạm vi"));
    await expect(service.create("user-a", "role-a", "hotel-b", createInput())).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.hotelRevenueEntry.create).not.toHaveBeenCalled();
  });

  it("rejects a room denied by access scope and an entry missing from the requested hotel", async () => {
    const first = setup();
    first.access.assertRoomAccess.mockImplementation(() => { throw new NotFoundException("Phòng không thuộc phạm vi"); });
    await expect(first.service.create("user-a", "role-a", "hotel-a", { ...createInput(), roomId: "foreign-room" })).rejects.toBeInstanceOf(NotFoundException);
    expect(first.tx.hotelRevenueEntry.create).not.toHaveBeenCalled();
    const second = setup();
    second.tx.$queryRaw.mockResolvedValue([]);
    await expect(second.service.collect("user-a", "role-a", "hotel-a", "foreign-entry", collectionInput())).rejects.toBeInstanceOf(NotFoundException);
    expect(second.tx.hotelRevenueCollection.create).not.toHaveBeenCalled();
  });

  it("rejects stale collection versions without taking money", async () => {
    const { service, entry, tx } = setup();
    entry.version = 2;
    await expect(service.collect("user-a", "role-a", "hotel-a", entry.id, collectionInput())).rejects.toBeInstanceOf(ConflictException);
    expect(tx.hotelRevenueCollection.create).not.toHaveBeenCalled();
  });

  it("replays a successful collection once even after its original version became stale", async () => {
    const { service, entry, tx } = setup();
    const input = collectionInput();
    await expect(service.collect("user-a", "role-a", "hotel-a", entry.id, input)).resolves.toEqual({ id: entry.id, version: 2 });
    await expect(service.collect("user-a", "role-a", "hotel-a", entry.id, input)).resolves.toEqual({ id: entry.id, version: 2 });
    expect(tx.hotelRevenueCollection.create).toHaveBeenCalledTimes(1);
    expect(entry.collections.reduce((sum, payment) => sum.add(payment.amount), D(0)).toNumber()).toBe(40);
  });

  it("rejects overcollection, modifying recorded financial fields, and voiding a paid entry", async () => {
    const { service, entry, tx } = setup();
    entry.collections.push({ id: "paid", amount: D(80), receivedAt: new Date("2026-11-13T01:00:00Z"), method: "CASH", reference: null, idempotencyKey: "previous", requestHash: "previous" });
    await expect(service.collect("user-a", "role-a", "hotel-a", entry.id, collectionInput())).rejects.toThrow("vượt quá");
    const lowerAmount = updateRevenueEntrySchema.parse({ date: "2026-11-13", description: entry.description, category: "LAUNDRY", amount: 50, version: 1 });
    const higherAmount = updateRevenueEntrySchema.parse({ date: "2026-11-13", description: entry.description, category: "LAUNDRY", amount: 150, version: 1 });
    const changedCategory = updateRevenueEntrySchema.parse({ date: "2026-11-13", description: entry.description, category: "OTHER", amount: 100, version: 1 });
    const changedDate = updateRevenueEntrySchema.parse({ date: "2026-11-14", description: entry.description, category: "LAUNDRY", amount: 100, version: 1 });
    await expect(service.update("user-a", "role-a", "hotel-a", entry.id, lowerAmount)).rejects.toThrow("Không được chỉnh sửa số tiền");
    await expect(service.update("user-a", "role-a", "hotel-a", entry.id, higherAmount)).rejects.toThrow("Không được chỉnh sửa số tiền");
    await expect(service.update("user-a", "role-a", "hotel-a", entry.id, changedCategory)).rejects.toThrow("Không được chỉnh sửa ngày phát sinh hoặc nhóm doanh thu");
    await expect(service.update("user-a", "role-a", "hotel-a", entry.id, changedDate)).rejects.toThrow("Không được chỉnh sửa ngày phát sinh hoặc nhóm doanh thu");
    await expect(service.void("user-a", "role-a", "hotel-a", entry.id, { version: 1, reason: "Nhập nhầm" })).rejects.toThrow("đã có tiền thu");
    expect(tx.hotelRevenueEntry.update).not.toHaveBeenCalled();
    expect(tx.hotelRevenueCollection.create).not.toHaveBeenCalled();
  });

  it("allows updating non-financial metadata without altering recorded financial fields", async () => {
    const { service, entry, tx } = setup();
    const update = updateRevenueEntrySchema.parse({
      date: "2026-11-13",
      description: "Giặt ủi ngoài danh mục (đã đối chiếu)",
      category: "LAUNDRY",
      amount: 100,
      documentNumber: "PT-099",
      notes: "Khách đã xác nhận",
      version: 1,
    });
    await expect(service.update("user-a", "role-a", "hotel-a", entry.id, update)).resolves.toEqual({ id: entry.id, version: 2 });
    expect(tx.hotelRevenueEntry.update).toHaveBeenCalledWith({
      where: { id: entry.id },
      data: {
        description: "Giặt ủi ngoài danh mục (đã đối chiếu)",
        roomId: null,
        roomNumberSnapshot: null,
        documentNumber: "PT-099",
        notes: "Khách đã xác nhận",
        version: { increment: 1 },
      },
    });
  });

  it("records an unpaid cancellation with audit and keeps repeat cancellation harmless", async () => {
    const { service, entry, tx } = setup();
    await service.void("user-a", "role-a", "hotel-a", entry.id, { version: 1, reason: "Nhập nhầm khoản giặt ủi" });
    expect(entry.voidedAt).toBeInstanceOf(Date);
    await service.void("user-a", "role-a", "hotel-a", entry.id, { version: 1, reason: "Nhập nhầm khoản giặt ủi" });
    expect(tx.hotelRevenueEntry.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("includes a receipt before its future service date and reports advance credit without revenue", async () => {
    const { service, entry, tx } = setup();
    entry.date = new Date("2026-11-20T00:00:00Z");
    entry.collections.push({ id: "advance", receivedAt: new Date("2026-11-13T01:00:00Z"), amount: D(40), method: "CASH", reference: null, idempotencyKey: "advance", requestHash: "advance" });
    tx.hotelRevenueEntry.findMany.mockImplementation(async ({ where }: { where: unknown }) => matches(entry, where) ? [entry] : []);
    const book = await service.getBook("user-a", "role-a", "hotel-a", { from: "2026-11-13", to: "2026-11-13" });
    expect(book.entries).toHaveLength(1);
    expect(book.summary).toMatchObject({ revenueTotal: 0, collectedTotal: 40, cashTotal: 40, closingBalance: -40 });
  });

  it("does not recognize a cancellation before the future charge it cancels", async () => {
    const { service, entry, tx } = setup();
    entry.date = new Date("2026-11-20T00:00:00Z");
    entry.voidedAt = new Date("2026-11-13T02:00:00Z");
    tx.hotelRevenueEntry.findMany.mockResolvedValue([entry]);
    const book = await service.getBook("user-a", "role-a", "hotel-a", { from: "2026-11-13", to: "2026-11-20" });
    expect(book.summary).toMatchObject({ revenueTotal: 0, collectedTotal: 0, closingBalance: 0 });
    expect(book.entries.flatMap((row) => row.revenueLines).some((line) => line.date === "2026-11-13")).toBe(false);
  });

  it("counts a native deposit receipt once while cancelling its allocation across the folio and deposit", async () => {
    const { service, tx } = setup();
    const date = new Date("2026-11-13T01:00:00Z");
    tx.folio.findMany.mockResolvedValue([{
      id: "folio-1", currency: "VND", roomId: "room-1", room: { roomNumber: "101" }, openedAt: date, folioNumber: "F-001", voidedAt: null,
      stay: { guestDisplayName: "Nguyễn An", kbttGuestDeclarations: [] },
      items: [{ itemType: "ROOM_CHARGE", nameSnapshot: "Tiền phòng", metadataSnapshotJson: null, serviceItem: null, postedAt: date, totalSnapshot: D(200), discountAmountSnapshot: D(0), voidedAt: null }],
      payments: [{ id: "synthetic", metadataJson: { source: "booking_deposit" }, confirmedAt: date, paidAmount: D(100), refundedAmount: D(0), method: "BANK_TRANSFER", paymentNumber: "DP-1", transactions: [] }],
      bookingPaymentAllocations: [{ allocatedAt: date, allocatedAmount: D(100) }], hotelReceivables: [],
    }]);
    tx.bookingPayment.findMany.mockResolvedValue([{ id: "deposit-1", status: "ALLOCATED", receivedAt: date, receivedAmount: D(100), paymentMethod: "BANK_TRANSFER", transactionReference: "BANK-1", notes: null, reservation: { guestDisplayName: "Nguyễn An", reservationCode: "R-001", roomId: "room-1", room: { roomNumber: "101" } }, allocations: [{ allocatedAt: date, allocatedAmount: D(100) }] }]);
    const book = await service.getBook("user-a", "role-a", "hotel-a", { from: "2026-11-13", to: "2026-11-13" });
    expect(book.summary).toMatchObject({ revenueTotal: 200, collectedTotal: 100, bankTransferTotal: 100, balanceAdjustment: 0, closingBalance: 100 });
    expect(book.entries.flatMap((row) => row.collections).map((payment) => payment.id)).toEqual(["deposit-1"]);
  });

  it("applies multi-dimensional query filters and recalculates summary totals from filtered entries", async () => {
    const { service, tx } = setup();
    const date = new Date("2026-11-13T01:00:00Z");

    tx.folio.findMany.mockResolvedValue([{
      id: "folio-1", currency: "VND", roomId: "room-1", room: { roomNumber: "101" }, openedAt: date, folioNumber: "F-001", voidedAt: null,
      stay: { guestDisplayName: "Nguyễn An", kbttGuestDeclarations: [] },
      items: [
        { itemType: "ROOM_CHARGE", nameSnapshot: "Tiền phòng", metadataSnapshotJson: null, serviceItem: null, postedAt: date, totalSnapshot: D(500), discountAmountSnapshot: D(0), voidedAt: null },
        { itemType: "SERVICE", nameSnapshot: "Nước suối minibar", metadataSnapshotJson: null, serviceItem: null, postedAt: date, totalSnapshot: D(50), discountAmountSnapshot: D(0), voidedAt: null },
      ],
      payments: [{ id: "pay-bank", metadataJson: null, confirmedAt: date, paidAmount: D(200), refundedAmount: D(0), method: "BANK_TRANSFER", paymentNumber: "P-1", transactions: [] }],
      bookingPaymentAllocations: [], hotelReceivables: [],
    }]);

    tx.hotelRevenueEntry.findMany.mockResolvedValue([
      {
        id: "manual-laundry", hotelId: "hotel-a", roomId: null, roomNumberSnapshot: null,
        date: new Date("2026-11-13T00:00:00Z"), description: "Giặt ủi", category: "LAUNDRY", amount: D(120),
        documentNumber: "PT-01", notes: null, version: 1, voidedAt: null,
        collections: [{ id: "col-cash", amount: D(120), receivedAt: date, method: "CASH", reference: null }],
      },
      {
        id: "manual-other", hotelId: "hotel-a", roomId: null, roomNumberSnapshot: null,
        date: new Date("2026-11-13T00:00:00Z"), description: "Phụ thu", category: "OTHER", amount: D(80),
        documentNumber: "PT-02", notes: null, version: 1, voidedAt: null,
        collections: [{ id: "col-momo", amount: D(80), receivedAt: date, method: "MOMO", reference: null }],
      },
    ]);

    const laundryCash = await service.getBook("user-a", "role-a", "hotel-a", {
      from: "2026-11-13",
      to: "2026-11-13",
      category: "LAUNDRY",
      paymentMethod: "CASH",
      settlementStatus: "SETTLED",
    });
    expect(laundryCash.entries.map((e) => e.id)).toEqual(["manual-laundry"]);
    expect(laundryCash.summary).toMatchObject({
      roomRevenue: 0,
      laundryRevenue: 120,
      revenueTotal: 120,
      collectedTotal: 120,
      cashTotal: 120,
      bankTransferTotal: 0,
      closingBalance: 0,
    });

    const unpaidMinibar = await service.getBook("user-a", "role-a", "hotel-a", {
      from: "2026-11-13",
      to: "2026-11-13",
      source: "FOLIO",
      category: "MINIBAR",
      settlementStatus: "UNPAID",
    });
    expect(unpaidMinibar.entries.map((e) => e.id)).toEqual(["folio:folio-1"]);
    expect(unpaidMinibar.summary).toMatchObject({
      roomRevenue: 500,
      minibarRevenue: 50,
      revenueTotal: 550,
      collectedTotal: 200,
      bankTransferTotal: 200,
      closingBalance: 350,
    });

    const otherMethod = await service.getBook("user-a", "role-a", "hotel-a", {
      from: "2026-11-13",
      to: "2026-11-13",
      paymentMethod: "OTHER",
    });
    expect(otherMethod.entries.map((e) => e.id)).toEqual(["manual-other"]);
    expect(otherMethod.summary).toMatchObject({
      otherRevenue: 80,
      revenueTotal: 80,
      collectedTotal: 80,
      otherCollectedTotal: 80,
    });
  });

  it("groups split deposit receipts and attaches splitGroupId for split folio payments", async () => {
    const { service, tx } = setup();
    const date = new Date("2026-11-13T05:30:00Z");

    tx.folio.findMany.mockResolvedValue([{
      id: "folio-split", currency: "VND", roomId: "room-1", room: { roomNumber: "101" }, openedAt: date, folioNumber: "F-SPLIT", voidedAt: null,
      stay: { guestDisplayName: "Trần Bình", kbttGuestDeclarations: [] },
      items: [{ itemType: "ROOM_CHARGE", nameSnapshot: "Tiền phòng", metadataSnapshotJson: null, serviceItem: null, postedAt: date, totalSnapshot: D(1000), discountAmountSnapshot: D(0), voidedAt: null }],
      payments: [
        { id: "p-cash", metadataJson: { source: "front_desk", splitGroupId: "grp-1" }, confirmedAt: date, paidAmount: D(400), refundedAmount: D(0), method: "CASH", paymentNumber: "P-1", transactions: [] },
        { id: "p-bank", metadataJson: { source: "front_desk", splitGroupId: "grp-1" }, confirmedAt: date, paidAmount: D(600), refundedAmount: D(0), method: "BANK_TRANSFER", paymentNumber: "P-2", transactions: [] },
      ],
      bookingPaymentAllocations: [], hotelReceivables: [],
    }]);

    tx.bookingPayment.findMany.mockResolvedValue([
      { id: "dep-cash", status: "COMPLETED", idempotencyKey: "split:depgrp:0", receivedAt: date, receivedAmount: D(200), paymentMethod: "CASH", transactionReference: null, notes: "Cọc kết hợp", reservationId: "res-1", groupId: null, reservation: { guestDisplayName: "Lê Hoa", reservationCode: "R-100", roomId: "room-1", room: { roomNumber: "101" } }, allocations: [] },
      { id: "dep-bank", status: "COMPLETED", idempotencyKey: "split:depgrp:1", receivedAt: date, receivedAmount: D(300), paymentMethod: "BANK_TRANSFER", transactionReference: "FT-99", notes: "Cọc kết hợp", reservationId: "res-1", groupId: null, reservation: { guestDisplayName: "Lê Hoa", reservationCode: "R-100", roomId: "room-1", room: { roomNumber: "101" } }, allocations: [] },
    ]);

    const book = await service.getBook("user-a", "role-a", "hotel-a", { from: "2026-11-13", to: "2026-11-13" });
    expect(book.summary).toMatchObject({ cashTotal: 600, bankTransferTotal: 900, collectedTotal: 1500 });
    const folioEntry = book.entries.find((e) => e.id === "folio:folio-split")!;
    expect(folioEntry.collections).toHaveLength(2);
    expect(folioEntry.collections[0].splitGroupId).toBe("folio:folio-split:grp-1");
    expect(folioEntry.collections[1].splitGroupId).toBe("folio:folio-split:grp-1");

    const depositEntries = book.entries.filter((e) => e.source === "DEPOSIT");
    expect(depositEntries).toHaveLength(1);
    expect(depositEntries[0].collections).toHaveLength(2);
    expect(depositEntries[0].collections[0].splitGroupId).toBe(depositEntries[0].collections[1].splitGroupId);
  });

  it("persists durable notes scoped by hotel and assigned room with permission and audit", async () => {
    const { service, tx, access } = setup();
    const input = updateRevenueNoteSchema.parse({ accountKey: "folio:folio-1", notes: "Khách nợ 500k hẹn mai trả", roomId: "room-1" });
    const result = await service.updateNote("user-a", "role-a", "hotel-a", input);
    expect(result).toEqual({ accountKey: "folio:folio-1", notes: "Khách nợ 500k hẹn mai trả" });
    expect(tx.hotelRevenueNote.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { hotelId_accountKey: { hotelId: "hotel-a", accountKey: "folio:folio-1" } },
      create: expect.objectContaining({ hotelId: "hotel-a", accountKey: "folio:folio-1", roomId: "room-1", notes: "Khách nợ 500k hẹn mai trả", updatedByUserId: "user-a" }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ actorId: "user-a", tenantId: "tenant-a", action: "HOTEL_REVENUE_NOTE_UPDATED" }),
    }));

    // Denies room outside scope
    access.assertRoomAccess.mockImplementation(() => { throw new NotFoundException("Phòng không thuộc phạm vi"); });
    await expect(service.updateNote("user-a", "role-a", "hotel-a", { accountKey: "folio:folio-2", notes: "Note", roomId: "foreign-room" })).rejects.toThrow("Phòng không thuộc phạm vi");

    // Denies when actor lacks permission
    access.assertRoomAccess.mockImplementation(() => {});
    access.loadActorContext.mockResolvedValue({ isSuperAdmin: false, permissions: new Set() });
    await expect(service.updateNote("user-a", "role-a", "hotel-a", input)).rejects.toThrow("Không có quyền");
  });

  it("supports two-device readback where Device 1 persists a note and Device 2 reads it back in getBook, while room-restricted Device 3 is denied", async () => {
    const { service, tx, access } = setup();
    const date = new Date("2026-11-13T01:00:00Z");

    const foliosFixture = [{
      id: "folio-1", currency: "VND", roomId: "room-1", room: { roomNumber: "101" }, openedAt: date, folioNumber: "F-101", voidedAt: null,
      stay: { guestDisplayName: "Trần Văn Nam", kbttGuestDeclarations: [] },
      items: [{ itemType: "ROOM_CHARGE", nameSnapshot: "Tiền phòng", metadataSnapshotJson: null, serviceItem: null, postedAt: date, totalSnapshot: D(1000), discountAmountSnapshot: D(0), voidedAt: null }],
      payments: [{ id: "pay-1", metadataJson: null, confirmedAt: date, paidAmount: D(1000), refundedAmount: D(0), method: "CASH", paymentNumber: "P-101", transactions: [] }],
      bookingPaymentAllocations: [], hotelReceivables: [],
    }];
    tx.folio.findMany.mockImplementation(async ({ where }: { where: { roomId?: { in: string[] } } }) => {
      if (where.roomId) {
        return foliosFixture.filter((f) => where.roomId!.in.includes(f.roomId));
      }
      return foliosFixture;
    });

    // Device 1: User 1 writes a durable note for folio:folio-1
    const updateResult = await service.updateNote("user-dev-1", "role-manager", "hotel-a", {
      accountKey: "folio:folio-1",
      notes: "Device 1: Khách đã xác nhận hóa đơn GTGT",
    });
    expect(updateResult).toEqual({ accountKey: "folio:folio-1", notes: "Device 1: Khách đã xác nhận hóa đơn GTGT" });

    // Device 2: User 2 on another device reads back the book
    const bookDev2 = await service.getBook("user-dev-2", "role-manager", "hotel-a", { from: "2026-11-13", to: "2026-11-13" });
    const rowDev2 = bookDev2.entries.find((e) => e.id === "folio:folio-1");
    expect(rowDev2).toBeDefined();
    expect(rowDev2?.notes).toBe("Device 1: Khách đã xác nhận hóa đơn GTGT");

    // Device 3: Room-restricted user (only permitted for room-2, not room-1)
    access.resolveRoomScope.mockResolvedValueOnce({
      hotel: { id: "hotel-a", tenantId: "tenant-a", name: "A21", timezone: "Asia/Ho_Chi_Minh" },
      allowedRoomId: "room-2",
      allowedRoomIds: ["room-2"],
    });
    const bookDev3 = await service.getBook("user-dev-3", "role-staff", "hotel-a", { from: "2026-11-13", to: "2026-11-13" });
    // Device 3 cannot see folio:folio-1 because it belongs to room-1
    expect(bookDev3.entries.find((e) => e.id === "folio:folio-1")).toBeUndefined();

    // Device 3 attempts to update note on folio:folio-1 directly
    access.resolveRoomScope.mockResolvedValueOnce({
      hotel: { id: "hotel-a", tenantId: "tenant-a", name: "A21", timezone: "Asia/Ho_Chi_Minh" },
      allowedRoomId: "room-2",
      allowedRoomIds: ["room-2"],
    });
    access.assertRoomAccess.mockImplementationOnce((scope, roomId) => {
      if (scope.allowedRoomIds && !scope.allowedRoomIds.includes(roomId)) {
        throw new NotFoundException("Phòng không thuộc quyền hạn của bạn");
      }
    });
    await expect(service.updateNote("user-dev-3", "role-staff", "hotel-a", {
      accountKey: "folio:folio-1",
      notes: "Device 3 malicious update",
    })).rejects.toThrow("Phòng không thuộc quyền hạn của bạn");
  });

  it("isolates split deposit notes by exact booking and group id and enforces room scopes across single, multiple, empty and hotel-wide", async () => {
    const { service, tx, access } = setup();
    const accountKey = "deposit:split:res-1:depgrp";

    // 1. Hotel-wide scope: succeeds and queries exact booking and split prefix
    const hotelWideResult = await service.updateNote("user-a", "role-a", "hotel-a", {
      accountKey,
      notes: "Ghi chú cọc mới",
      expectedPriorNote: "Cọc kết hợp",
    });
    expect(hotelWideResult).toEqual({ accountKey, notes: "Ghi chú cọc mới" });
    expect(tx.bookingPayment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        hotelId: "hotel-a",
        idempotencyKey: { startsWith: "split:depgrp:" },
        OR: [{ reservationId: "res-1" }, { groupId: "res-1" }],
      }),
    }));
    expect(tx.bookingPayment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        hotelId: "hotel-a",
        idempotencyKey: { startsWith: "split:depgrp:" },
      }),
      data: { notes: "Ghi chú cọc mới" },
    }));

    // 2. Single-room scope matching room-1: succeeds
    access.resolveRoomScope.mockResolvedValueOnce({
      hotel: { id: "hotel-a", tenantId: "tenant-a", name: "A21", timezone: "Asia/Ho_Chi_Minh" },
      allowedRoomId: "room-1",
      allowedRoomIds: ["room-1"],
    });
    await expect(service.updateNote("user-staff-1", "role-staff", "hotel-a", {
      accountKey,
      notes: "Ghi chú từ staff room-1",
      expectedPriorNote: "Ghi chú cọc mới",
    })).resolves.toEqual({ accountKey, notes: "Ghi chú từ staff room-1" });

    // 3. Multi-room scope including room-1: succeeds
    access.resolveRoomScope.mockResolvedValueOnce({
      hotel: { id: "hotel-a", tenantId: "tenant-a", name: "A21", timezone: "Asia/Ho_Chi_Minh" },
      allowedRoomId: null,
      allowedRoomIds: ["room-1", "room-2"],
    });
    await expect(service.updateNote("user-staff-12", "role-staff", "hotel-a", {
      accountKey,
      notes: "Ghi chú từ staff room-1-2",
      expectedPriorNote: "Ghi chú từ staff room-1",
    })).resolves.toEqual({ accountKey, notes: "Ghi chú từ staff room-1-2" });

    // 4. Out-of-scope room (only room-2 permitted): fails with NotFoundException
    access.resolveRoomScope.mockResolvedValueOnce({
      hotel: { id: "hotel-a", tenantId: "tenant-a", name: "A21", timezone: "Asia/Ho_Chi_Minh" },
      allowedRoomId: "room-2",
      allowedRoomIds: ["room-2"],
    });
    access.assertRoomAccess.mockImplementationOnce(() => {
      throw new NotFoundException("Phòng không thuộc phạm vi được phân công");
    });
    await expect(service.updateNote("user-staff-2", "role-staff", "hotel-a", {
      accountKey,
      notes: "Malicious note",
      expectedPriorNote: "Ghi chú từ staff room-1-2",
    })).rejects.toThrow("Phòng không thuộc phạm vi được phân công");

    // 5. Empty allowed room set: fails with NotFoundException
    access.resolveRoomScope.mockResolvedValueOnce({
      hotel: { id: "hotel-a", tenantId: "tenant-a", name: "A21", timezone: "Asia/Ho_Chi_Minh" },
      allowedRoomId: null,
      allowedRoomIds: [],
    });
    access.assertRoomAccess.mockImplementationOnce(() => {
      throw new NotFoundException("Phòng không thuộc phạm vi được phân công");
    });
    await expect(service.updateNote("user-staff-empty", "role-staff", "hotel-a", {
      accountKey,
      notes: "Malicious note empty",
    })).rejects.toThrow("Phòng không thuộc phạm vi được phân công");
  });

  it("clears legacy notes on deposit and manual entries so getBook returns null instead of resurrecting them", async () => {
    const { service, tx } = setup();
    const date = new Date("2026-11-13T01:00:00Z");

    // Standalone deposit with legacy note in bookingPayment
    tx.bookingPayment.findMany.mockResolvedValueOnce([{
      id: "dep-legacy", status: "COMPLETED", idempotencyKey: null, receivedAt: date, receivedAmount: D(500),
      paymentMethod: "BANK_TRANSFER", transactionReference: "TX-LEGACY-01", notes: "Cọc chuyển khoản cũ",
      reservationId: "res-legacy", groupId: null, reservation: { guestDisplayName: "Vũ Hải", reservationCode: "R-LEGACY", roomId: "room-1", room: { roomNumber: "101" } },
      allocations: [],
    }]);

    // Initial getBook returns legacy note
    const bookBefore = await service.getBook("user-a", "role-a", "hotel-a", { from: "2026-11-13", to: "2026-11-13" });
    const depBefore = bookBefore.entries.find((e) => e.id === "deposit:dep-legacy")!;
    expect(depBefore).toBeDefined();
    expect(depBefore.notes).toBe("Cọc chuyển khoản cũ");

    // User clears note
    const clearResult = await service.updateNote("user-a", "role-a", "hotel-a", {
      accountKey: "deposit:dep-legacy",
      notes: "",
      expectedPriorNote: "Cọc chuyển khoản cũ",
    });
    expect(clearResult).toEqual({ accountKey: "deposit:dep-legacy", notes: "" });
    expect(tx.bookingPayment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "dep-legacy" },
      data: { notes: null },
    }));

    // Subsequent getBook returns null rather than falling back to legacy note
    tx.bookingPayment.findMany.mockResolvedValueOnce([{
      id: "dep-legacy", status: "COMPLETED", idempotencyKey: null, receivedAt: date, receivedAmount: D(500),
      paymentMethod: "BANK_TRANSFER", transactionReference: "TX-LEGACY-01", notes: "Cọc chuyển khoản cũ",
      reservationId: "res-legacy", groupId: null, reservation: { guestDisplayName: "Vũ Hải", reservationCode: "R-LEGACY", roomId: "room-1", room: { roomNumber: "101" } },
      allocations: [],
    }]);
    const bookAfter = await service.getBook("user-a", "role-a", "hotel-a", { from: "2026-11-13", to: "2026-11-13" });
    const depAfter = bookAfter.entries.find((e) => e.id === "deposit:dep-legacy")!;
    expect(depAfter).toBeDefined();
    expect(depAfter.notes).toBeNull();
  });

  it("protects concurrent note overwrites with expectedPriorNote", async () => {
    const { service } = setup();

    // Device 1 writes initial note
    await service.updateNote("user-dev-1", "role-a", "hotel-a", {
      accountKey: "folio:folio-1",
      notes: "Ghi chú từ Device 1",
      expectedPriorNote: null,
    });

    // Device 2 with stale state (expectedPriorNote: null) tries to overwrite
    await expect(service.updateNote("user-dev-2", "role-a", "hotel-a", {
      accountKey: "folio:folio-1",
      notes: "Ghi chú từ Device 2",
      expectedPriorNote: null,
    })).rejects.toThrow("Ghi chú đã được cập nhật từ thiết bị khác. Vui lòng tải lại sổ doanh thu.");

    // Device 2 provides matched expectedPriorNote and succeeds
    await expect(service.updateNote("user-dev-2", "role-a", "hotel-a", {
      accountKey: "folio:folio-1",
      notes: "Ghi chú Device 2 đã cập nhật",
      expectedPriorNote: "Ghi chú từ Device 1",
    })).resolves.toEqual({ accountKey: "folio:folio-1", notes: "Ghi chú Device 2 đã cập nhật" });

    // Device 1 attempts to clear note passing now-stale expectedPriorNote
    await expect(service.updateNote("user-dev-1", "role-a", "hotel-a", {
      accountKey: "folio:folio-1",
      notes: "",
      expectedPriorNote: "Ghi chú từ Device 1",
    })).rejects.toThrow("Ghi chú đã được cập nhật từ thiết bị khác. Vui lòng tải lại sổ doanh thu.");
  });

  it("surfaces exact record identifiers for incomplete refund and void reconciliation errors", async () => {
    const { service, tx } = setup();
    const date = new Date("2026-11-13T01:00:00Z");

    // Incomplete payment refund
    tx.folio.findMany.mockResolvedValueOnce([{
      id: "folio-bad-refund", currency: "VND", roomId: "room-1", room: { roomNumber: "101" }, openedAt: date, folioNumber: "F-REFUND-01", voidedAt: null,
      stay: { guestDisplayName: "Nguyễn An", kbttGuestDeclarations: [] },
      items: [{ itemType: "ROOM_CHARGE", nameSnapshot: "Tiền phòng", metadataSnapshotJson: null, serviceItem: null, postedAt: date, totalSnapshot: D(500), discountAmountSnapshot: D(0), voidedAt: null }],
      payments: [{ id: "pay-1", metadataJson: null, confirmedAt: date, paidAmount: D(500), refundedAmount: D(200), method: "BANK_TRANSFER", paymentNumber: "PAY-100", transactions: [] }],
      bookingPaymentAllocations: [], hotelReceivables: [],
    }]);
    await expect(service.getBook("user-a", "role-a", "hotel-a", { from: "2026-11-13", to: "2026-11-13" })).rejects.toThrow(
      "Khoản hoàn tiền của thanh toán PAY-100 (hồ sơ F-REFUND-01) chưa có lịch sử giao dịch đầy đủ. Vui lòng đối soát khoản hoàn tiền trước khi xuất báo cáo."
    );

    // Voided receivable collection missing voidedAt date
    tx.folio.findMany.mockResolvedValueOnce([{
      id: "folio-bad-void", currency: "VND", roomId: "room-1", room: { roomNumber: "101" }, openedAt: date, folioNumber: "F-VOID-02", voidedAt: null,
      stay: { guestDisplayName: "Lê Bình", kbttGuestDeclarations: [] },
      items: [{ itemType: "ROOM_CHARGE", nameSnapshot: "Tiền phòng", metadataSnapshotJson: null, serviceItem: null, postedAt: date, totalSnapshot: D(300), discountAmountSnapshot: D(0), voidedAt: null }],
      payments: [],
      bookingPaymentAllocations: [],
      hotelReceivables: [{
        id: "rec-1",
        collections: [{ id: "col-1", collectedAt: date, collectedAmount: D(300), paymentMethod: "CASH", reference: "REC-REF-01", isVoided: true, voidedAt: null }],
      }],
    }]);
    await expect(service.getBook("user-a", "role-a", "hotel-a", { from: "2026-11-13", to: "2026-11-13" })).rejects.toThrow(
      "Khoản thu nợ đã hủy REC-REF-01 (hồ sơ F-VOID-02) thiếu ngày điều chỉnh. Vui lòng đối soát trước khi xuất báo cáo."
    );

    // Refunded deposit missing detail
    tx.folio.findMany.mockResolvedValueOnce([]);
    tx.bookingPayment.findMany.mockResolvedValueOnce([{
      id: "dep-bad", status: "REFUNDED", receivedAt: date, receivedAmount: D(500), paymentMethod: "BANK_TRANSFER", transactionReference: "TX-DEP-999", notes: null,
      reservation: null, allocations: [],
    }]);
    await expect(service.getBook("user-a", "role-a", "hotel-a", { from: "2026-11-13", to: "2026-11-13" })).rejects.toThrow(
      "Khoản đặt cọc TX-DEP-999 đã hoàn nhưng chưa có ngày hoàn chi tiết. Vui lòng đối soát khoản cọc trước khi xuất báo cáo."
    );
  });
});
