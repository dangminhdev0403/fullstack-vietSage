import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuestOsModule } from "../guest-os/guest-os.module";
import { EmergencyController } from "./emergency.controller";
import { EmergencyRepository } from "./emergency.repository";
import { EmergencyService } from "./emergency.service";

@Module({
  imports: [PrismaModule, GuestOsModule],
  controllers: [EmergencyController],
  providers: [EmergencyService, EmergencyRepository],
  exports: [EmergencyService, EmergencyRepository],
})
export class EmergencyModule {}
