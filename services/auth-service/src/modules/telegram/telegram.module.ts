import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuestRequestEventsModule } from "../../shared/events";
import { TelegramNotificationService } from "./telegram-notification.service";
import { TelegramWebhookController } from "./telegram-webhook.controller";

@Module({
  imports: [PrismaModule, GuestRequestEventsModule],
  controllers: [TelegramWebhookController],
  providers: [TelegramNotificationService],
  exports: [TelegramNotificationService],
})
export class TelegramModule {}
