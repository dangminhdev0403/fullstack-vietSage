import { Injectable } from "@nestjs/common";
import { GuestRequestActorType, GuestStayStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";

const messageInclude = {
  senderUser: { select: { id: true, fullName: true } },
} satisfies Prisma.GuestMessageInclude;

export type GuestMessageRow = Prisma.GuestMessageGetPayload<{
  include: typeof messageInclude;
}>;

const threadInclude = {
  room: { select: { roomNumber: true, floor: true, type: true } },
  stay: { select: { guestDisplayName: true, status: true, checkedOutAt: true } },
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: messageInclude,
  },
  _count: {
    select: {
      messages: { where: { senderType: GuestRequestActorType.GUEST, readAt: null } },
    },
  },
} satisfies Prisma.GuestMessageThreadInclude;

const threadSummaryInclude = {
  room: { select: { roomNumber: true, floor: true, type: true } },
  stay: {
    select: { guestDisplayName: true, status: true, checkedOutAt: true, plannedCheckOutAt: true },
  },
  _count: {
    select: {
      messages: { where: { senderType: GuestRequestActorType.GUEST, readAt: null } },
    },
  },
} satisfies Prisma.GuestMessageThreadInclude;

const activeStayWhere = {
  status: GuestStayStatus.ACTIVE,
  checkedOutAt: null,
} satisfies Prisma.GuestStayWhereInput;

function encodeThreadCursor(value: { id: string; lastMessageAt: Date }) {
  return Buffer.from(
    JSON.stringify({ id: value.id, lastMessageAt: value.lastMessageAt.toISOString() }),
  ).toString("base64url");
}

function decodeThreadCursor(cursor?: string) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      id?: unknown;
      lastMessageAt?: unknown;
    };
    const date = new Date(String(value.lastMessageAt));
    if (typeof value.id !== "string" || Number.isNaN(date.getTime())) return null;
    return { id: value.id, lastMessageAt: date };
  } catch {
    return null;
  }
}

