import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { TelegramNotificationService } from "./telegram-notification.service";
import { TelegramWebhookController } from "./telegram-webhook.controller";

@Module({
  imports: [PrismaModule],
  controllers: [TelegramWebhookController],
  providers: [TelegramNotificationService],
  exports: [TelegramNotificationService],
})
export class TelegramModule {}
