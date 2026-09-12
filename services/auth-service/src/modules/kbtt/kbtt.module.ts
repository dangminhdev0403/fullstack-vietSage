import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PropertyModule } from "../property/property.module";
import { KbttController } from "./api/kbtt.controller";
import { KbttService } from "./application/kbtt.service";
import { KbttCredentialCipher } from "./infrastructure/kbtt-credential-cipher";
import { KbttProviderClient } from "./infrastructure/kbtt-provider.client";
import { KbttRepository } from "./infrastructure/kbtt.repository";

@Module({
  imports: [PrismaModule, PropertyModule],
  controllers: [KbttController],
  providers: [KbttService, KbttRepository, KbttCredentialCipher, KbttProviderClient],
})
export class KbttModule {}
