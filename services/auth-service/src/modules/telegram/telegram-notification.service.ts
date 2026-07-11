import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  GuestRequestNotificationStatus,
  GuestRequestStatus,
  NotificationProvider,
} from "@prisma/client";
import { AppLogger } from "../../common/logging/app-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  GUEST_REQUEST_EVENT_PUBLISHER,
  NOOP_GUEST_REQUEST_EVENT_PUBLISHER,
  type GuestRequestEventPublisher,
} from "../../shared/events";

type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  from?: { id?: number; first_name?: string; last_name?: string; username?: string };
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "Mới",
  CONFIRMED: "Đã xác nhận",
  PENDING: "Chờ xử lý",
  ACCEPTED: "Đã nhận xử lý",
  ON_THE_WAY: "Đang đến",
  IN_PROGRESS: "Đang thực hiện",
  COMPLETED: "Hoàn thành",
  REJECTED: "Từ chối",
  CREATED: "Mới",
  ACKNOWLEDGED: "Đã ghi nhận",
  CANCELLED: "Đã hủy",
  FAILED: "Thất bại",
};

@Injectable()
export class TelegramNotificationService {
  private readonly timeoutMs = 8000;
  private readonly guestRequestEventPublisher: GuestRequestEventPublisher;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    @Optional()
    @Inject(GUEST_REQUEST_EVENT_PUBLISHER)
    guestRequestEventPublisher?: GuestRequestEventPublisher,
  ) {
    this.guestRequestEventPublisher =
      guestRequestEventPublisher ?? NOOP_GUEST_REQUEST_EVENT_PUBLISHER;
  }

  async sendServiceRequestNotification(guestRequestId: string): Promise<void> {
    this.logger.info("Telegram notification started", {
      module: "telegram",
      service: TelegramNotificationService.name,
      event: "TELEGRAM_NOTIFY_START",
      guestRequestId,
    });
    const request = await this.loadRequest(guestRequestId);
    if (!request?.serviceItem?.category) return;

    const route = await this.findRoute(request.hotelId, request.serviceItem.categoryId);
    if (!route) {
      this.logger.warn("Telegram route not found", {
        module: "telegram",
        service: TelegramNotificationService.name,
        event: "TELEGRAM_ROUTE_NOT_FOUND",
        guestRequestId,
        hotelId: request.hotelId,
      });
      return;
    }

    const notification = await this.prisma.guestRequestNotification.upsert({
      where: {
        guestRequestId_provider: { guestRequestId, provider: NotificationProvider.TELEGRAM },
      },
      create: {
        guestRequestId,
        provider: NotificationProvider.TELEGRAM,
        routeId: route.id,
        telegramChatId: route.telegramChatId,
        status: GuestRequestNotificationStatus.PENDING,
      },
      update: { routeId: route.id, telegramChatId: route.telegramChatId },
    });

    if (
      notification.status === GuestRequestNotificationStatus.SENT &&
      notification.telegramMessageId
    )
      return;

    try {
      const response = await this.callTelegram<{ result?: { message_id?: number } }>(
        "sendMessage",
        {
          chat_id: route.telegramChatId,
          text: this.buildMessage(request),
          reply_markup: this.buildInlineKeyboard(request),
        },
      );
      const messageId = response.result?.message_id ? String(response.result.message_id) : null;
      await this.prisma.guestRequestNotification.update({
        where: { id: notification.id },
        data: {
          status: GuestRequestNotificationStatus.SENT,
          telegramMessageId: messageId,
          errorMessage: null,
          sentAt: new Date(),
        },
      });
      this.logger.info("Telegram notification sent", {
        module: "telegram",
        service: TelegramNotificationService.name,
        event: "TELEGRAM_NOTIFY_SUCCESS",
        guestRequestId,
        hotelId: request.hotelId,
        routeId: route.id,
        telegramMessageId: messageId,
      });
    } catch (error) {
      await this.prisma.guestRequestNotification.update({
        where: { id: notification.id },
        data: {
          status: GuestRequestNotificationStatus.FAILED,
          errorMessage: this.errorMessage(error),
        },
      });
      this.logger.error(error, {
        module: "telegram",
        service: TelegramNotificationService.name,
        event: "TELEGRAM_NOTIFY_FAILED",
        guestRequestId,
        hotelId: request.hotelId,
        routeId: route.id,
      });
    }
  }

  buildMessage(
    request: NonNullable<Awaited<ReturnType<TelegramNotificationService["loadRequest"]>>>,
  ): string {
    return [
      "🔔 Yêu cầu dịch vụ mới",
      "",
      `🏨 Khách sạn: ${request.hotel.name}`,
      `🚪 Phòng: ${request.room.roomNumber || request.room.code}`,
      `🧾 Nhóm dịch vụ: ${request.serviceItem?.category?.name ?? "-"}`,
      `🛎 Dịch vụ: ${request.serviceItem?.name ?? request.title ?? "-"}`,
      `🔢 Số lượng: ${request.quantity}`,
      `📝 Ghi chú: ${request.description ?? "-"}`,
      "",
      `Mã yêu cầu: ${request.id}`,
      `Trạng thái: ${STATUS_LABELS[request.status] ?? request.status}`,
      `Thời gian: ${request.createdAt.toISOString()}`,
    ].join("\n");
  }

  buildInlineKeyboard(request: {
    id: string;
    status: GuestRequestStatus;
  }): InlineKeyboard | undefined {
    if (request.status !== GuestRequestStatus.NEW) return undefined;
    return {
      inline_keyboard: [
        [{ text: "✅ Confirm", callback_data: `guest_request:confirm:${request.id}` }],
      ],
    };
  }

  async editServiceRequestMessage(
    notification: { telegramChatId: string; telegramMessageId: string | null },
    request: NonNullable<Awaited<ReturnType<TelegramNotificationService["loadRequest"]>>>,
  ): Promise<void> {
    if (!notification.telegramMessageId) return;
    await this.callTelegram("editMessageText", {
      chat_id: notification.telegramChatId,
      message_id: notification.telegramMessageId,
      text: this.buildConfirmedMessage(request),
      reply_markup: { inline_keyboard: [] },
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
    await this.callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  }

  async handleCallback(callbackQuery: TelegramCallbackQuery): Promise<void> {
    this.logger.info("Telegram callback received", {
      module: "telegram",
      service: TelegramNotificationService.name,
      event: "TELEGRAM_CALLBACK_RECEIVED",
    });
    const parts = String(callbackQuery.data ?? "").split(":");
    if (parts[0] !== "guest_request" || parts[1] !== "confirm" || !parts[2]) {
      await this.answerCallbackQuery(callbackQuery.id, "Invalid button.");
      return;
    }

    const requestId = parts[2];
    const staffName = this.telegramStaffName(callbackQuery);
    const confirmedAt = new Date();
    const result = await this.prisma.guestRequest.updateMany({
      where: { id: requestId, status: GuestRequestStatus.NEW },
      data: { status: GuestRequestStatus.CONFIRMED, confirmedBy: staffName, confirmedAt },
    });
    if (result.count === 0) {
      await this.answerCallbackQuery(callbackQuery.id, "This request has already been confirmed.");
      this.logger.warn("Telegram callback ignored", {
        module: "telegram",
        service: TelegramNotificationService.name,
        event: "TELEGRAM_CALLBACK_IGNORED",
        guestRequestId: requestId,
      });
      return;
    }

    await this.answerCallbackQuery(callbackQuery.id, "Request confirmed.");
    const [updated, notification] = await Promise.all([
      this.loadRequest(requestId),
      this.prisma.guestRequestNotification.findUnique({
        where: {
          guestRequestId_provider: {
            guestRequestId: requestId,
            provider: NotificationProvider.TELEGRAM,
          },
        },
      }),
    ]);

    if (updated) {
      this.guestRequestEventPublisher.publishGuestRequestUpdated({
        hotelId: updated.hotelId,
        sessionId: updated.sessionId,
        requestId,
        ownerRequest: this.toRealtimeOwnerRequest(updated),
        guestRequest: this.toRealtimeGuestRequest(updated),
      });
    }

    if (updated && notification) {
      this.editServiceRequestMessage(notification, updated).catch((error) =>
        this.logger.error(error, {
          module: "telegram",
          event: "TELEGRAM_NOTIFY_FAILED",
          guestRequestId: requestId,
          telegramMessageId: notification.telegramMessageId,
        }),
      );
    }
    this.logger.info("Telegram status updated", {
      module: "telegram",
      service: TelegramNotificationService.name,
      event: "TELEGRAM_CALLBACK_STATUS_UPDATED",
      guestRequestId: requestId,
    });
  }

  private buildConfirmedMessage(
    request: NonNullable<Awaited<ReturnType<TelegramNotificationService["loadRequest"]>>>,
  ): string {
    return [
      this.buildMessage(request),
      "",
      "🟢 Confirmed",
      `Staff: ${request.confirmedBy ?? "-"}`,
      `Confirmed at: ${request.confirmedAt?.toISOString() ?? "-"}`,
    ].join("\n");
  }

  private telegramStaffName(callbackQuery: TelegramCallbackQuery): string {
    const from = callbackQuery.from;
    if (!from) return "Telegram staff";
    const fullName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
    return fullName || (from.username ? `@${from.username}` : `Telegram ${from.id ?? "staff"}`);
  }

  private async loadRequest(guestRequestId: string) {
    return this.prisma.guestRequest.findUnique({
      where: { id: guestRequestId },
      include: { hotel: true, room: true, serviceItem: { include: { category: true } } },
    });
  }

  private async findRoute(hotelId: string, serviceCategoryId: string | null) {
    return (
      (serviceCategoryId
        ? await this.prisma.notificationRoute.findFirst({
            where: { hotelId, serviceCategoryId, isActive: true },
          })
        : null) ??
      (await this.prisma.notificationRoute.findFirst({
        where: { hotelId, serviceCategoryId: null, isActive: true },
      }))
    );
  }

  private toRealtimeOwnerRequest(
    request: NonNullable<Awaited<ReturnType<TelegramNotificationService["loadRequest"]>>>,
  ) {
    return {
      id: request.id,
      displayName: request.serviceItem?.name ?? request.title ?? "Request",
      status: request.status,
      quantity: request.quantity,
      description: request.description,
      createdAt: request.createdAt.toISOString(),
      roomNumber: request.room.roomNumber,
      categoryName: request.serviceItem?.category?.name ?? null,
    };
  }

  private toRealtimeGuestRequest(
    request: NonNullable<Awaited<ReturnType<TelegramNotificationService["loadRequest"]>>>,
  ) {
    return {
      id: request.id,
      service: { id: request.serviceItem?.id ?? null, name: request.serviceItem?.name ?? null },
      status: request.status,
      quantity: request.quantity,
      note: request.description,
      answer: null,
      createdAt: request.createdAt,
    };
  }

  private async callTelegram<T>(method: string, body: unknown): Promise<T> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => ({}))) as T & { description?: string };
      if (!response.ok) throw new Error(payload.description ?? `Telegram ${method} failed`);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 1000) : "Unknown Telegram error";
  }
}
