import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CapacityReservationStatus,
  MarketplaceMessageDeliveryStatus,
  MarketplaceOrderActorType,
  MarketplaceOrderStatus,
  MarketplaceOrderPaymentStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";
import { TelegramNotificationService } from "./telegram-notification.service";
import { LocalMatePaymentsService } from "../../localmate-payments/application/localmate-payments.service";
import type {
  TelegramCallbackQuery,
  TelegramMessage,
} from "../domain/schemas/telegram-update.schema";

export function escapeTelegramHtml(text: string): string {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface SendOrderNotificationResult {
  success: boolean;
  messageId?: number;
  error?: string;
  isTerminal?: boolean;
  errorCode?: string;
}

@Injectable()
export class TelegramMarketplaceBridgeService {
  private readonly logger = new Logger(TelegramMarketplaceBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramNotificationService: TelegramNotificationService,
    private readonly localMatePaymentsService: LocalMatePaymentsService,
  ) {}

  async sendOrderNotificationToGuide(orderInput: any): Promise<SendOrderNotificationResult> {
    try {
      const order =
        orderInput?.assignedLocalMateProfileId && orderInput?.stay
          ? orderInput
          : await this.prisma.marketplaceOrder.findUnique({
              where: { id: orderInput.id ?? orderInput },
              include: {
                stay: {
                  select: {
                    guestDisplayName: true,
                    room: { select: { roomNumber: true } },
                  },
                },
                payment: true,
              },
            });

      if (!order || !order.assignedLocalMateProfileId) {
        return {
          success: false,
          error: "No assigned LocalMate",
          isTerminal: true,
          errorCode: "NO_ASSIGNED_LOCALMATE",
        };
      }

      // Pre-payment gating: if payment record exists, verify it is eligible (PAID or NOT_REQUIRED)
      if (order.payment) {
        const isEligiblePayment =
          order.payment.status === MarketplaceOrderPaymentStatus.PAID ||
          order.payment.status === MarketplaceOrderPaymentStatus.NOT_REQUIRED;
        if (!isEligiblePayment) {
          this.logger.warn(
            `Order ${order.id} payment status is ${order.payment.status}, notification blocked until paid`,
          );
          return {
            success: false,
            error: "Payment not completed",
            isTerminal: false,
            errorCode: "PAYMENT_NOT_READY",
          };
        }
      }

      const binding = await this.prisma.localMateTelegramBinding.findFirst({
        where: {
          localMateProfileId: order.assignedLocalMateProfileId,
          revokedAt: null,
          blockedAt: null,
        },
      });

      if (!binding) {
        this.logger.warn(
          `LocalMate ${order.assignedLocalMateProfileId} has no active Telegram binding for order ${order.id}`,
        );
        return {
          success: false,
          error: "No active Telegram binding",
          isTerminal: true,
          errorCode: "NO_ACTIVE_TELEGRAM_BINDING",
        };
      }

      const guestName = order.stay?.guestDisplayName ?? "Khách lưu trú";
      const roomNumber = order.stay?.room?.roomNumber
        ? ` (Phòng ${order.stay.room.roomNumber})`
        : "";
      const startTime = order.requestedStartAt
        ? new Date(order.requestedStartAt).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
          })
        : "Sớm nhất có thể";
      const partySize = order.partySize ? `${order.partySize} khách` : "1 khách";
      const note = order.guestNote ? escapeTelegramHtml(order.guestNote) : "Không có";
      const price = Number(order.partnerSubtotal ?? order.totalAmount ?? 0).toLocaleString("vi-VN");

      const hasPayment = !!order.payment;
      const tourTotal =
        hasPayment && order.payment.tourTotalAmount != null
          ? Number(order.payment.tourTotalAmount).toLocaleString("vi-VN")
          : price;
      const paidToVietSage =
        hasPayment && order.payment.platformFeeAmount != null
          ? Number(order.payment.platformFeeAmount).toLocaleString("vi-VN")
          : null;
      const guideCollects =
        hasPayment && order.payment.guideRemainingAmount != null
          ? Number(order.payment.guideRemainingAmount).toLocaleString("vi-VN")
          : null;

      const textLines = [
        "🔔 <b>YÊU CẦU ĐẶT LOCALMATE MỚI!</b>",
        "",
        `📋 <b>Mã đơn / Order:</b> <code>#${escapeTelegramHtml(order.orderNumber)}</code>`,
        `🧭 <b>Dịch vụ / Service:</b> ${escapeTelegramHtml(order.serviceNameSnapshot ?? "Dịch vụ LocalMate")}`,
        `👤 <b>Khách:</b> ${escapeTelegramHtml(guestName)}${escapeTelegramHtml(roomNumber)}`,
        `⏰ <b>Thời gian hẹn / Time:</b> ${startTime}`,
        `👥 <b>Số lượng / Guests:</b> ${partySize}`,
        `📝 <b>Ghi chú:</b> ${note}`,
      ];

      if (paidToVietSage != null && guideCollects != null) {
        textLines.push(
          `💰 <b>Tổng tiền tour / Tour total:</b> ${tourTotal} VND`,
          `💳 <b>Đã thanh toán VietSage / Paid to VietSage:</b> ${paidToVietSage} VND`,
          `💵 <b>HDV thu trực tiếp / Guide collects:</b> ${guideCollects} VND`,
        );
      } else {
        textLines.push(`💰 <b>Tạm tính:</b> ${tourTotal} VND`);
      }

      textLines.push("", "<i>Vui lòng chọn Nhận đơn hoặc Từ chối bên dưới:</i>");

      const text = textLines.join("\n");

      const inlineKeyboard = {
        inline_keyboard: [
          [
            { text: "✅ Nhận đơn", callback_data: `mo:a:${order.id}` },
            { text: "❌ Từ chối", callback_data: `mo:r:${order.id}` },
          ],
        ],
      };

      const res = await this.telegramNotificationService.callTelegram<{
        result?: { message_id?: number };
      }>("sendMessage", {
        chat_id: binding.telegramChatId,
        text,
        parse_mode: "HTML",
        protect_content: true,
        reply_markup: inlineKeyboard,
      });

      // Find or create conversation and record initial order notification message for reply routing
      if (res.result?.message_id) {
        const conversation = await this.findOrCreateConversation(order);
        await this.prisma.marketplaceConversationMessage
          .create({
            data: {
              conversationId: conversation.id,
              orderId: order.id,
              senderType: MarketplaceOrderActorType.SYSTEM,
              body: `Yêu cầu đặt dịch vụ LocalMate ${order.orderNumber}`,
              deliveryStatus: MarketplaceMessageDeliveryStatus.SENT,
              telegramChatId: binding.telegramChatId,
              telegramMessageId: String(res.result.message_id),
            },
          })
          .catch(() => {
            // Non-blocking duplicate protection
          });
      }

      return {
        success: true,
        messageId: res.result?.message_id,
      };
    } catch (error: any) {
      this.logger.error("Failed to send order notification to guide via Telegram", error);
      const errMsg = error?.message ?? String(error);
      const isBotBlocked =
        errMsg.includes("bot was blocked by the user") ||
        errMsg.includes("chat not found") ||
        errMsg.includes("user is deactivated");

      if (isBotBlocked) {
        return {
          success: false,
          error: errMsg,
          isTerminal: true,
          errorCode: "TELEGRAM_BOT_BLOCKED",
        };
      }

      return {
        success: false,
        error: errMsg,
        isTerminal: false,
        errorCode: "TELEGRAM_SEND_FAILED",
      };
    }
  }

  async handleCallbackQuery(callbackQuery: TelegramCallbackQuery): Promise<void> {
    const data = callbackQuery.data;
    if (!data || !data.startsWith("mo:")) return;

    const parts = data.split(":");
    if (parts.length < 3) return;

    const action = parts[1]; // 'a' or 'r'
    const orderId = parts.slice(2).join(":");
    if (!callbackQuery.from?.id) return;
    const callerUserId = String(callbackQuery.from.id);
    const callerChatId = callbackQuery.message?.chat?.id;

    const binding = callerChatId
      ? await this.prisma.localMateTelegramBinding.findFirst({
          where: {
            telegramUserId: callerUserId,
            telegramChatId: String(callerChatId),
            revokedAt: null,
            blockedAt: null,
          },
        })
      : null;

    if (!binding) {
      await this.telegramNotificationService.callTelegram("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Bạn không có quyền thực hiện thao tác này.",
        show_alert: true,
      });
      return;
    }

    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: {
        stay: {
          select: {
            guestDisplayName: true,
            room: { select: { id: true, roomNumber: true } },
            guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
          },
        },
        service: { select: { id: true, capacityAvailable: true } },
        payment: { select: { id: true, status: true } },
      },
    });

    if (!order || order.assignedLocalMateProfileId !== binding.localMateProfileId) {
      await this.telegramNotificationService.callTelegram("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Đơn hàng này không thuộc về bạn.",
        show_alert: true,
      });
      return;
    }

    if (order.status !== MarketplaceOrderStatus.PENDING) {
      await this.telegramNotificationService.callTelegram("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: `Đơn hàng đã ở trạng thái ${order.status}.`,
        show_alert: true,
      });
      return;
    }

    if (action === "a") {
      // Accept / Acknowledge
      const updatedOrder = await this.prisma.$transaction(async (tx) => {
        const o = await tx.marketplaceOrder.update({
          where: { id: order.id, version: order.version },
          data: {
            status: MarketplaceOrderStatus.ACKNOWLEDGED,
            version: { increment: 1 },
          },
        });
        await tx.marketplaceOrderEvent.create({
          data: {
            orderId: order.id,
            actorType: MarketplaceOrderActorType.SERVICE_STAFF,
            fromStatus: MarketplaceOrderStatus.PENDING,
            toStatus: MarketplaceOrderStatus.ACKNOWLEDGED,
            note: "LocalMate đã nhận đơn qua Telegram",
          },
        });
        return o;
      });

      await this.findOrCreateConversation(order);

      RequestRealtimeEmitter.emitExternalServiceOrderStatusChanged({
        orderId: order.id,
        orderNumber: order.orderNumber,
        hotelId: order.hotelId,
        stayId: order.stayId,
        roomId: order.stay?.room?.id ?? undefined,
        serviceTenantId: order.serviceTenantId,
        serviceId: order.serviceId,
        sessionId: order.stay?.guestSessions?.[0]?.id ?? undefined,
        serviceName: order.serviceNameSnapshot,
        fromStatus: MarketplaceOrderStatus.PENDING,
        toStatus: MarketplaceOrderStatus.ACKNOWLEDGED,
        version: updatedOrder.version,
        actorType: MarketplaceOrderActorType.SERVICE_STAFF,
        note: "LocalMate đã nhận đơn qua Telegram",
      });

      await this.telegramNotificationService.callTelegram("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Bạn đã nhận đơn thành công!",
      });

      if (callbackQuery.message?.chat?.id && callbackQuery.message?.message_id) {
        await this.telegramNotificationService
          .callTelegram("editMessageReplyMarkup", {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            reply_markup: { inline_keyboard: [] },
          })
          .catch(() => {});

        await this.telegramNotificationService
          .callTelegram("sendMessage", {
            chat_id: callbackQuery.message.chat.id,
            text: `✅ <b>Đã nhận đơn ${escapeTelegramHtml(order.orderNumber)}!</b>\n\nBạn có thể trả lời khách trực tiếp bằng cách Reply tin nhắn trong đơn này.`,
            parse_mode: "HTML",
          })
          .catch(() => {});
      }
    } else if (action === "r") {
      // Reject
      const updatedOrder = await this.prisma.$transaction(async (tx) => {
        const o = await tx.marketplaceOrder.update({
          where: { id: order.id, version: order.version },
          data: {
            status: MarketplaceOrderStatus.REJECTED,
            version: { increment: 1 },
          },
        });

        if (order.service?.capacityAvailable != null) {
          await tx.marketplaceService.update({
            where: { id: order.serviceId },
            data: {
              capacityAvailable: { increment: order.quantity },
              version: { increment: 1 },
            },
          });
        }

        await tx.marketplaceOrderEvent.create({
          data: {
            orderId: order.id,
            actorType: MarketplaceOrderActorType.SERVICE_STAFF,
            fromStatus: MarketplaceOrderStatus.PENDING,
            toStatus: MarketplaceOrderStatus.REJECTED,
            note: "LocalMate từ chối đơn qua Telegram",
          },
        });

        if (order.payment?.status === MarketplaceOrderPaymentStatus.PAID) {
          await tx.marketplaceOrderPayment.updateMany({
            where: {
              id: order.payment.id,
              status: MarketplaceOrderPaymentStatus.PAID,
            },
            data: { status: MarketplaceOrderPaymentStatus.REFUND_PENDING },
          });
        }
        return o;
      });

      if (order.payment?.status === MarketplaceOrderPaymentStatus.PAID) {
        await this.localMatePaymentsService
          .refundLocalMatePayment({
            paymentId: order.payment.id,
            reason: "GUIDE_REJECTED",
          })
          .catch((error) => {
            this.logger.error("Failed to start LocalMate refund after guide rejection", error);
          });
      }

      RequestRealtimeEmitter.emitExternalServiceOrderStatusChanged({
        orderId: order.id,
        orderNumber: order.orderNumber,
        hotelId: order.hotelId,
        stayId: order.stayId,
        roomId: order.stay?.room?.id ?? undefined,
        serviceTenantId: order.serviceTenantId,
        serviceId: order.serviceId,
        sessionId: order.stay?.guestSessions?.[0]?.id ?? undefined,
        serviceName: order.serviceNameSnapshot,
        fromStatus: MarketplaceOrderStatus.PENDING,
        toStatus: MarketplaceOrderStatus.REJECTED,
        version: updatedOrder.version,
        actorType: MarketplaceOrderActorType.SERVICE_STAFF,
        note: "LocalMate từ chối đơn qua Telegram",
      });

      await this.telegramNotificationService.callTelegram("answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Bạn đã từ chối đơn hàng.",
      });

      if (callbackQuery.message?.chat?.id && callbackQuery.message?.message_id) {
        await this.telegramNotificationService
          .callTelegram("editMessageReplyMarkup", {
            chat_id: callbackQuery.message.chat.id,
            message_id: callbackQuery.message.message_id,
            reply_markup: { inline_keyboard: [] },
          })
          .catch(() => {});
      }
    }
  }

  async sendGuestMessageToGuide(payload: {
    message: any;
    order: any;
    conversation: any;
  }): Promise<void> {
    const { message, order } = payload;
    const guideProfileId = order.assignedLocalMateProfileId;

    if (!guideProfileId) return;

    const binding = await this.prisma.localMateTelegramBinding.findFirst({
      where: {
        localMateProfileId: guideProfileId,
        revokedAt: null,
        blockedAt: null,
      },
    });

    if (!binding) {
      await this.prisma.marketplaceConversationMessage.update({
        where: { id: message.id },
        data: {
          deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
          lastDeliveryError: "No active Telegram binding",
          nextAttemptAt: null,
        },
      });
      return;
    }

    const text = [
      `💬 <b>Khách nhắn</b> (Đơn <code>${escapeTelegramHtml(order.orderNumber)}</code>):`,
      "",
      escapeTelegramHtml(message.body),
      "",
      "<i>(Reply tin nhắn này để trả lời cho khách)</i>",
    ].join("\n");

    try {
      const res = await this.telegramNotificationService.callTelegram<{
        result?: { message_id?: number };
      }>("sendMessage", {
        chat_id: binding.telegramChatId,
        text,
        parse_mode: "HTML",
        protect_content: true,
      });

      const telegramMessageId = res.result?.message_id ? String(res.result.message_id) : null;
      await this.prisma.marketplaceConversationMessage.update({
        where: { id: message.id },
        data: {
          deliveryStatus: MarketplaceMessageDeliveryStatus.SENT,
          telegramChatId: binding.telegramChatId,
          telegramMessageId,
          lastDeliveryError: null,
          nextAttemptAt: null,
        },
      });
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      const isBotBlocked =
        errMsg.includes("bot was blocked by the user") ||
        errMsg.includes("chat not found") ||
        errMsg.includes("user is deactivated");

      if (isBotBlocked) {
        await this.prisma.localMateTelegramBinding.update({
          where: { id: binding.id },
          data: { blockedAt: new Date() },
        });
        await this.prisma.marketplaceConversationMessage.update({
          where: { id: message.id },
          data: {
            deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
            lastDeliveryError: errMsg.slice(0, 500),
            nextAttemptAt: null,
          },
        });
      } else {
        const retryDelayMs = Math.min(
          5 * 60 * 1000,
          60 * 1000 * 2 ** Math.max(0, Number(message.attemptCount ?? 0)),
        );
        const nextAttempt = new Date(Date.now() + retryDelayMs);
        await this.prisma.marketplaceConversationMessage.update({
          where: { id: message.id },
          data: {
            deliveryStatus: MarketplaceMessageDeliveryStatus.FAILED,
            attemptCount: { increment: 1 },
            lastDeliveryError: errMsg.slice(0, 500),
            nextAttemptAt: nextAttempt,
          },
        });
      }
    }
  }

  async handleInboundMessage(message: TelegramMessage): Promise<void> {
    if (message.chat.type !== "private") return;
    if (!message.text || message.text.startsWith("/")) return;

    const callerUserId = String(message.from?.id);
    const callerChatId = String(message.chat.id);

    const binding = await this.prisma.localMateTelegramBinding.findFirst({
      where: {
        telegramUserId: callerUserId,
        telegramChatId: callerChatId,
        revokedAt: null,
        blockedAt: null,
      },
    });

    if (!binding) return;

    let targetOrderId: string | undefined;

    // Check if reply to previous message
    if (message.reply_to_message?.message_id) {
      const replied = await this.prisma.marketplaceConversationMessage.findFirst({
        where: {
          telegramChatId: callerChatId,
          telegramMessageId: String(message.reply_to_message.message_id),
        },
      });
      if (replied) {
        targetOrderId = replied.orderId;
      }
    }

    if (!targetOrderId) {
      const activeOrders = await this.prisma.marketplaceOrder.findMany({
        where: {
          assignedLocalMateProfileId: binding.localMateProfileId,
          status: MarketplaceOrderStatus.ACKNOWLEDGED,
        },
        include: {
          stay: {
            select: {
              guestDisplayName: true,
              room: { select: { roomNumber: true } },
            },
          },
        },
      });

      if (activeOrders.length === 0) {
        await this.telegramNotificationService
          .callTelegram("sendMessage", {
            chat_id: callerChatId,
            text: "Hiện tại bạn không có đơn hàng nào đang hoạt động để gửi tin nhắn.",
          })
          .catch(() => {});
        return;
      }

      if (activeOrders.length > 1) {
        await this.telegramNotificationService
          .callTelegram("sendMessage", {
            chat_id: callerChatId,
            text: "⚠️ Bạn có nhiều đơn hàng đang hoạt động. Vui lòng bấm 'Reply' (Trả lời) đúng tin nhắn của đơn hàng cần trao đổi với khách.",
          })
          .catch(() => {});
        return; // Persist nothing on ambiguous no-reply
      }

      targetOrderId = activeOrders[0].id;
    }

    const order = await this.prisma.marketplaceOrder.findUnique({
      where: { id: targetOrderId },
      include: {
        stay: {
          select: {
            room: { select: { id: true } },
            guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
          },
        },
      },
    });

    if (
      !order ||
      order.assignedLocalMateProfileId !== binding.localMateProfileId ||
      order.status !== MarketplaceOrderStatus.ACKNOWLEDGED
    ) {
      await this.telegramNotificationService
        .callTelegram("sendMessage", {
          chat_id: callerChatId,
          text: "Đơn hàng này không còn trong trạng thái hoạt động để trò chuyện.",
        })
        .catch(() => {});
      return;
    }

    // Duplicate protection
    const duplicate = await this.prisma.marketplaceConversationMessage.findUnique({
      where: {
        telegramChatId_telegramMessageId: {
          telegramChatId: callerChatId,
          telegramMessageId: String(message.message_id),
        },
      },
    });
    if (duplicate) return;

    const conversation = await this.findOrCreateConversation(order);

    try {
      const savedMessage = await this.prisma.$transaction(async (tx) => {
        const msg = await tx.marketplaceConversationMessage.create({
          data: {
            conversationId: conversation.id,
            orderId: order.id,
            senderType: MarketplaceOrderActorType.SERVICE_STAFF,
            body: message.text!.slice(0, 1000),
            deliveryStatus: MarketplaceMessageDeliveryStatus.RECEIVED,
            telegramChatId: callerChatId,
            telegramMessageId: String(message.message_id),
          },
        });

        await tx.marketplaceConversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        });

        return msg;
      });

      RequestRealtimeEmitter.emitMarketplaceConversationMessageCreated({
        hotelId: order.hotelId,
        stayId: order.stayId,
        sessionId: order.stay?.guestSessions?.[0]?.id,
        orderId: order.id,
        message: {
          id: savedMessage.id,
          orderId: savedMessage.orderId,
          senderType: savedMessage.senderType,
          body: savedMessage.body,
          deliveryStatus: savedMessage.deliveryStatus,
          createdAt: savedMessage.createdAt.toISOString(),
        },
      });

      // Strict rule: NEVER echo inbound message back to Telegram
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return; // Idempotent duplicate
      }
      throw err;
    }
  }

  private async findOrCreateConversation(order: {
    id: string;
    hotelId: string;
    stayId: string;
    serviceTenantId: string;
    assignedLocalMateProfileId?: string | null;
  }) {
    const existing = await this.prisma.marketplaceConversation.findUnique({
      where: { orderId: order.id },
    });
    if (existing) return existing;

    return this.prisma.marketplaceConversation.create({
      data: {
        orderId: order.id,
        hotelId: order.hotelId,
        stayId: order.stayId,
        serviceTenantId: order.serviceTenantId,
        assignedLocalMateProfileId: order.assignedLocalMateProfileId ?? null,
        status: "ACTIVE",
      },
    });
  }
}
