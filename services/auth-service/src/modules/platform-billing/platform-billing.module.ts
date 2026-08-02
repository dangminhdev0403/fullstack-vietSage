import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PlatformBillingService } from "./application/platform-billing.service";
import { PlatformBillingController } from "./api/platform-billing.controller";

@Module({
  imports: [PrismaModule],
  controllers: [PlatformBillingController],
  providers: [PlatformBillingService],
  exports: [PlatformBillingService],
})
export class PlatformBillingModule {}
