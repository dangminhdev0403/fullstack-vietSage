import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  MarketplaceMessageDeliveryStatus,
  MarketplaceOrderPaymentStatus,
  MarketplaceOrderStatus,
} from "@prisma/client";
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

export type MarketplaceConversationCustomerScope =
  { hotelId: string; stayId: string; sessionId?: string } | { publicSessionId: string };

function ownsOrder(
  scope: MarketplaceConversationCustomerScope,
  order: { hotelId: string | null; stayId: string | null; publicSessionId: string | null },
) {
  return "publicSessionId" in scope
    ? order.publicSessionId === scope.publicSessionId
    : order.hotelId === scope.hotelId && order.stayId === scope.stayId;
}

function isConversationOpen(order: {
  assignedLocalMateProfileId: string | null;
  status: MarketplaceOrderStatus;
  payment?: { status: MarketplaceOrderPaymentStatus } | null;
}) {
  if (order.payment) {
    return (
      (order.status === MarketplaceOrderStatus.PENDING ||
        order.status === MarketplaceOrderStatus.ACKNOWLEDGED) &&
      (order.payment.status === MarketplaceOrderPaymentStatus.PAID ||
        order.payment.status === MarketplaceOrderPaymentStatus.NOT_REQUIRED)
    );
  }
  return order.status === MarketplaceOrderStatus.ACKNOWLEDGED;
}

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
    scope: MarketplaceConversationCustomerScope,
    orderId: string,
    query?: ListMarketplaceConversationMessagesQuery,
  ) {
    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        hotelId: true,
        stayId: true,
        publicSessionId: true,
        serviceTenantId: true,
        assignedLocalMateProfileId: true,
        status: true,
        orderNumber: true,
        payment: { select: { status: true } },
      },
    });

    if (!order || !ownsOrder(scope, order)) {
      throw new NotFoundException("Không tìm thấy đơn hàng hoặc bạn không có quyền truy cập");
    }
    if (!isConversationOpen(order)) {
      throw new ConflictException("Cuộc trò chuyện chỉ mở sau khi thanh toán hoặc xác nhận đơn");
    }

    const conversation = await this.repo.findOrCreateConversation(order.id, {
      hotelId: order.hotelId,
      stayId: order.stayId,
      publicSessionId: order.publicSessionId,
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
        clientMessageId: msg.clientMessageId,
        createdAt: msg.createdAt.toISOString(),
      })),
    };
  }

  async sendGuestMessage(
    scope: MarketplaceConversationCustomerScope,
    orderId: string,
    input: SendMarketplaceConversationMessageInput,
  ) {
    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: {
        payment: { select: { status: true } },
        stay: {
          select: {
            room: { select: { id: true } },
            guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
          },
        },
      },
    });

    if (!order || !ownsOrder(scope, order)) {
      throw new NotFoundException("Không tìm thấy đơn hàng");
    }
    if (!isConversationOpen(order)) {
      throw new ConflictException("Đơn chưa sẵn sàng hoặc đã kết thúc, không thể gửi tin nhắn");
    }

    const conversation = await this.repo.findOrCreateConversation(order.id, {
      hotelId: order.hotelId,
      stayId: order.stayId,
      publicSessionId: order.publicSessionId,
      serviceTenantId: order.serviceTenantId,
      assignedLocalMateProfileId: order.assignedLocalMateProfileId,
    });

    const { isDuplicate, message } = await this.repo.appendGuestMessage({
      conversationId: conversation.id,
      orderId: order.id,
      body: input.body.trim(),
      clientMessageId: input.clientMessageId.trim(),
    });

    let responseMessage = message;

    if (isDuplicate && message.deliveryStatus === MarketplaceMessageDeliveryStatus.FAILED) {
      const claimed = await this.prisma.marketplaceConversationMessage.updateMany({
        where: {
          id: message.id,
          deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
        },
        data: {
          deliveryStatus: MarketplaceMessageDeliveryStatus.PENDING,
          nextAttemptAt: null,
          lastDeliveryError: null,
        },
      });
      if (claimed.count === 1) {
        responseMessage = {
          ...message,
          deliveryStatus: MarketplaceMessageDeliveryStatus.PENDING,
          nextAttemptAt: null,
          lastDeliveryError: null,
        };
        this.notifyOutboundMessageSafely({
          message: responseMessage,
          order,
          conversation,
        });
      }
    }

    const messageDto = {
      id: responseMessage.id,
      orderId: responseMessage.orderId,
      senderType: responseMessage.senderType,
      body: responseMessage.body,
      deliveryStatus: responseMessage.deliveryStatus,
      clientMessageId: responseMessage.clientMessageId,
      createdAt: responseMessage.createdAt.toISOString(),
    };

    if (!isDuplicate) {
      if (order.hotelId && order.stayId) {
        RequestRealtimeEmitter.emitMarketplaceConversationMessageCreated({
          hotelId: order.hotelId,
          stayId: order.stayId,
          sessionId:
            ("sessionId" in scope ? scope.sessionId : undefined) ??
            order.stay?.guestSessions?.[0]?.id,
          orderId: order.id,
          message: messageDto,
        });
      }

      this.notifyOutboundMessageSafely({ message, order, conversation });
    }

    return messageDto;
  }

  private notifyOutboundMessageSafely(payload: {
    message: unknown;
    order: unknown;
    conversation: unknown;
  }) {
    try {
      const dispatch =
        MarketplaceConversationService.bridgeDispatcher?.dispatchGuestMessage?.(payload);
      if (dispatch && typeof dispatch.catch === "function") {
        void dispatch.catch(() => undefined);
      }
    } catch {
      // Provider failures are persisted and retried by the Telegram bridge.
    }
  }
}
