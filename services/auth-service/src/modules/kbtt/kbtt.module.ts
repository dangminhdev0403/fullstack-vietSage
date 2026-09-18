import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PropertyModule } from "../property/property.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { KbttController } from "./api/kbtt.controller";
import { KbttAutoSubmitSchedulerService } from "./application/kbtt-auto-submit-scheduler.service";
import { KbttService } from "./application/kbtt.service";
import { KbttCredentialCipher } from "./infrastructure/kbtt-credential-cipher";
import { KbttProviderClient } from "./infrastructure/kbtt-provider.client";
import { KbttRepository } from "./infrastructure/kbtt.repository";

@Module({
  imports: [PrismaModule, PropertyModule, NotificationsModule],
  controllers: [KbttController],
  providers: [
    KbttService,
    KbttRepository,
    KbttCredentialCipher,
    KbttProviderClient,
    KbttAutoSubmitSchedulerService,
  ],
})
export class KbttModule {}
