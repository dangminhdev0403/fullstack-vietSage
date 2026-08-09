import { Module } from "@nestjs/common";
import { MarketplaceAdminController } from "./api/marketplace-admin.controller";
import { MarketplaceAdminService } from "./application/marketplace-admin.service";
import { ServicePortalController } from "./api/service-portal.controller";
import { ServicePortalService } from "./application/service-portal.service";
import { GuestMarketplaceController } from "./api/guest-marketplace.controller";
import { GuestMarketplaceService } from "./application/guest-marketplace.service";
import { MarketplaceOrderService } from "./application/marketplace-order.service";

@Module({ controllers: [MarketplaceAdminController, ServicePortalController, GuestMarketplaceController], providers: [MarketplaceAdminService, ServicePortalService, GuestMarketplaceService, MarketplaceOrderService] })
export class MarketplaceModule {}
