import { Module } from "@nestjs/common";
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

import { GuestMarketplaceConversationController } from "./api/guest-marketplace-conversation.controller";
import { MarketplaceConversationService } from "./application/marketplace-conversation.service";
import { MarketplaceConversationRepository } from "./infrastructure/marketplace-conversation.repository";

@Module({
  imports: [
    PropertyModule,
    GuestOperationsModule,
    RequestRealtimeModule,
    ImportModule,
    LocalMatePaymentsModule,
  ],
  controllers: [
    MarketplaceAdminController,
    ServicePortalController,
    GuestMarketplaceController,
    HotelMarketplaceController,
    GuestMarketplaceConversationController,
  ],
  providers: [
    MarketplaceAdminService,
    ServicePortalService,
    GuestMarketplaceService,
    MarketplaceOrderService,
    MarketplaceConversationService,
    MarketplaceConversationRepository,
    MarketplaceCategoryImportAdapter,
    MarketplaceCategorySheetService,
    MarketplaceServiceItemImportAdapter,
    ServiceItemImportService,
  ],
  exports: [MarketplaceOrderService, MarketplaceConversationService],
})
export class MarketplaceModule {}
