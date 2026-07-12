import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuestRequestEventsModule } from "../../shared/events";
import { NotificationsModule } from "../notifications/notifications.module";
import { GuestOsController } from "./api/guest-os.controller";
import { GuestOsService } from "./application/guest-os.service";
import { GuestSessionGuard } from "./infrastructure/guards/guest-session.guard";
import { GuestOsRepository } from "./infrastructure/repositories/guest-os.repository";

@Module({
  imports: [PrismaModule, NotificationsModule, GuestRequestEventsModule],
  controllers: [GuestOsController],
  providers: [GuestOsService, GuestOsRepository, GuestSessionGuard],
  exports: [GuestOsService, GuestSessionGuard],
})
export class GuestOperationsModule {}
