import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PropertyModule } from "../property/property.module";
import { HousekeepingController } from "./api/housekeeping.controller";
import { HousekeepingService } from "./application/housekeeping.service";
import { HousekeepingRepository } from "./infrastructure/repositories/housekeeping.repository";

@Module({
  imports: [PrismaModule, PropertyModule],
  controllers: [HousekeepingController],
  providers: [HousekeepingService, HousekeepingRepository],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
