jest.mock("../../../prisma/prisma.service", () => ({ PrismaService: class MockPrismaService {} }));

import { FolioStatus, GuestStayStatus, HousekeepingTaskStatus, InvoiceStatus, PaymentMethod, PaymentProvider, PaymentStatus, Prisma, RoomStatus } from "@prisma/client";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";
import { BillingService } from "../application/billing.service";

function fixture() {
  let committed = false;
  const timestamp = new Date("2026-11-06T07:00:00Z");
  const room = { id: "room", roomNumber: "101", status: RoomStatus.OCCUPIED as RoomStatus, updatedAt: timestamp };
  const stay = { id: "stay", hotelId: "hotel", roomId: "room", status: GuestStayStatus.CHECKOUT_PENDING as GuestStayStatus };
  const folio = { id: "folio", status: FolioStatus.CHECKOUT_PENDING as FolioStatus, totalAmount: new Prisma.Decimal(100) };
  const invoice = { id: "invoice", hotelId: "hotel", folioId: "folio", stayId: "stay", status: InvoiceStatus.ISSUED as InvoiceStatus, totalAmount: new Prisma.Decimal(100), balanceAmount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(0), currency: "VND", stay };
  const payment = { id: "payment", hotelId: "hotel", invoiceId: "invoice", folioId: "folio", stayId: "stay", status: PaymentStatus.PENDING as PaymentStatus, amount: new Prisma.Decimal(100), paidAmount: new Prisma.Decimal(0), currency: "VND", provider: PaymentProvider.MOMO, invoice };
  type Task = { id: string; hotelId: string; roomId: string; stayId: string; status: string; priority: string; notes: string | null; assignedToUserId?: string; version: number; room: { roomNumber: string }; createdAt: Date; updatedAt: Date };
  const tasks: Task[] = [];
  const transactions: Array<{ id: string; providerEventId: string; status: string }> = [];
  const histories: unknown[] = [];
  const notifications: unknown[] = [];
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $queryRaw: jest.fn().mockResolvedValue([{ id: "stay" }]),
    payment: {
      findFirst: jest.fn().mockImplementation(() => payment),
      findUnique: jest.fn().mockImplementation(() => payment),
      update: jest.fn().mockImplementation(({ data }) => Object.assign(payment, data)),
      create: jest.fn().mockImplementation(({ data }) => Object.assign(payment, data)),
    },
    paymentTransaction: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => { const row = { id: "transaction", ...data }; transactions.push(row); return row; }),
    },
    invoice: {
      findFirst: jest.fn().mockImplementation(() => invoice),
      update: jest.fn().mockImplementation(({ data }) => Object.assign(invoice, data)),
    },
    folio: {
      findFirst: jest.fn().mockImplementation(() => folio),
      update: jest.fn().mockImplementation(({ data }) => Object.assign(folio, data)),
    },
    guestStay: {
      findFirst: jest.fn().mockImplementation(() => stay),
      updateMany: jest.fn().mockImplementation(({ data }) => { Object.assign(stay, data); return { count: 1 }; }),
    },
    hotel: { findUniqueOrThrow: jest.fn().mockResolvedValue({ tenantId: "tenant" }) },
    domainEvent: { create: jest.fn().mockResolvedValue({ id: "checkout-event" }) },
    guestSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    room: {
      findUnique: jest.fn().mockImplementation(() => room),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        if (room.status !== where.status) return { count: 0 };
        Object.assign(room, data);
        return { count: 1 };
      }),
    },
    housekeepingTask: {
      findFirst: jest.fn().mockImplementation(() => tasks.find(t => ["QUEUED", "CLAIMED", "IN_PROGRESS", "BLOCKED"].includes(t.status)) ?? null),
      create: jest.fn().mockImplementation(({ data }) => { const task = { id: "task", ...data, room, createdAt: timestamp, updatedAt: timestamp }; tasks.push(task); return task; }),
    },
    housekeepingTaskHistory: { create: jest.fn().mockImplementation(({ data }) => { histories.push(data); return data; }) },
    housekeepingNotification: { create: jest.fn().mockImplementation(({ data }) => { notifications.push(data); return data; }) },
    bookingPayment: { findMany: jest.fn().mockResolvedValue([]) },
    hotelReceivable: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "receivable" }) },
  };
  const prisma = {
    paymentTransaction: { findFirst: jest.fn().mockImplementation(({ where }) => transactions.find(t => t.providerEventId === where.providerEventId) ?? null) },
    room: { findFirst: jest.fn().mockImplementation(() => room) },
    guestStay: { findFirst: jest.fn().mockImplementation(() => stay) },
    $transaction: jest.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
      const before = { room: { ...room }, stay: { ...stay }, folio: { ...folio }, invoice: { ...invoice }, payment: { ...payment } };
      const lengths = [tasks.length, histories.length, notifications.length, transactions.length];
      try { const result = await callback(tx); committed = true; return result; }
      catch (error) {
        Object.assign(room, before.room); Object.assign(stay, before.stay); Object.assign(folio, before.folio); Object.assign(invoice, before.invoice); Object.assign(payment, before.payment);
        [tasks.length, histories.length, notifications.length, transactions.length] = lengths;
        throw error;
      }
    }),
  };
  const publisher = { publishConversationClosed: jest.fn() };
  const service = new BillingService({} as never, { assertHotelAccess: jest.fn().mockResolvedValue({ tenantId: "tenant" }) } as never, prisma as never, { generateEntityCode: jest.fn().mockResolvedValue("PAY-1") } as never, { log: jest.fn(), warn: jest.fn() } as never, publisher as never);
  jest.spyOn(service, "getInvoiceDetail").mockResolvedValue({ invoice: { id: "invoice" } } as never);
  const taskEvent = jest.spyOn(RequestRealtimeEmitter, "emitHousekeepingTaskCreated").mockImplementation(input => {
    expect(committed).toBe(true);
    return { ...input, eventId: "task-event", status: input.status ?? "QUEUED", assignedStaffId: null, assignedStaffName: null, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() };
  });
  const roomEvent = jest.spyOn(RequestRealtimeEmitter, "emitRoomStatusUpdated").mockImplementation(() => { expect(committed).toBe(true); });
  const webhook = (eventId = "event", amount = 100) => service.processPaymentWebhook(PaymentProvider.MOMO, { providerEventId: eventId, paymentId: "payment", amount, eventType: "payment.succeeded", signatureVerified: true });
  return { room, stay, folio, invoice, payment, tasks, histories, notifications, transactions, tx, prisma, publisher, service, taskEvent, roomEvent, webhook, timestamp };
}

