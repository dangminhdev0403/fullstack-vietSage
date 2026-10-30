jest.mock("../../../prisma/prisma.service", () => ({
  PrismaService: class MockPrismaService {},
}));

import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { BillingService } from "../application/billing.service";

const money = (amount: number) => new Prisma.Decimal(amount);

function fixture() {
  const state = { receivable: null as unknown, folio: "OPEN", stay: "ACTIVE" };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: "stay" }]),
    guestStay: {
      findFirst: jest.fn().mockResolvedValue({
        id: "stay",
        hotelId: "hotel",
        reservationId: "reservation",
        status: "ACTIVE",
      }),
      update: jest.fn().mockImplementation(() => {
        state.stay = "CHECKED_OUT";
        return {};
      }),
    },
    folio: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: "folio", status: "OPEN", totalAmount: money(3500000) }),
      update: jest.fn().mockImplementation(() => {
        state.folio = "CLOSED";
        return {};
      }),
    },
    invoice: {
      findFirst: jest.fn().mockResolvedValue({
        id: "invoice",
        totalAmount: money(3500000),
        paidAmount: money(1000000),
        balanceAmount: money(2500000),
      }),
      update: jest.fn(),
    },
    bookingPayment: { findMany: jest.fn().mockResolvedValue([]) },
    payment: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    user: { findFirst: jest.fn().mockResolvedValue({ id: "staff" }) },
    hotelReceivable: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: unknown }) => {
        state.receivable = data;
        return { id: "debt", ...(data as object) };
      }),
    },
    guestSession: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest
      .fn()
      .mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
        const before = { ...state };
        try {
          return await callback(tx);
        } catch (error) {
          Object.assign(state, before);
          throw error;
        }
      }),
  };
  const access = { assertHotelAccess: jest.fn().mockResolvedValue({ tenantId: "tenant" }) };
  const publisher = { publishConversationClosed: jest.fn() };
  const service = new BillingService(
    {} as never,
    access as never,
    prisma as never,
    {} as never,
    {} as never,
    publisher as never,
  );
  const transfer = (input: Parameters<BillingService["transferStayToReceivable"]>[4] = {}) =>
    service.transferStayToReceivable("actor", "role", "hotel", "stay", input);
  return { tx, prisma, access, publisher, transfer, state };
}

