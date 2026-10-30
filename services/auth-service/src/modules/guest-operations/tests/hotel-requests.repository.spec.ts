import { GuestRequestStatus, GuestStayStatus, Prisma } from "@prisma/client";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { HotelRequestsRepository } from "../infrastructure/repositories/hotel-requests.repository";

describe("HotelRequestsRepository staff request listing", () => {
  it("orders requests by status, highest priority, then oldest created time", async () => {
    const rows = [{ id: "request-1" }];
    const prisma = {
      guestRequest: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    const repository = new HotelRequestsRepository(prisma as never);

    await expect(repository.listRequests({ hotelId: "hotel-1" }, 0, 20)).resolves.toEqual([
      1,
      rows,
    ]);

    expect(prisma.guestRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hotelId: "hotel-1" },
        orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
        skip: 0,
        take: 20,
      }),
    );
  });

  it("summarizes requests by status without pagination", async () => {
    const grouped = [{ status: "CREATED", _count: { _all: 4 } }];
    const prisma = {
      guestRequest: {
        count: jest.fn().mockResolvedValue(4),
        groupBy: jest.fn().mockResolvedValue(grouped),
      },
    };
    const repository = new HotelRequestsRepository(prisma as never);
    const where = { hotelId: "hotel-1", roomId: "room-1" };

    await expect(repository.summarizeRequests(where)).resolves.toEqual({
      total: 4,
      statuses: grouped,
    });

    expect(prisma.guestRequest.count).toHaveBeenCalledWith({ where });
    expect(prisma.guestRequest.groupBy).toHaveBeenCalledWith({
      by: ["status"],
      where,
      _count: { _all: true },
    });
  });
});

describe("HotelRequestsRepository status transition concurrency", () => {
  it("rejects a stale transition when the status changed after service validation", async () => {
    const tx = {
      guestRequest: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: "request-1",
          status: GuestRequestStatus.ACKNOWLEDGED,
        }),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRequestsRepository(prisma as never);

    await expect(
      repository.updateRequestStatus({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        requestId: "request-1",
        actorUserId: "staff-1",
        expectedStatus: GuestRequestStatus.PENDING,
        status: GuestRequestStatus.ACKNOWLEDGED,
      }),
    ).rejects.toThrow("Guest request status changed concurrently");

    expect(tx.guestRequest.update).not.toHaveBeenCalled();
  });
});

