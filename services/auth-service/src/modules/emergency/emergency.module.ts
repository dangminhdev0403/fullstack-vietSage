import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuestOperationsModule } from "../guest-operations/guest-operations.module";
import { EmergencyController } from "./api/emergency.controller";
import { EmergencyRepository } from "./infrastructure/repositories/emergency.repository";
import { EmergencyService } from "./application/emergency.service";

@Module({
  imports: [PrismaModule, GuestOperationsModule],
  controllers: [EmergencyController],
  providers: [EmergencyService, EmergencyRepository],
  exports: [EmergencyService],
})
export class EmergencyModule {}
