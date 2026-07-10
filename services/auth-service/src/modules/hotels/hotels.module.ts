import { Module } from "@nestjs/common";
import { ImportModule } from "../../common/import/import.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { HotelAccessService } from "./hotel-access.service";
import { HotelDashboardController } from "./hotel-dashboard.controller";
import { HotelDashboardService } from "./hotel-dashboard.service";
import { HotelNotificationRoutesController } from "./hotel-notification-routes.controller";
import { HotelNotificationRoutesService } from "./hotel-notification-routes.service";
import { HotelRequestsController } from "./hotel-requests.controller";
import { HotelRequestsService } from "./hotel-requests.service";
import { HotelRoomsController } from "./hotel-rooms.controller";
import { HotelRoomsService } from "./hotel-rooms.service";
import { HotelServicesController } from "./hotel-services.controller";
import { HotelServicesService } from "./hotel-services.service";
import { HotelsController } from "./hotels.controller";
import { HotelsRepository } from "./hotels.repository";
import { HotelsService } from "./hotels.service";
import { GoogleSheetsServiceCatalogSyncService } from "./imports/google-sheets-service-catalog-sync.service";
import { ServiceCatalogImportAdapter } from "./imports/service-catalog-import.adapter";
import { HotelCoreRepository } from "./repositories/hotel-core.repository";
import { HotelRequestsRepository } from "./repositories/hotel-requests.repository";
import { HotelRoomsRepository } from "./repositories/hotel-rooms.repository";
import { HotelServiceCatalogRepository } from "./repositories/hotel-service-catalog.repository";

@Module({
  imports: [PrismaModule, ImportModule],
  controllers: [
    HotelsController,
    HotelRoomsController,
    HotelServicesController,
    HotelRequestsController,
    HotelDashboardController,
    HotelNotificationRoutesController,
  ],
  providers: [
    HotelsService,
    HotelRoomsService,
    HotelServicesService,
    HotelRequestsService,
    HotelDashboardService,
    HotelNotificationRoutesService,
    HotelAccessService,
    HotelCoreRepository,
    HotelRoomsRepository,
    HotelServiceCatalogRepository,
    HotelRequestsRepository,
    HotelsRepository,
    GoogleSheetsServiceCatalogSyncService,
    ServiceCatalogImportAdapter,
  ],
  exports: [
    HotelsService,
    HotelRoomsService,
    HotelServicesService,
    HotelRequestsService,
    HotelAccessService,
    HotelCoreRepository,
    HotelRoomsRepository,
    HotelServiceCatalogRepository,
    HotelRequestsRepository,
    HotelsRepository,
  ],
})
export class HotelsModule {}
