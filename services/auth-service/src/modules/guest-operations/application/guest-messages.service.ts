import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { GuestRequestActorType, GuestStayStatus } from "@prisma/client";
import {
  GUEST_REQUEST_EVENT_PUBLISHER,
  NOOP_GUEST_REQUEST_EVENT_PUBLISHER,
  type GuestRequestEventPublisher,
} from "../../../shared/events";
import { HotelAccessService } from "../../property/property-public";
import type { GuestSessionContext } from "./guest-os.service";
import { GuestMessagesRepository } from "../infrastructure/repositories/guest-messages.repository";

const RETENTION_DAYS = 14;

@Injectable()
export class GuestMessagesService {
  private readonly eventPublisher: GuestRequestEventPublisher;

  constructor(
    private readonly repository: GuestMessagesRepository,
    private readonly hotelAccessService: HotelAccessService,
    @Optional()
    @Inject(GUEST_REQUEST_EVENT_PUBLISHER)
    eventPublisher?: GuestRequestEventPublisher,
  ) {
    this.eventPublisher = eventPublisher ?? NOOP_GUEST_REQUEST_EVENT_PUBLISHER;
  }

  async getStaffUnreadSummary(actorUserId: string, activeRoleId: string, hotelId: string) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.repository.getStaffUnreadSummary(hotelId);
  }

  async getGuestUnreadSummary(context: GuestSessionContext) {
    await this.assertActiveGuestStay(context);
    return this.repository.getGuestUnreadSummary(context.stayId, context.hotelId);
  }

  async listForGuest(context: GuestSessionContext, page = 1, limit = 20, before?: string) {
    await this.assertActiveGuestStay(context);
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

  async sendFromGuest(
    context: GuestSessionContext,
    body: string,
    plannedCheckOutAt: Date,
    clientMessageId?: string,
  ) {
    await this.assertActiveGuestStay(context);

    const clientMsgId = clientMessageId?.trim();
    if (!clientMsgId) {
      throw new BadRequestException("clientMessageId là bắt buộc khi gửi tin nhắn từ khách");
    }

    const messageText = this.normalizeBody(body);
    const decision = await this.repository.appendGuestMessageAtomic({
      hotelId: context.hotelId,
      roomId: context.roomId,
      stayId: context.stayId,
      sessionId: context.sessionId,
      deviceFingerprintHash: context.deviceFingerprintHash ?? undefined,
      clientMessageId: clientMsgId,
      senderType: GuestRequestActorType.GUEST,
      body: messageText,
      expiresAt: this.expiry(plannedCheckOutAt),
    });
    if (decision.kind === "rate-limited") {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Bạn đã gửi quá nhiều tin nhắn. Vui lòng thử lại sau.",
          error: "Too Many Requests",
          retryAfterSeconds: decision.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const result = decision.value;
    if (!result) throw new BadRequestException("Phiên lưu trú đã kết thúc");
    const response = { thread: this.thread(result.thread), message: this.message(result.message) };
    if (decision.kind === "existing") return response;
    const eventId = randomUUID();
    this.eventPublisher.publishGuestMessageCreated({
      eventId,
      messageId: result.message.id,
      hotelId: context.hotelId,
      stayId: context.stayId,
      threadId: result.thread.id,
      thread: response.thread,
      message: response.message,
    });
    return response;
  }

  async listForHotel(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    limit = 30,
    q?: string,
    cursor?: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const result = await this.repository.listHotelThreads(hotelId, limit, q?.trim(), cursor);
    return {
      limit,
      total: result.total,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
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
    if (!result) throw new BadRequestException("Khách đã checkout, không thể gửi tin nhắn mới");
    const response = { thread: this.thread(result.thread), message: this.message(result.message) };
    const eventId = randomUUID();
    this.eventPublisher.publishGuestMessageCreated({
      eventId,
      messageId: result.message.id,
      hotelId,
      stayId: result.thread.stayId,
      threadId: result.thread.id,
      thread: response.thread,
      message: response.message,
    });
    return response;
  }

  async markReadForHotel(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    threadId: string,
    readThroughMessageId?: string,
  ) {
    if (!readThroughMessageId?.trim()) {
      throw new BadRequestException("readThroughMessageId là bắt buộc");
    }
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const existing = await this.repository.getHotelThread(hotelId, threadId, 0, 1);
    if (!existing) throw new NotFoundException("Không tìm thấy hội thoại phòng");
    const updated = await this.repository.markReadForStaff(hotelId, threadId, readThroughMessageId);
    return { read: true, updatedCount: updated.count };
  }

  async markReadForGuest(context: GuestSessionContext, readThroughMessageId?: string) {
    if (!readThroughMessageId?.trim()) {
      throw new BadRequestException("readThroughMessageId là bắt buộc");
    }
    await this.assertActiveGuestStay(context);
    const updated = await this.repository.markReadForGuest(
      context.hotelId,
      context.stayId,
      readThroughMessageId,
    );
    return { read: true, updatedCount: updated.count };
  }

  private async assertActiveGuestStay(context: GuestSessionContext) {
    const active = await this.repository.isActiveStay(context.stayId, context.hotelId);
    if (!active) throw new BadRequestException("Phiên lưu trú đã kết thúc");
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
    readAt?: Date | null;
    senderUser?: { id: string; fullName: string } | null;
  }) {
    return {
      id: row.id,
      senderType: row.senderType,
      body: row.body,
      createdAt: row.createdAt,
      readAt: row.readAt ?? null,
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
      stayId: string;
      room: { roomNumber: string; floor: string | null; type: string | null };
      stay: {
        guestDisplayName: string;
        status: GuestStayStatus;
        checkedOutAt: Date | null;
        plannedCheckOutAt?: Date;
      };
      _count?: { messages: number };
    },
    latestMessage?: ReturnType<GuestMessagesService["message"]> | null,
  ) {
    return {
      id: row.id,
      status: row.status,
      lastMessageAt: row.lastMessageAt,
      expiresAt: row.expiresAt,
      clearedAt: row.clearedAt,
      stayId: row.stayId,
      roomNumber: row.room.roomNumber,
      floor: row.room.floor,
      roomType: row.room.type,
      guestName: row.stay.guestDisplayName,
      stayStatus: row.stay.status,
      checkedOutAt: row.stay.checkedOutAt,
      unreadCount: row._count?.messages ?? 0,
      latestMessage: latestMessage ?? null,
    };
  }
}
