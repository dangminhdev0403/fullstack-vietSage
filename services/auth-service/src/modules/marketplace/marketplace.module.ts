import { Module, OnModuleInit } from "@nestjs/common";
import { MarketplaceAdminController } from "./api/marketplace-admin.controller";
import { MarketplaceAdminService } from "./application/marketplace-admin.service";
import { ServicePortalController } from "./api/service-portal.controller";
import { ServicePortalService } from "./application/service-portal.service";
import { GuestMarketplaceController } from "./api/guest-marketplace.controller";
import { GuestMarketplaceService } from "./application/guest-marketplace.service";
import { MarketplaceOrderService } from "./application/marketplace-order.service";
import { HotelMarketplaceController } from "./api/hotel-marketplace.controller";
import { PropertyModule } from "../property/property.module";
import { GuestOperationsModule } from "../guest-operations/guest-operations.module";
import { RequestRealtimeModule } from "../request-realtime/request-realtime.module";
import { ImportModule } from "../../common/import/import.module";
import { MarketplaceCategoryImportAdapter } from "./infrastructure/imports/marketplace-category-import.adapter";
import { MarketplaceCategorySheetService } from "./application/marketplace-category-sheet.service";
import { MarketplaceServiceItemImportAdapter } from "./infrastructure/imports/marketplace-service-item-import.adapter";
import { ServiceItemImportService } from "./application/service-item-import.service";
import { LocalMatePaymentsModule } from "../localmate-payments/localmate-payments.module";
import { LocalMatePaymentsService } from "../localmate-payments/localmate-payments-public";

import { GuestMarketplaceConversationController } from "./api/guest-marketplace-conversation.controller";
import { MarketplaceConversationService } from "./application/marketplace-conversation.service";
import { MarketplaceConversationRepository } from "./infrastructure/marketplace-conversation.repository";
import { PublicLocalMateController } from "./api/public-localmate.controller";
import { PublicLocalMateService } from "./application/public-localmate.service";
import { LocalMateModule } from "../localmate/localmate.module";
import { NotificationsModule } from "../notifications/notifications-public";

import { TelegramMarketplaceBridgeService } from "./application/telegram-marketplace-bridge.service";
import { TelegramMarketplaceRetryService } from "./application/telegram-marketplace-retry.service";
import { LocalmatePaidOrderNotificationService } from "./application/localmate-paid-order-notification.service";

@Module({
  imports: [
    PropertyModule,
    GuestOperationsModule,
    RequestRealtimeModule,
    ImportModule,
    LocalMatePaymentsModule,
    LocalMateModule,
    NotificationsModule,
  ],
  controllers: [
    MarketplaceAdminController,
    ServicePortalController,
    GuestMarketplaceController,
    HotelMarketplaceController,
    GuestMarketplaceConversationController,
    PublicLocalMateController,
  ],
  providers: [
    MarketplaceAdminService,
    ServicePortalService,
    GuestMarketplaceService,
    MarketplaceOrderService,
    MarketplaceConversationService,
    MarketplaceConversationRepository,
    PublicLocalMateService,
    MarketplaceCategoryImportAdapter,
    MarketplaceCategorySheetService,
    MarketplaceServiceItemImportAdapter,
    ServiceItemImportService,
    TelegramMarketplaceBridgeService,
    TelegramMarketplaceRetryService,
    LocalmatePaidOrderNotificationService,
  ],
  exports: [
    MarketplaceOrderService,
    MarketplaceConversationService,
    TelegramMarketplaceBridgeService,
  ],
})
export class MarketplaceModule implements OnModuleInit {
  constructor(
    private readonly bridgeService: TelegramMarketplaceBridgeService,
    private readonly orderService: MarketplaceOrderService,
    private readonly conversationService: MarketplaceConversationService,
    private readonly paymentsService: LocalMatePaymentsService,
    private readonly paidOrderNotifications: LocalmatePaidOrderNotificationService,
  ) {}

  onModuleInit() {
    this.orderService.setNotificationDispatcher({
      dispatchOrderNotification: async (order) => {
        await this.bridgeService.sendOrderNotificationToGuide(order);
      },
    });
    this.conversationService.setBridgeDispatcher({
      dispatchGuestMessage: (payload) => this.bridgeService.sendGuestMessageToGuide(payload),
    });
    this.paymentsService.setPaymentCompletedHandler(async () => {
      await this.paidOrderNotifications.processPendingNotifications();
    });
  }
}
