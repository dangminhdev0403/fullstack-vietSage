import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuestRequestEventsModule } from "../../shared/events";
import { PropertyModule } from "../property/property.module";
import { HotelNotificationRoutesController } from "./api/hotel-notification-routes.controller";
import { TelegramWebhookController } from "./api/telegram-webhook.controller";
import { HotelNotificationRoutesService } from "./application/hotel-notification-routes.service";
import { TelegramNotificationService } from "./application/telegram-notification.service";

@Module({
  imports: [PrismaModule, GuestRequestEventsModule, PropertyModule],
  controllers: [TelegramWebhookController, HotelNotificationRoutesController],
  providers: [TelegramNotificationService, HotelNotificationRoutesService],
  exports: [TelegramNotificationService],
})
export class NotificationsModule {}