describe("HotelRequestsRepository normal completion posting (H2)", () => {
  it("posts folio item using unit price from billingPriceSnapshot even if catalog price changed", async () => {
    const folioItemCreated: any[] = [];
    const tx = {
      folioItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            subtotalSnapshot: 0,
            taxAmountSnapshot: 0,
            discountAmountSnapshot: 0,
            totalSnapshot: 0,
          },
        }),
        create: jest.fn().mockImplementation((args) => {
          folioItemCreated.push(args.data);
          return Promise.resolve({ id: "fi-1", folioId: "folio-1" });
        }),
      },
      guestRequest: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: "req-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          roomId: "room-1",
          serviceItemId: "s-1",
          quantity: 2,
          status: GuestRequestStatus.PENDING,
          metadata: { billingPriceSnapshot: { unitPrice: 30000, currency: "VND" } },
          stay: { id: "stay-1", status: GuestStayStatus.ACTIVE },
          serviceItem: {
            id: "s-1",
            name: "Nước cam",
            priceOverride: 99000, // catalog changed to 99000
            category: { id: "c-1", name: "Đồ uống", defaultPrice: 99000, currency: "VND" },
          },
        }),
        update: jest.fn().mockResolvedValue({ id: "req-1", status: GuestRequestStatus.COMPLETED }),
      },
      folio: {
        findFirst: jest.fn().mockResolvedValue({ id: "folio-1", currency: "VND" }),
        update: jest.fn().mockResolvedValue({ id: "folio-1" }),
      },
      guestRequestEvent: { create: jest.fn().mockResolvedValue({ id: "event-1" }) },
      domainEvent: { create: jest.fn().mockResolvedValue({ id: "domain-event-1" }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRequestsRepository(prisma as never);

    await repository.updateRequestStatus({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      actorUserId: "staff-1",
      expectedStatus: GuestRequestStatus.PENDING,
      status: GuestRequestStatus.COMPLETED,
    });

    expect(tx.folioItem.create).toHaveBeenCalledTimes(1);
    const created = folioItemCreated[0];
    expect(created.unitPriceSnapshot.toString()).toBe("30000");
    expect(created.subtotalSnapshot.toString()).toBe("60000");
    expect(created.currency).toBe("VND");
  });

  it("preserves explicit zero in normal completion folio item posting", async () => {
    const folioItemCreated: any[] = [];
    const tx = {
      folioItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            subtotalSnapshot: 0,
            taxAmountSnapshot: 0,
            discountAmountSnapshot: 0,
            totalSnapshot: 0,
          },
        }),
        create: jest.fn().mockImplementation((args) => {
          folioItemCreated.push(args.data);
          return Promise.resolve({ id: "fi-1", folioId: "folio-1" });
        }),
      },
      guestRequest: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: "req-free-1",
          hotelId: "hotel-1",
          stayId: "stay-1",
          roomId: "room-1",
          serviceItemId: "s-free",
          quantity: 3,
          status: GuestRequestStatus.PENDING,
          metadata: { billingPriceSnapshot: { unitPrice: 0, currency: "VND" } },
          stay: { id: "stay-1", status: GuestStayStatus.ACTIVE },
          serviceItem: {
            id: "s-free",
            name: "Mượn ô dù",
            priceOverride: 0,
            category: { id: "c-1", name: "Dịch vụ phòng", defaultPrice: 0, currency: "VND" },
          },
        }),
        update: jest
          .fn()
          .mockResolvedValue({ id: "req-free-1", status: GuestRequestStatus.COMPLETED }),
      },
      folio: {
        findFirst: jest.fn().mockResolvedValue({ id: "folio-1", currency: "VND" }),
        update: jest.fn().mockResolvedValue({ id: "folio-1" }),
      },
      guestRequestEvent: { create: jest.fn().mockResolvedValue({ id: "event-1" }) },
      domainEvent: { create: jest.fn().mockResolvedValue({ id: "domain-event-1" }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRequestsRepository(prisma as never);

    await repository.updateRequestStatus({
      hotelId: "hotel-1",
      tenantId: "tenant-1",
      requestId: "req-free-1",
      actorUserId: "staff-1",
      expectedStatus: GuestRequestStatus.PENDING,
      status: GuestRequestStatus.COMPLETED,
    });

    const created = folioItemCreated[0];
    expect(created.unitPriceSnapshot.toString()).toBe("0");
    expect(created.subtotalSnapshot.toString()).toBe("0");
  });

  it("rejects normal completion posting when billingPriceSnapshot is missing (fail-closed)", async () => {
    const tx = {
      folioItem: { findUnique: jest.fn().mockResolvedValue(null) },
      guestRequest: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: "req-no-snap",
          hotelId: "hotel-1",
          stayId: "stay-1",
          status: GuestRequestStatus.PENDING,
          metadata: null,
          stay: { id: "stay-1", status: GuestStayStatus.ACTIVE },
          serviceItem: {
            id: "s-1",
            name: "Dịch vụ",
            category: { currency: "VND", defaultPrice: 10000 },
          },
        }),
      },
      folio: {
        findFirst: jest.fn().mockResolvedValue({ id: "folio-1", currency: "VND" }),
        update: jest.fn().mockResolvedValue({ id: "folio-1" }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRequestsRepository(prisma as never);

    await expect(
      repository.updateRequestStatus({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        requestId: "req-no-snap",
        actorUserId: "staff-1",
        expectedStatus: GuestRequestStatus.PENDING,
        status: GuestRequestStatus.COMPLETED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects normal completion posting when currency does not match folio currency", async () => {
    const tx = {
      folioItem: { findUnique: jest.fn().mockResolvedValue(null) },
      guestRequest: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: "req-mismatch",
          hotelId: "hotel-1",
          stayId: "stay-1",
          status: GuestRequestStatus.PENDING,
          metadata: { billingPriceSnapshot: { unitPrice: 20, currency: "USD" } },
          stay: { id: "stay-1", status: GuestStayStatus.ACTIVE },
          serviceItem: {
            id: "s-1",
            name: "Spa",
            category: { currency: "USD", defaultPrice: 20 },
          },
        }),
      },
      folio: {
        findFirst: jest.fn().mockResolvedValue({ id: "folio-1", currency: "VND" }),
        update: jest.fn().mockResolvedValue({ id: "folio-1" }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRequestsRepository(prisma as never);

    await expect(
      repository.updateRequestStatus({
        hotelId: "hotel-1",
        tenantId: "tenant-1",
        requestId: "req-mismatch",
        actorUserId: "staff-1",
        expectedStatus: GuestRequestStatus.PENDING,
        status: GuestRequestStatus.COMPLETED,
      }),
    ).rejects.toThrow("Đơn vị tiền tệ của dịch vụ không khớp với folio");
  });
});
