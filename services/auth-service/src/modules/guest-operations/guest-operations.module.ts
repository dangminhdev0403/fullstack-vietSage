import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuestRequestEventsModule } from "../../shared/events";
import { NotificationsModule } from "../notifications/notifications.module";
import { PropertyModule } from "../property/property.module";
import { GuestOsController } from "./api/guest-os.controller";
import { HotelRequestsController } from "./api/hotel-requests.controller";
import { GuestEmergencyContextService } from "./application/guest-emergency-context.service";
import { GuestOsService } from "./application/guest-os.service";
import { HotelRequestsService } from "./application/hotel-requests.service";
import { GuestSessionGuard } from "./infrastructure/guards/guest-session.guard";
import { GuestOsRepository } from "./infrastructure/repositories/guest-os.repository";
import { HotelRequestsRepository } from "./infrastructure/repositories/hotel-requests.repository";

@Module({
  imports: [PrismaModule, PropertyModule, NotificationsModule, GuestRequestEventsModule],
  controllers: [GuestOsController, HotelRequestsController],
  providers: [
    GuestOsService,
    GuestEmergencyContextService,
    HotelRequestsService,
    GuestOsRepository,
    HotelRequestsRepository,
    GuestSessionGuard,
  ],
  exports: [GuestOsService, GuestSessionGuard, GuestEmergencyContextService],
})
export class GuestOperationsModule {}
