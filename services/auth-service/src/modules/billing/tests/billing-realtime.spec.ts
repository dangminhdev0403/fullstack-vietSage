jest.mock("../../../prisma/prisma.service", () => ({
  PrismaService: class MockPrismaService {},
}));

import { PaymentProvider, RoomStatus } from "@prisma/client";
import { BillingService } from "../application/billing.service";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";

function fixture() {
  let committed = false;
  const result = {
    received: true, idempotent: false, matched: true, paid: true,
    transaction: { id: "payment-transaction" },
    conversation: { hotelId: "hotel", stayId: "stay", roomId: "room" },
  };
  const prisma = {
    paymentTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
    guestStay: { findFirst: jest.fn().mockResolvedValue({ roomId: "room" }) },
    room: { findFirst: jest.fn().mockResolvedValue({
      roomNumber: "101", status: RoomStatus.PROCESSING,
      updatedAt: new Date("2026-11-06T05:00:00Z"),
    }) },
    $transaction: jest.fn().mockImplementation(async () => {
      committed = true;
      return result;
    }),
  };
  const publisher = { publishConversationClosed: jest.fn() };
  const service = new BillingService(
    {} as never,
    { assertHotelAccess: jest.fn().mockResolvedValue(undefined) } as never,
    prisma as never, {} as never,
    { log: jest.fn(), warn: jest.fn() } as never, publisher as never,
  );
  const emit = jest.spyOn(RequestRealtimeEmitter, "emitRoomStatusUpdated")
    .mockImplementation(() => { expect(committed).toBe(true); });
  const webhook = () => service.processPaymentWebhook(PaymentProvider.MOMO, {
    providerEventId: "local-test-event", eventType: "payment.succeeded",
    signatureVerified: true,
  });
  return { prisma, publisher, service, emit, webhook, result };
}

describe("Billing post-commit room realtime", () => {
  afterEach(() => jest.restoreAllMocks());

  it("publishes the persisted dirty room after a successful webhook transaction", async () => {
    const f = fixture();
    const response = await f.webhook();
    expect(response).toEqual({
      received: true, idempotent: false, matched: true, paid: true,
      transaction: f.result.transaction,
    });
    expect(f.emit).toHaveBeenCalledWith({
      hotelId: "hotel", roomId: "room", roomNumber: "101",
      status: RoomStatus.PROCESSING, previousStatus: RoomStatus.OCCUPIED,
      updatedAt: new Date("2026-11-06T05:00:00Z"),
    });
    expect(f.publisher.publishConversationClosed).toHaveBeenCalledWith(f.result.conversation);
  });

  it("does not announce a dirty room when it has already been cleaned", async () => {
    const f = fixture();
    f.prisma.room.findFirst.mockResolvedValue({
      roomNumber: "101", status: RoomStatus.AVAILABLE,
      updatedAt: new Date("2026-11-06T05:01:00Z"),
    });
    await expect(f.webhook()).resolves.toMatchObject({ paid: true });
    expect(f.emit).not.toHaveBeenCalled();
  });

  it("keeps a committed webhook successful when the realtime room read fails", async () => {
    const f = fixture();
    f.prisma.room.findFirst.mockRejectedValue(new Error("room read unavailable"));
    await expect(f.webhook()).resolves.toMatchObject({ paid: true });
    expect(f.emit).not.toHaveBeenCalled();
    expect(f.publisher.publishConversationClosed).toHaveBeenCalledWith(f.result.conversation);
  });

  it("does not mask a failed webhook transaction or publish its room status", async () => {
    const f = fixture();
    f.prisma.$transaction.mockRejectedValue(new Error("transaction failed"));
    await expect(f.webhook()).rejects.toThrow("transaction failed");
    expect(f.prisma.room.findFirst).not.toHaveBeenCalled();
    expect(f.emit).not.toHaveBeenCalled();
    expect(f.publisher.publishConversationClosed).not.toHaveBeenCalled();
  });

  it("keeps a committed receivable transfer successful when the stay lookup fails", async () => {
    const f = fixture();
    f.prisma.guestStay.findFirst.mockRejectedValue(new Error("stay read unavailable"));
    await expect(f.service.transferStayToReceivable("actor", "role", "hotel", "stay", {}))
      .resolves.toBe(f.result);
    expect(f.emit).not.toHaveBeenCalled();
    expect(f.publisher.publishConversationClosed).toHaveBeenCalledWith(
      expect.objectContaining({ hotelId: "hotel", stayId: "stay" }),
    );
  });
});
