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

@Module({ imports: [PropertyModule, GuestOperationsModule], controllers: [MarketplaceAdminController, ServicePortalController, GuestMarketplaceController, HotelMarketplaceController], providers: [MarketplaceAdminService, ServicePortalService, GuestMarketplaceService, MarketplaceOrderService] })
export class MarketplaceModule {}
