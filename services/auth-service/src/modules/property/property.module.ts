import { Module } from "@nestjs/common";
import { ImportModule } from "../../common/import/import.module";
import { IdentityModule } from "../identity/identity.module";
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
import { ReservationsController } from "./api/reservations.controller";
import { ReservationsService } from "./application/reservations.service";
import { ReservationsRepository } from "./infrastructure/repositories/reservations.repository";
import { HotelStaffAssignmentsController } from "./api/hotel-staff-assignments.controller";
import { HotelStaffAssignmentsService } from "./application/hotel-staff-assignments.service";
import { HotelStaffAssignmentsRepository } from "./infrastructure/repositories/hotel-staff-assignments.repository";

@Module({
  imports: [PrismaModule, ImportModule, IdentityModule],
  controllers: [
    HotelsController,
    HotelRoomsController,
    HotelServicesController,
    HotelDashboardController,
    ReservationsController,
    HotelStaffAssignmentsController,
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
    ReservationsService,
    ReservationsRepository,
    HotelStaffAssignmentsService,
    HotelStaffAssignmentsRepository,
  ],
  exports: [HotelAccessService],
})
export class PropertyModule {}
