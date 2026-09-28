import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { MarketplaceOrderStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";
import { MarketplaceConversationRepository } from "../infrastructure/marketplace-conversation.repository";
import type {
  ListMarketplaceConversationMessagesQuery,
  SendMarketplaceConversationMessageInput,
} from "../domain/marketplace-conversation.schema";

export type OutboundBridgeDispatcher = {
  dispatchGuestMessage?: (payload: {
    message: unknown;
    order: unknown;
    conversation: unknown;
  }) => Promise<void> | void;
};

@Injectable()
export class MarketplaceConversationService {
  private static bridgeDispatcher?: OutboundBridgeDispatcher;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: MarketplaceConversationRepository,
  ) {}

  static setBridgeDispatcher(dispatcher: OutboundBridgeDispatcher) {
    this.bridgeDispatcher = dispatcher;
  }

  setBridgeDispatcher(dispatcher: OutboundBridgeDispatcher) {
    MarketplaceConversationService.bridgeDispatcher = dispatcher;
  }

  async getConversation(
    scope: { hotelId: string; stayId: string },
    orderId: string,
    query?: ListMarketplaceConversationMessagesQuery,
  ) {
    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        hotelId: true,
        stayId: true,
        serviceTenantId: true,
        assignedLocalMateProfileId: true,
        status: true,
        orderNumber: true,
      },
    });

    if (!order || order.stayId !== scope.stayId || order.hotelId !== scope.hotelId) {
      throw new NotFoundException("Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập");
    }

    const conversation = await this.repo.findOrCreateConversation(order.id, {
      hotelId: order.hotelId,
      stayId: order.stayId,
      serviceTenantId: order.serviceTenantId,
      assignedLocalMateProfileId: order.assignedLocalMateProfileId,
    });

    const items = await this.repo.listMessages(conversation.id, query?.limit ?? 50, query?.before);

    return {
      id: conversation.id,
      orderId: order.id,
      orderStatus: order.status,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      items: items.map((msg) => ({
        id: msg.id,
        orderId: msg.orderId,
        senderType: msg.senderType,
        body: msg.body,
        deliveryStatus: msg.deliveryStatus,
        createdAt: msg.createdAt.toISOString(),
      })),
    };
  }

  async sendGuestMessage(
    scope: { hotelId: string; stayId: string; sessionId?: string },
    orderId: string,
    input: SendMarketplaceConversationMessageInput,
  ) {
    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: {
        stay: {
          select: {
            room: { select: { id: true } },
            guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
          },
        },
      },
    });

    if (!order || order.stayId !== scope.stayId || order.hotelId !== scope.hotelId) {
      throw new NotFoundException("Không tìm thấy đơn hàng");
    }

    if (order.status === MarketplaceOrderStatus.PENDING) {
      throw new ConflictException(
        "Cuộc trò chuyện chỉ mở sau khi hướng dẫn viên xác nhận đơn hàng",
      );
    }

    if (order.status !== MarketplaceOrderStatus.ACKNOWLEDGED) {
      throw new ConflictException("Đơn hàng đã kết thúc, không thể gửi thêm tin nhắn");
    }

    const conversation = await this.repo.findOrCreateConversation(order.id, {
      hotelId: order.hotelId,
      stayId: order.stayId,
      serviceTenantId: order.serviceTenantId,
      assignedLocalMateProfileId: order.assignedLocalMateProfileId,
    });

    const { isDuplicate, message } = await this.repo.appendGuestMessage({
      conversationId: conversation.id,
      orderId: order.id,
      body: input.body.trim(),
      clientMessageId: input.clientMessageId.trim(),
    });

    const messageDto = {
      id: message.id,
      orderId: message.orderId,
      senderType: message.senderType,
      body: message.body,
      deliveryStatus: message.deliveryStatus,
      createdAt: message.createdAt.toISOString(),
    };

    if (!isDuplicate) {
      RequestRealtimeEmitter.emitMarketplaceConversationMessageCreated({
        hotelId: order.hotelId,
        stayId: order.stayId,
        sessionId: scope.sessionId ?? order.stay?.guestSessions?.[0]?.id,
        orderId: order.id,
        message: messageDto,
      });

      this.notifyOutboundMessageSafely({
        message,
        order,
        conversation,
      });
    }

    return messageDto;
  }

  private notifyOutboundMessageSafely(payload: {
    message: unknown;
    order: unknown;
    conversation: unknown;
  }) {
    try {
      MarketplaceConversationService.bridgeDispatcher?.dispatchGuestMessage?.(payload);
    } catch {
      // Ignored: outbound Telegram delivery failure is handled asynchronously / retried
    }
  }
}
