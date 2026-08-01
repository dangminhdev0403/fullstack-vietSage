import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PropertyModule } from "../property/property.module";
import { BiometricWorkstationsController } from "./api/biometric-workstations.controller";
import { BiometricWorkstationsService } from "./application/biometric-workstations.service";
import { BiometricWorkstationsRepository } from "./infrastructure/biometric-workstations.repository";

@Module({
  imports: [PrismaModule, PropertyModule],
  controllers: [BiometricWorkstationsController],
  providers: [BiometricWorkstationsService, BiometricWorkstationsRepository],
})
export class BiometricWorkstationsModule {}