describe("F1 authoritative receivable balance", () => {
  it.each([1, 2499999, 2500001, 3500000])(
    "rejects mismatched amount %s before any writes",
    async (amount) => {
      const f = fixture();
      await expect(f.transfer({ amount })).rejects.toThrow(ConflictException);
      expect(f.tx.hotelReceivable.create).not.toHaveBeenCalled();
      expect(f.state).toEqual({ receivable: null, folio: "OPEN", stay: "ACTIVE" });
      expect(f.publisher.publishConversationClosed).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 2500000])(
    "transfers the exact remaining invoice balance with amount %s",
    async (amount) => {
      const f = fixture();
      const result = await f.transfer({ amount });
      expect(result.outstandingAmount.toString()).toBe("2500000");
      expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(f.tx.$queryRaw).toHaveBeenCalledTimes(3);
      expect(f.tx.payment.create).not.toHaveBeenCalled();
      expect(f.tx.invoice.update).not.toHaveBeenCalled();
    },
  );

  it("subtracts completed unallocated reservation deposits", async () => {
    const f = fixture();
    f.tx.bookingPayment.findMany.mockResolvedValue([
      { reservationId: "reservation", receivedAmount: money(500000), allocations: [] },
    ]);
    expect((await f.transfer()).outstandingAmount.toString()).toBe("2000000");
    expect(f.tx.bookingPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hotelId: "hotel", status: "COMPLETED" }),
      }),
    );
  });

  it("counts folio allocations once and excludes deposits allocated to a different folio", async () => {
    const f = fixture();
    f.tx.bookingPayment.findMany.mockResolvedValue([
      {
        reservationId: "reservation",
        receivedAmount: money(800000),
        allocations: [
          { hotelId: "hotel", folioId: "folio", allocatedAmount: money(300000), invoiceId: null },
          { hotelId: "hotel", folioId: "other", allocatedAmount: money(500000), invoiceId: null },
        ],
      },
    ]);
    expect((await f.transfer()).outstandingAmount.toString()).toBe("2200000");
  });

  it("does not subtract an invoice-applied deposit twice", async () => {
    const f = fixture();
    f.tx.bookingPayment.findMany.mockResolvedValue([
      {
        reservationId: "reservation",
        receivedAmount: money(1000000),
        allocations: [
          {
            hotelId: "hotel",
            folioId: "folio",
            invoiceId: "invoice",
            allocatedAmount: money(1000000),
          },
        ],
      },
    ]);
    expect((await f.transfer()).outstandingAmount.toString()).toBe("2500000");
  });

  it("uses recorded deposits and net paid amounts for a folio without an invoice", async () => {
    const f = fixture();
    f.tx.invoice.findFirst.mockResolvedValue(null);
    f.tx.bookingPayment.findMany.mockResolvedValue([
      { reservationId: "reservation", receivedAmount: money(500000), allocations: [] },
    ]);
    f.tx.payment.findMany.mockResolvedValue([
      { paidAmount: money(700000), refundedAmount: money(200000) },
    ]);
    expect((await f.transfer({ amount: 2500000 })).outstandingAmount.toString()).toBe("2500000");
    expect(f.tx.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hotelId: "hotel", folioId: "folio" }),
      }),
    );
  });

  it.each([0, -1])(
    "rejects invoice balance %s even when an explicit positive amount is supplied",
    async (balance) => {
      const f = fixture();
      f.tx.invoice.findFirst.mockResolvedValue({
        id: "invoice",
        totalAmount: money(3500000),
        paidAmount: money(3500000),
        balanceAmount: money(balance),
      });
      await expect(f.transfer({ amount: 1 })).rejects.toThrow(BadRequestException);
      expect(f.tx.hotelReceivable.create).not.toHaveBeenCalled();
    },
  );

  it("rejects debt fully covered by deposits", async () => {
    const f = fixture();
    f.tx.bookingPayment.findMany.mockResolvedValue([
      { reservationId: "reservation", receivedAmount: money(2500000), allocations: [] },
    ]);
    await expect(f.transfer()).rejects.toThrow(BadRequestException);
    expect(f.tx.folio.update).not.toHaveBeenCalled();
  });

  it("rejects stale invoice totals instead of transferring part of the folio", async () => {
    const f = fixture();
    f.tx.folio.findFirst.mockResolvedValue({
      id: "folio",
      status: "OPEN",
      totalAmount: money(4000000),
    });
    await expect(f.transfer()).rejects.toThrow(ConflictException);
    expect(f.tx.hotelReceivable.create).not.toHaveBeenCalled();
  });

  it("rolls back receivable and folio when stay closure fails, with no post-commit event", async () => {
    const f = fixture();
    f.tx.guestStay.update.mockRejectedValue(new Error("closure failed"));
    await expect(f.transfer()).rejects.toThrow("closure failed");
    expect(f.tx.hotelReceivable.create).toHaveBeenCalledTimes(1);
    expect(f.tx.folio.update).toHaveBeenCalledTimes(1);
    expect(f.state).toEqual({ receivable: null, folio: "OPEN", stay: "ACTIVE" });
    expect(f.publisher.publishConversationClosed).not.toHaveBeenCalled();
  });

  it("denies foreign tenant access before starting the transaction", async () => {
    const f = fixture();
    f.access.assertHotelAccess.mockRejectedValue(new ForbiddenException());
    await expect(f.transfer()).rejects.toThrow(ForbiddenException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(["unknown-id", "foreign-hotel-staff", "foreign-tenant-staff", "Accountant Name"])(
    "rejects inaccessible assignee %s",
    async (assigneeUserId) => {
      const f = fixture();
      f.tx.user.findFirst.mockResolvedValue(null);
      await expect(f.transfer({ assigneeUserId })).rejects.toThrow(BadRequestException);
      expect(f.tx.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: assigneeUserId,
          status: "ACTIVE",
          hotelAssignments: { some: { hotelId: "hotel", status: "ACTIVE" } },
          tenantUsers: { some: { status: "ACTIVE", tenant: { hotel: { id: "hotel" } } } },
        },
        select: { id: true },
      });
      expect(f.tx.hotelReceivable.create).not.toHaveBeenCalled();
    },
  );

  it("stores a validated active hotel and tenant staff ID", async () => {
    const f = fixture();
    await f.transfer({ assigneeUserId: "staff" });
    expect(f.tx.hotelReceivable.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assigneeUserId: "staff" }) }),
    );
  });
});
