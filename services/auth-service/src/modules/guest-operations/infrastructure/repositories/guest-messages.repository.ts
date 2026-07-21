import { Injectable } from "@nestjs/common";
import { GuestRequestActorType, Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";

const messageInclude = {
  senderUser: { select: { id: true, fullName: true } },
} satisfies Prisma.GuestMessageInclude;

export type GuestMessageRow = Prisma.GuestMessageGetPayload<{
  include: typeof messageInclude;
}>;

const threadInclude = {
  room: { select: { roomNumber: true } },
  stay: { select: { guestDisplayName: true, status: true, checkedOutAt: true } },
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: messageInclude,
  },
} satisfies Prisma.GuestMessageThreadInclude;

const threadSummaryInclude = {
  room: { select: { roomNumber: true } },
  stay: {
    select: { guestDisplayName: true, status: true, checkedOutAt: true, plannedCheckOutAt: true },
  },
} satisfies Prisma.GuestMessageThreadInclude;

@Injectable()
export class GuestMessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listGuestMessages(stayId: string, skip = 0, take = 20, before?: string) {
    const thread = await this.prisma.guestMessageThread.findUnique({
      where: { stayId },
      include: threadSummaryInclude,
    });
    if (!thread) return { thread: null, total: 0, items: [] as GuestMessageRow[], nextCursor: null, hasMore: false };

    let beforeCreatedAt: Date | undefined;
    if (before) {
      const pivot = await this.prisma.guestMessage.findUnique({
        where: { id: before },
        select: { createdAt: true },
      });
      if (pivot) {
        beforeCreatedAt = pivot.createdAt;
      }
    }

    const where: Prisma.GuestMessageWhereInput = {
      threadId: thread.id,
      ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}),
    };

    const total = await this.prisma.guestMessage.count({ where: { threadId: thread.id } });
    const fetched = await this.prisma.guestMessage.findMany({
      where,
      include: messageInclude,
      orderBy: { createdAt: "desc" },
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
      const thread = await tx.guestMessageThread.upsert({
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
        include: threadSummaryInclude,
      });
      const message = await tx.guestMessage.create({
        data: {
          threadId: thread.id,
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
      return { thread, message };
    });
  }

  async listHotelThreads(hotelId: string, skip: number, take: number, query?: string) {
    const where: Prisma.GuestMessageThreadWhereInput = {
      hotelId,
      ...(query
        ? {
            OR: [
              { room: { is: { roomNumber: { contains: query, mode: "insensitive" } } } },
              { stay: { is: { guestDisplayName: { contains: query, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.guestMessageThread.count({ where }),
      this.prisma.guestMessageThread.findMany({
        where,
        include: threadInclude,
        orderBy: { lastMessageAt: "desc" },
        skip,
        take,
      }),
    ]);
    return { total, items };
  }

  async getHotelThread(hotelId: string, threadId: string, skip = 0, take = 20, before?: string) {
    const thread = await this.prisma.guestMessageThread.findFirst({
      where: { id: threadId, hotelId },
      include: threadSummaryInclude,
    });
    if (!thread) return null;

    let beforeCreatedAt: Date | undefined;
    if (before) {
      const pivot = await this.prisma.guestMessage.findUnique({
        where: { id: before },
        select: { createdAt: true },
      });
      if (pivot) {
        beforeCreatedAt = pivot.createdAt;
      }
    }

    const where: Prisma.GuestMessageWhereInput = {
      threadId,
      ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}),
    };

    const total = await this.prisma.guestMessage.count({ where: { threadId } });
    const fetched = await this.prisma.guestMessage.findMany({
      where,
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      ...(before ? {} : { skip }),
      take: take + 1,
    });

    const hasMore = fetched.length > take;
    const rawItems = hasMore ? fetched.slice(0, take) : fetched;
    const nextCursor = hasMore ? (rawItems[rawItems.length - 1]?.id ?? null) : null;
    const items = rawItems.reverse();

    return { thread, total, items, nextCursor, hasMore };
  }

  async clearThread(hotelId: string, threadId: string) {
    return this.prisma.guestMessageThread.updateMany({
      where: { id: threadId, hotelId },
      data: { status: "CLEARED", clearedAt: new Date() },
    });
  }
}