describe("Billing checkout housekeeping persistence", () => {
  afterEach(() => jest.restoreAllMocks());

  it("commits one task, history and durable notification through the actual webhook transaction body", async () => {
    const f = fixture();
    await expect(f.webhook()).resolves.toMatchObject({ paid: true, idempotent: false });
    expect(f.room.status).toBe(RoomStatus.PROCESSING);
    expect(f.stay.status).toBe(GuestStayStatus.CHECKED_OUT);
    expect(f.tasks).toHaveLength(1);
    expect(f.tasks[0]).toMatchObject({ hotelId: "hotel", roomId: "room", stayId: "stay", status: "QUEUED", priority: "NORMAL", version: 1 });
    expect(f.histories).toEqual([{ taskId: "task", fromStatus: null, toStatus: "QUEUED", actorUserId: null, reason: "CHECKOUT", notes: null }]);
    expect(f.notifications).toEqual([expect.objectContaining({ taskId: "task", hotelId: "hotel", status: "UNREAD", message: "Phòng 101 vừa check-out, cần dọn dẹp" })]);
    expect(f.taskEvent).toHaveBeenCalledTimes(1);
    expect(f.taskEvent).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task", roomId: "room", priority: "NORMAL" }));
  });

  it.each(["same event", "second event"])("does not duplicate housekeeping or payments on a %s retry", async retry => {
    const f = fixture();
    await f.webhook();
    const writes = f.tx.payment.update.mock.calls.length;
    await expect(f.webhook(retry === "same event" ? "event" : "event-2")).resolves.toMatchObject({ idempotent: true });
    expect(f.tasks).toHaveLength(1); expect(f.histories).toHaveLength(1); expect(f.notifications).toHaveLength(1);
    expect(f.tx.payment.update).toHaveBeenCalledTimes(writes);
    expect(f.taskEvent).toHaveBeenCalledTimes(1);
  });

  it("keeps a mismatched callback unpaid without creating housekeeping work", async () => {
    const f = fixture();
    await expect(f.webhook("bad-amount", 101)).resolves.toMatchObject({ paid: false });
    expect(f.room.status).toBe(RoomStatus.OCCUPIED);
    expect(f.tasks).toHaveLength(0); expect(f.histories).toHaveLength(0); expect(f.notifications).toHaveLength(0);
    expect(f.taskEvent).not.toHaveBeenCalled();
  });

  it.each(["housekeepingTaskHistory", "housekeepingNotification"] as const)("rolls back payment, room and task when %s persistence fails", async model => {
    const f = fixture();
    f.tx[model].create.mockRejectedValueOnce(new Error("persistence unavailable"));
    await expect(f.webhook()).rejects.toThrow("persistence unavailable");
    expect(f.invoice.status).toBe(InvoiceStatus.ISSUED); expect(f.payment.status).toBe(PaymentStatus.PENDING);
    expect(f.room.status).toBe(RoomStatus.OCCUPIED); expect(f.stay.status).toBe(GuestStayStatus.CHECKOUT_PENDING);
    expect(f.tasks).toHaveLength(0); expect(f.histories).toHaveLength(0); expect(f.notifications).toHaveLength(0);
    expect(f.taskEvent).not.toHaveBeenCalled(); expect(f.roomEvent).not.toHaveBeenCalled();
  });

  it("preserves a committed checkout when task realtime delivery fails", async () => {
    const f = fixture();
    f.taskEvent.mockImplementation(() => { throw new Error("socket unavailable"); });
    await expect(f.webhook()).resolves.toMatchObject({ paid: true });
    expect(f.tasks).toHaveLength(1); expect(f.notifications).toHaveLength(1);
    expect(f.roomEvent).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing urgent assigned task without changing it or notifying twice", async () => {
    const f = fixture();
    f.tasks.push({ id: "existing", hotelId: "hotel", roomId: "room", stayId: "previous-stay", status: "CLAIMED", priority: "URGENT", assignedToUserId: "staff", notes: "Keep", version: 4, room: { roomNumber: "101" }, createdAt: f.timestamp, updatedAt: f.timestamp });
    await f.webhook();
    expect(f.tasks).toHaveLength(1);
    expect(f.tasks[0]).toMatchObject({ priority: "URGENT", assignedToUserId: "staff", notes: "Keep", version: 4 });
    expect(f.histories).toHaveLength(0); expect(f.notifications).toHaveLength(0); expect(f.taskEvent).not.toHaveBeenCalled();
  });

  it.each([0, 100])("creates housekeeping work for a manual checkout with balance %s", async balance => {
    const f = fixture(); f.invoice.balanceAmount = new Prisma.Decimal(balance);
    f.tx.payment.findFirst.mockResolvedValue(null);
    await f.service.confirmManualPayment("actor", "role", "hotel", "invoice", { method: PaymentMethod.CASH });
    expect(f.tasks).toHaveLength(1); expect(f.histories).toHaveLength(1); expect(f.notifications).toHaveLength(1);
    expect(f.histories[0]).toMatchObject({ actorUserId: "actor" });
    expect(f.taskEvent).toHaveBeenCalledTimes(1);
  });

  it("creates housekeeping work atomically with a receivable transfer", async () => {
    const f = fixture();
    await f.service.transferStayToReceivable("actor", "role", "hotel", "stay", {});
    expect(f.room.status).toBe(RoomStatus.PROCESSING);
    expect(f.tasks).toHaveLength(1); expect(f.histories).toHaveLength(1); expect(f.notifications).toHaveLength(1);
    expect(f.histories[0]).toMatchObject({ actorUserId: "actor" });
    expect(f.taskEvent).toHaveBeenCalledTimes(1);
  });

  it("does not reopen cleaning work when the room checkout CAS has already been applied", async () => {
    const f = fixture(); f.room.status = RoomStatus.AVAILABLE;
    await expect(f.webhook()).resolves.toMatchObject({ paid: true });
    expect(f.tasks).toHaveLength(0); expect(f.taskEvent).not.toHaveBeenCalled();
  });
});
