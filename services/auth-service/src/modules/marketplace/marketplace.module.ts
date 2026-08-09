import { Module } from "@nestjs/common";
import { MarketplaceAdminController } from "./api/marketplace-admin.controller";
import { MarketplaceAdminService } from "./application/marketplace-admin.service";

@Module({ controllers: [MarketplaceAdminController], providers: [MarketplaceAdminService] })
export class MarketplaceModule {}
