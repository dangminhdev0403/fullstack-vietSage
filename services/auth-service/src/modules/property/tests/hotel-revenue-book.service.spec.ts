import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { HotelRevenueBookService } from "../application/hotel-revenue-book.service";
import type { HotelAccessService } from "../application/hotel-access.service";
import type { PrismaService } from "../../../prisma/prisma.service";
import { collectRevenueEntrySchema, createRevenueEntrySchema, updateRevenueEntrySchema } from "../domain/schemas/hotel-revenue-book.schema";

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
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: entry.id }]),
    folio: { findMany: jest.fn().mockResolvedValue([]) },
    bookingPayment: { findMany: jest.fn().mockResolvedValue([]) },
    room: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue({ roomNumber: "101" }) },
    hotelRevenueEntry: {
      findFirst: jest.fn().mockImplementation(async () => entry),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...entry, ...data, version: 1 })),
      update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(entry, { ...data, version: entry.version + 1 }); return entry; }),
    },
    hotelRevenueCollection: {
      findUnique: jest.fn().mockImplementation(async ({ where }: { where: { hotelId_idempotencyKey: { idempotencyKey: string } } }) => entry.collections.find((item) => item.idempotencyKey === where.hotelId_idempotencyKey.idempotencyKey) ?? null),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { const payment = { ...data, id: "collection-1", amount: D(data.amount as number), reference: null } as typeof entry.collections[number]; entry.collections.push(payment); return payment; }),
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

  it("rejects overcollection, reducing charges below receipts, and voiding a paid entry", async () => {
    const { service, entry, tx } = setup();
    entry.collections.push({ id: "paid", amount: D(80), receivedAt: new Date("2026-11-13T01:00:00Z"), method: "CASH", reference: null, idempotencyKey: "previous", requestHash: "previous" });
    await expect(service.collect("user-a", "role-a", "hotel-a", entry.id, collectionInput())).rejects.toThrow("vượt quá");
    const update = updateRevenueEntrySchema.parse({ date: "2026-11-13", description: entry.description, category: "LAUNDRY", amount: 50, version: 1 });
    await expect(service.update("user-a", "role-a", "hotel-a", entry.id, update)).rejects.toThrow("nhỏ hơn");
    await expect(service.void("user-a", "role-a", "hotel-a", entry.id, { version: 1, reason: "Nhập nhầm" })).rejects.toThrow("đã có tiền thu");
    expect(tx.hotelRevenueEntry.update).not.toHaveBeenCalled();
    expect(tx.hotelRevenueCollection.create).not.toHaveBeenCalled();
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
});
