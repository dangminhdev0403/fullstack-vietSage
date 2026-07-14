import { GuestRequestStatus } from "@prisma/client";
import { HotelRequestsRepository } from "../infrastructure/repositories/hotel-requests.repository";

describe("HotelRequestsRepository staff request listing", () => {
  it("orders requests by status, highest priority, then oldest created time", async () => {
    const rows = [{ id: "request-1" }];
    const tx = {
      guestRequest: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRequestsRepository(prisma as never);

    await expect(repository.listRequests({ hotelId: "hotel-1" }, 0, 20)).resolves.toEqual([
      1,
      rows,
    ]);

    expect(tx.guestRequest.findMany).toHaveBeenCalledWith(
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
    const tx = {
      guestRequest: {
        count: jest.fn().mockResolvedValue(4),
        groupBy: jest.fn().mockResolvedValue(grouped),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const repository = new HotelRequestsRepository(prisma as never);
    const where = { hotelId: "hotel-1", roomId: "room-1" };

    await expect(repository.summarizeRequests(where)).resolves.toEqual({
      total: 4,
      statuses: grouped,
    });

    expect(tx.guestRequest.count).toHaveBeenCalledWith({ where });
    expect(tx.guestRequest.groupBy).toHaveBeenCalledWith({
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
          status: GuestRequestStatus.IN_PROGRESS,
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
        expectedStatus: GuestRequestStatus.CREATED,
        status: GuestRequestStatus.ACKNOWLEDGED,
      }),
    ).rejects.toThrow("Guest request status changed concurrently");

    expect(tx.guestRequest.update).not.toHaveBeenCalled();
  });
});
