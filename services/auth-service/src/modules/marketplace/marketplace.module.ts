import { Module } from "@nestjs/common";
import { MarketplaceAdminController } from "./api/marketplace-admin.controller";
import { MarketplaceAdminService } from "./application/marketplace-admin.service";
import { ServicePortalController } from "./api/service-portal.controller";
import { ServicePortalService } from "./application/service-portal.service";

@Module({ controllers: [MarketplaceAdminController, ServicePortalController], providers: [MarketplaceAdminService, ServicePortalService] })
export class MarketplaceModule {}
