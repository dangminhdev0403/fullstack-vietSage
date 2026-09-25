import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LocalMateAdminController } from "./api/localmate-admin.controller";
import { LocalMateAiController } from "./api/localmate-ai.controller";
import { LocalMateService } from "./application/localmate.service";
import { LocalMateRepository } from "./infrastructure/repositories/localmate.repository";
import { LocalmateKnowledgeKeyGuard } from "./infrastructure/guards/localmate-knowledge-key.guard";

@Module({
  imports: [PrismaModule],
  controllers: [LocalMateAdminController, LocalMateAiController],
  providers: [LocalMateRepository, LocalMateService, LocalmateKnowledgeKeyGuard],
  exports: [LocalMateService, LocalmateKnowledgeKeyGuard],
})
export class LocalMateModule {}
