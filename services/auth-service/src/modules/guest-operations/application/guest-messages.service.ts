import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { GuestRequestActorType, GuestStayStatus } from "@prisma/client";
import { HotelAccessService } from "../../property/property-public";
import type { GuestSessionContext } from "./guest-os.service";
import { GuestMessagesRepository } from "../infrastructure/repositories/guest-messages.repository";

const RETENTION_DAYS = 14;

@Injectable()
export class GuestMessagesService {
  constructor(
    private readonly repository: GuestMessagesRepository,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  async listForGuest(context: GuestSessionContext, page = 1, limit = 20, before?: string) {
    const result = await this.repository.listGuestMessages(
      context.stayId,
      (page - 1) * limit,
      limit,
      before,
    );
    return {
      page,
      limit,
      total: result.total,
      nextCursor: result.nextCursor ?? null,
      hasMore: result.hasMore ?? false,
      thread: result.thread ? this.thread(result.thread) : null,
      items: result.items.map((item) => this.message(item)),
    };
  }

  async sendFromGuest(context: GuestSessionContext, body: string, plannedCheckOutAt: Date) {
    const message = this.normalizeBody(body);
    const result = await this.repository.appendGuestMessage({
      hotelId: context.hotelId,
      roomId: context.roomId,
      stayId: context.stayId,
      sessionId: context.sessionId,
      senderType: GuestRequestActorType.GUEST,
      body: message,
      expiresAt: this.expiry(plannedCheckOutAt),
    });
    return { thread: this.thread(result.thread), message: this.message(result.message) };
  }

  async listForHotel(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    page = 1,
    limit = 30,
    q?: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const result = await this.repository.listHotelThreads(
      hotelId,
      (page - 1) * limit,
      limit,
      q?.trim(),
    );
    return {
      page,
      limit,
      total: result.total,
      items: result.items.map((item) =>
        this.thread(item, item.messages[0] ? this.message(item.messages[0]) : null),
      ),
    };
  }

  async getForHotel(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    threadId: string,
    page = 1,
    limit = 20,
    before?: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const result = await this.repository.getHotelThread(
      hotelId,
      threadId,
      (page - 1) * limit,
      limit,
      before,
    );
    if (!result) throw new NotFoundException("Không tìm thấy hội thoại phòng");
    return {
      page,
      limit,
      total: result.total,
      nextCursor: result.nextCursor ?? null,
      hasMore: result.hasMore ?? false,
      thread: this.thread(result.thread),
      items: result.items.map((item) => this.message(item)),
    };
  }

  async replyFromStaff(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    threadId: string,
    body: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const existing = await this.repository.getHotelThread(hotelId, threadId, 0, 1);
    if (!existing) throw new NotFoundException("Không tìm thấy hội thoại phòng");
    if (
      existing.thread.stay.status !== GuestStayStatus.ACTIVE ||
      existing.thread.stay.checkedOutAt
    ) {
      throw new BadRequestException("Khách đã checkout, không thể gửi tin nhắn mới");
    }
    const result = await this.repository.appendGuestMessage({
      hotelId,
      roomId: existing.thread.roomId,
      stayId: existing.thread.stayId,
      senderType: GuestRequestActorType.STAFF,
      senderUserId: actorUserId,
      body: this.normalizeBody(body),
      expiresAt: this.expiry(existing.thread.stay.plannedCheckOutAt),
    });
    return { thread: this.thread(result.thread), message: this.message(result.message) };
  }

  async clearForHotel(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    threadId: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const updated = await this.repository.clearThread(hotelId, threadId);
    if (updated.count === 0) throw new NotFoundException("Không tìm thấy hội thoại phòng");
    return { cleared: true };
  }

  private normalizeBody(value: string) {
    const body = value.trim();
    if (!body || body.length > 1000)
      throw new BadRequestException("Tin nhắn phải có từ 1 đến 1000 ký tự");
    return body;
  }

  private expiry(checkOutAt: Date) {
    const fromCheckout = new Date(checkOutAt);
    fromCheckout.setDate(fromCheckout.getDate() + RETENTION_DAYS);
    return fromCheckout;
  }

  private message(row: {
    id: string;
    senderType: GuestRequestActorType;
    body: string;
    createdAt: Date;
    senderUser?: { id: string; fullName: string } | null;
  }) {
    return {
      id: row.id,
      senderType: row.senderType,
      body: row.body,
      createdAt: row.createdAt,
      senderName: row.senderUser?.fullName ?? null,
    };
  }

  private thread(
    row: {
      id: string;
      status: string;
      lastMessageAt: Date;
      expiresAt: Date;
      clearedAt: Date | null;
      room: { roomNumber: string };
      stay: {
        guestDisplayName: string;
        status: GuestStayStatus;
        checkedOutAt: Date | null;
        plannedCheckOutAt?: Date;
      };
    },
    latestMessage?: ReturnType<GuestMessagesService["message"]> | null,
  ) {
    return {
      id: row.id,
      status: row.status,
      lastMessageAt: row.lastMessageAt,
      expiresAt: row.expiresAt,
      clearedAt: row.clearedAt,
      roomNumber: row.room.roomNumber,
      guestName: row.stay.guestDisplayName,
      stayStatus: row.stay.status,
      checkedOutAt: row.stay.checkedOutAt,
      latestMessage: latestMessage ?? null,
    };
  }
}
