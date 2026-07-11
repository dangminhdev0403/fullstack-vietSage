import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuestRequestEventsModule } from "../../shared/events";
import { TelegramModule } from "../telegram/telegram.module";
import { GuestOsController } from "./guest-os.controller";
import { GuestOsRepository } from "./guest-os.repository";
import { GuestOsService } from "./guest-os.service";
import { GuestSessionGuard } from "./guards/guest-session.guard";

@Module({
  imports: [PrismaModule, TelegramModule, GuestRequestEventsModule],
  controllers: [GuestOsController],
  providers: [GuestOsService, GuestOsRepository, GuestSessionGuard],
  exports: [GuestOsService, GuestOsRepository, GuestSessionGuard],
})
export class GuestOsModule {}
