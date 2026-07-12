import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuestOperationsModule } from "../guest-operations/guest-operations.module";
import { EmergencyController } from "./emergency.controller";
import { EmergencyRepository } from "./emergency.repository";
import { EmergencyService } from "./emergency.service";

@Module({
  imports: [PrismaModule, GuestOperationsModule],
  controllers: [EmergencyController],
  providers: [EmergencyService, EmergencyRepository],
  exports: [EmergencyService, EmergencyRepository],
})
export class EmergencyModule {}
