import { Module, OnModuleInit } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LocalMateAdminController } from "./api/localmate-admin.controller";
import { LocalMateAiController } from "./api/localmate-ai.controller";
import { LocalMateTelegramController } from "./api/localmate-telegram.controller";
import { LocalMateService } from "./application/localmate.service";
import { LocalMateTelegramPairingService } from "./application/localmate-telegram-pairing.service";
import { LocalMateRepository } from "./infrastructure/repositories/localmate.repository";
import { LocalmateKnowledgeKeyGuard } from "./infrastructure/guards/localmate-knowledge-key.guard";
import { TelegramWebhookController } from "../notifications/api/telegram-webhook.controller";

@Module({
  imports: [PrismaModule],
  controllers: [LocalMateAdminController, LocalMateAiController, LocalMateTelegramController],
  providers: [
    LocalMateRepository,
    LocalMateService,
    LocalMateTelegramPairingService,
    LocalmateKnowledgeKeyGuard,
  ],
  exports: [LocalMateService, LocalMateTelegramPairingService, LocalmateKnowledgeKeyGuard],
})
export class LocalMateModule implements OnModuleInit {
  constructor(private readonly pairingService: LocalMateTelegramPairingService) {}

  onModuleInit() {
    TelegramWebhookController.setPairingDelegate(this.pairingService);
  }
}

