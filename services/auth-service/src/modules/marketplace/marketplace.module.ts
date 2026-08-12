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
import { ImportModule } from "../../common/import/import.module";
import { MarketplaceCategoryImportAdapter } from "./infrastructure/imports/marketplace-category-import.adapter";
import { MarketplaceCategorySheetService } from "./application/marketplace-category-sheet.service";
import { MarketplaceServiceItemImportAdapter } from "./infrastructure/imports/marketplace-service-item-import.adapter";
import { ServiceItemImportService } from "./application/service-item-import.service";

@Module({
  imports: [PropertyModule, GuestOperationsModule, ImportModule],
  controllers: [
    MarketplaceAdminController,
    ServicePortalController,
    GuestMarketplaceController,
    HotelMarketplaceController,
  ],
  providers: [
    MarketplaceAdminService,
    ServicePortalService,
    GuestMarketplaceService,
    MarketplaceOrderService,
    MarketplaceCategoryImportAdapter,
    MarketplaceCategorySheetService,
    MarketplaceServiceItemImportAdapter,
    ServiceItemImportService,
  ],
})
export class MarketplaceModule {}
