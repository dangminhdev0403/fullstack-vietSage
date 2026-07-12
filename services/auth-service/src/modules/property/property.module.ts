import { Module } from "@nestjs/common";
import { ImportModule } from "../../common/import/import.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { HotelAccessService } from "./application/hotel-access.service";
import { HotelDashboardController } from "./api/hotel-dashboard.controller";
import { HotelDashboardService } from "./application/hotel-dashboard.service";
import { HotelRoomsController } from "./api/hotel-rooms.controller";
import { HotelRoomsService } from "./application/hotel-rooms.service";
import { HotelServicesController } from "./api/hotel-services.controller";
import { HotelServicesService } from "./application/hotel-services.service";
import { HotelsController } from "./api/hotels.controller";
import { HotelsRepository } from "./infrastructure/repositories/hotels.repository";
import { HotelsService } from "./application/hotels.service";
import { GoogleSheetsServiceCatalogSyncService } from "./infrastructure/imports/google-sheets-service-catalog-sync.service";
import { ServiceCatalogImportAdapter } from "./infrastructure/imports/service-catalog-import.adapter";
import { HotelCoreRepository } from "./infrastructure/repositories/hotel-core.repository";
import { HotelRoomsRepository } from "./infrastructure/repositories/hotel-rooms.repository";
import { HotelServiceCatalogRepository } from "./infrastructure/repositories/hotel-service-catalog.repository";

@Module({
  imports: [PrismaModule, ImportModule],
  controllers: [
    HotelsController,
    HotelRoomsController,
    HotelServicesController,
    HotelDashboardController,
  ],
  providers: [
    HotelsService,
    HotelRoomsService,
    HotelServicesService,
    HotelDashboardService,
    HotelAccessService,
    HotelCoreRepository,
    HotelRoomsRepository,
    HotelServiceCatalogRepository,
    HotelsRepository,
    GoogleSheetsServiceCatalogSyncService,
    ServiceCatalogImportAdapter,
  ],
  exports: [HotelAccessService],
})
export class PropertyModule {}