@Injectable()
export class GuestMessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isActiveStay(stayId: string, hotelId: string) {
    return Boolean(
      await this.prisma.guestStay.findFirst({
        where: { id: stayId, hotelId, ...activeStayWhere },
        select: { id: true },
      }),
    );
  }

  async listGuestMessages(stayId: string, skip = 0, take = 20, before?: string) {
    const thread = await this.prisma.guestMessageThread.findFirst({
      where: { stayId, stay: { is: activeStayWhere } },
      include: threadSummaryInclude,
    });
    if (!thread)
      return {
        thread: null,
        total: 0,
        items: [] as GuestMessageRow[],
        nextCursor: null,
        hasMore: false,
      };

    const beforePivot = before
      ? await this.prisma.guestMessage.findFirst({
          where: { id: before, threadId: thread.id },
          select: { id: true, createdAt: true },
        })
      : null;
    const where: Prisma.GuestMessageWhereInput = {
      threadId: thread.id,
      ...(beforePivot
        ? {
            OR: [
              { createdAt: { lt: beforePivot.createdAt } },
              { createdAt: beforePivot.createdAt, id: { lt: beforePivot.id } },
            ],
          }
        : {}),
    };

    const total = await this.prisma.guestMessage.count({ where: { threadId: thread.id } });
    const fetched = await this.prisma.guestMessage.findMany({
      where,
      include: messageInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(before ? {} : { skip }),
      take: take + 1,
    });

    const hasMore = fetched.length > take;
    const rawItems = hasMore ? fetched.slice(0, take) : fetched;
    const nextCursor = hasMore ? (rawItems[rawItems.length - 1]?.id ?? null) : null;
    const items = rawItems.reverse();

    return { thread, total, items, nextCursor, hasMore };
  }

  async appendGuestMessage(input: {
    hotelId: string;
    roomId: string;
    stayId: string;
    sessionId?: string;
    senderType: GuestRequestActorType;
    senderUserId?: string;
    body: string;
    expiresAt: Date;
  }) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const activeStay = await tx.guestStay.findFirst({
        where: {
          id: input.stayId,
          hotelId: input.hotelId,
          roomId: input.roomId,
          ...activeStayWhere,
        },
        select: { id: true },
      });
      if (!activeStay) return null;

      const createdThread = await tx.guestMessageThread.upsert({
        where: { stayId: input.stayId },
        create: {
          hotelId: input.hotelId,
          roomId: input.roomId,
          stayId: input.stayId,
          expiresAt: input.expiresAt,
          status: "OPEN",
          lastMessageAt: now,
        },
        update: { status: "OPEN", clearedAt: null, lastMessageAt: now, expiresAt: input.expiresAt },
      });
      const message = await tx.guestMessage.create({
        data: {
          threadId: createdThread.id,
          hotelId: input.hotelId,
          roomId: input.roomId,
          stayId: input.stayId,
          senderType: input.senderType,
          senderUserId: input.senderUserId,
          sessionId: input.sessionId,
          body: input.body,
        },
        include: messageInclude,
      });
      const thread = await tx.guestMessageThread.findUniqueOrThrow({
        where: { id: createdThread.id },
        include: threadSummaryInclude,
      });
      return { thread, message };
    });
  }

  async listHotelThreads(hotelId: string, take: number, query?: string, cursor?: string) {
    const baseWhere: Prisma.GuestMessageThreadWhereInput = {
      hotelId,
      stay: { is: activeStayWhere },
      ...(query
        ? {
            OR: [
              { room: { is: { roomNumber: { contains: query, mode: "insensitive" } } } },
              { stay: { is: { guestDisplayName: { contains: query, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const pivot = decodeThreadCursor(cursor);
    const where: Prisma.GuestMessageThreadWhereInput = {
      AND: [
        baseWhere,
        ...(pivot
          ? [
              {
                OR: [
                  { lastMessageAt: { lt: pivot.lastMessageAt } },
                  { lastMessageAt: pivot.lastMessageAt, id: { lt: pivot.id } },
                ],
              } satisfies Prisma.GuestMessageThreadWhereInput,
            ]
          : []),
      ],
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.guestMessageThread.count({ where: baseWhere }),
      this.prisma.guestMessageThread.findMany({
        where,
        include: threadInclude,
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        take: take + 1,
      }),
    ]);
    const hasMore = items.length > take;
    const pageItems = hasMore ? items.slice(0, take) : items;
    return {
      total,
      items: pageItems,
      hasMore,
      nextCursor:
        hasMore && pageItems[pageItems.length - 1]
          ? encodeThreadCursor(pageItems[pageItems.length - 1])
          : null,
    };
  }

  async getHotelThread(hotelId: string, threadId: string, skip = 0, take = 20, before?: string) {
    const thread = await this.prisma.guestMessageThread.findFirst({
      where: { id: threadId, hotelId, stay: { is: activeStayWhere } },
      include: threadSummaryInclude,
    });
    if (!thread) return null;

    const beforePivot = before
      ? await this.prisma.guestMessage.findFirst({
          where: { id: before, threadId },
          select: { id: true, createdAt: true },
        })
      : null;
    const where: Prisma.GuestMessageWhereInput = {
      threadId,
      ...(beforePivot
        ? {
            OR: [
              { createdAt: { lt: beforePivot.createdAt } },
              { createdAt: beforePivot.createdAt, id: { lt: beforePivot.id } },
            ],
          }
        : {}),
    };

    const total = await this.prisma.guestMessage.count({ where: { threadId } });
    const fetched = await this.prisma.guestMessage.findMany({
      where,
      include: messageInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(before ? {} : { skip }),
      take: take + 1,
    });

    const hasMore = fetched.length > take;
    const rawItems = hasMore ? fetched.slice(0, take) : fetched;
    const nextCursor = hasMore ? (rawItems[rawItems.length - 1]?.id ?? null) : null;
    const items = rawItems.reverse();

    return { thread, total, items, nextCursor, hasMore };
  }

  async markReadForStaff(hotelId: string, threadId: string) {
    return this.prisma.guestMessage.updateMany({
      where: {
        threadId,
        senderType: GuestRequestActorType.GUEST,
        readAt: null,
        thread: { is: { hotelId, stay: { is: activeStayWhere } } },
      },
      data: { readAt: new Date() },
    });
  }

  async markReadForGuest(hotelId: string, stayId: string) {
    return this.prisma.guestMessage.updateMany({
      where: {
        stayId,
        hotelId,
        senderType: GuestRequestActorType.STAFF,
        readAt: null,
        thread: { is: { stay: { is: activeStayWhere } } },
      },
      data: { readAt: new Date() },
    });
  }
}
