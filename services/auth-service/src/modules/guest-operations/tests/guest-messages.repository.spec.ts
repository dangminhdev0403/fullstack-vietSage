import { GuestRequestActorType, GuestStayStatus } from "@prisma/client";
import { GuestMessagesRepository } from "../infrastructure/repositories/guest-messages.repository";

function createThread(index: number) {
  const lastMessageAt = new Date(Date.UTC(2026, 6, 22, 12, 0, 0) - index * 1_000);
  return {
    id: `thread-${String(index).padStart(3, "0")}`,
    hotelId: "hotel-1",
    roomId: `room-${index}`,
    stayId: `stay-${index}`,
    status: "OPEN",
    lastMessageAt,
    expiresAt: new Date("2026-08-05T12:00:00.000Z"),
    clearedAt: null,
    createdAt: lastMessageAt,
    updatedAt: lastMessageAt,
    room: { roomNumber: String(101 + index), floor: "1", type: "Deluxe" },
    stay: {
      guestDisplayName: `Guest ${index}`,
      status: GuestStayStatus.ACTIVE,
      checkedOutAt: null,
    },
    messages: [],
    _count: { messages: 0 },
  };
}

describe("GuestMessagesRepository active-stay inbox", () => {
  it("walks 100 newest-first threads by a stable cursor without loss or duplication", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => createThread(index));
    const findMany = jest.fn(
      async (args: {
        where: { AND?: Array<{ OR?: Array<Record<string, { lt?: Date } | Date>> }> };
        take: number;
      }) => {
        const cursorFilter = args.where.AND?.[1]?.OR;
        const filtered = !cursorFilter
          ? rows
          : rows.filter((row) => {
              const olderThan = cursorFilter[0]?.lastMessageAt as { lt?: Date } | undefined;
              const sameTime = cursorFilter[1]?.lastMessageAt as Date | undefined;
              const lowerId = cursorFilter[1]?.id as { lt?: string } | undefined;
              return Boolean(
                (olderThan?.lt && row.lastMessageAt < olderThan.lt) ||
                (sameTime &&
                  row.lastMessageAt.getTime() === sameTime.getTime() &&
                  lowerId?.lt &&
                  row.id < lowerId.lt),
              );
            });
        return filtered.slice(0, args.take);
      },
    );
    const prisma = {
      guestMessageThread: { count: jest.fn().mockResolvedValue(100), findMany },
      $transaction: jest.fn((queries: Array<Promise<unknown>>) => Promise.all(queries)),
    };
    const repository = new GuestMessagesRepository(prisma as never);

    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await repository.listHotelThreads("hotel-1", 30, undefined, cursor);
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(ids).toHaveLength(100);
    expect(new Set(ids)).toHaveProperty("size", 100);
    expect(ids).toEqual(rows.map((row) => row.id));

    const serializedWhere = JSON.stringify(findMany.mock.calls[0]?.[0]?.where);
    expect(serializedWhere).toContain(`"status":"${GuestStayStatus.ACTIVE}"`);
    expect(serializedWhere).toContain('"checkedOutAt":null');
    expect(serializedWhere).not.toContain("OCCUPIED");
  });

  it("does not create a message when the stay is no longer active", async () => {
    const transactionClient = {
      guestStay: { findFirst: jest.fn().mockResolvedValue(null) },
      guestMessageThread: { upsert: jest.fn() },
      guestMessage: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
      ),
    };
    const repository = new GuestMessagesRepository(prisma as never);

    const result = await repository.appendGuestMessage({
      hotelId: "hotel-1",
      roomId: "room-1",
      stayId: "stay-old",
      senderType: GuestRequestActorType.GUEST,
      body: "Old stay must not write",
      expiresAt: new Date("2026-08-05T12:00:00.000Z"),
    });

    expect(result).toBeNull();
    expect(transactionClient.guestStay.findFirst).toHaveBeenCalledWith({
      where: {
        id: "stay-old",
        hotelId: "hotel-1",
        roomId: "room-1",
        status: GuestStayStatus.ACTIVE,
        checkedOutAt: null,
      },
      select: { id: true },
    });
    expect(transactionClient.guestMessageThread.upsert).not.toHaveBeenCalled();
    expect(transactionClient.guestMessage.create).not.toHaveBeenCalled();
  });
});
