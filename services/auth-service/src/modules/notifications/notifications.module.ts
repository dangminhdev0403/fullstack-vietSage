import { Module, OnModuleInit } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuestRequestEventsModule } from "../../shared/events";
import { PropertyModule } from "../property/property.module";
import { HotelNotificationRoutesController } from "./api/hotel-notification-routes.controller";
import { TelegramWebhookController } from "./api/telegram-webhook.controller";
import { HotelNotificationRoutesService } from "./application/hotel-notification-routes.service";
import { TelegramNotificationService } from "./application/telegram-notification.service";
import { TelegramMarketplaceBridgeService } from "./application/telegram-marketplace-bridge.service";
import { TelegramMarketplaceRetryService } from "./application/telegram-marketplace-retry.service";
import { LocalmatePaidOrderNotificationService } from "./application/localmate-paid-order-notification.service";
import { TelegramPollingService } from "./application/telegram-polling.service";
import { MarketplaceOrderService } from "../marketplace/application/marketplace-order.service";
import { MarketplaceConversationService } from "../marketplace/application/marketplace-conversation.service";
import { LocalMatePaymentsModule } from "../localmate-payments/localmate-payments.module";

import { LocalMatePaymentsService } from "../localmate-payments/application/localmate-payments.service";

@Module({
  imports: [PrismaModule, GuestRequestEventsModule, PropertyModule, LocalMatePaymentsModule],
  controllers: [TelegramWebhookController, HotelNotificationRoutesController],
  providers: [
    TelegramNotificationService,
    HotelNotificationRoutesService,
    TelegramMarketplaceBridgeService,
    TelegramMarketplaceRetryService,
    LocalmatePaidOrderNotificationService,
    TelegramPollingService,
  ],
  exports: [TelegramNotificationService, TelegramMarketplaceBridgeService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(private readonly bridgeService: TelegramMarketplaceBridgeService) {}

  onModuleInit() {
    MarketplaceOrderService.setNotificationDispatcher({
      dispatchOrderNotification: async (order) => {
        await this.bridgeService.sendOrderNotificationToGuide(order);
      },
    });

    MarketplaceConversationService.setBridgeDispatcher({
      dispatchGuestMessage: (payload) => this.bridgeService.sendGuestMessageToGuide(payload),
    });

    LocalMatePaymentsService.setDispatcher({
      onPaymentCompleted: async () => {
        LocalmatePaidOrderNotificationService.triggerProcessingSafely();
      },
    });
  }
}
