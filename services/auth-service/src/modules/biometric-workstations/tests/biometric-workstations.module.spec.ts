import { MODULE_METADATA } from "@nestjs/common/constants";
import { BiometricWorkstationsController } from "../api/biometric-workstations.controller";
import { BiometricWorkstationsModule } from "../biometric-workstations.module";
import { BiometricWorkstationsService } from "../application/biometric-workstations.service";
import { BiometricWorkstationsRepository } from "../infrastructure/biometric-workstations.repository";

describe("BiometricWorkstationsModule", () => {
  it("registers persistence service, repository, and controller", () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, BiometricWorkstationsModule)).toContain(
      BiometricWorkstationsController,
    );
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BiometricWorkstationsModule)).toEqual(
      expect.arrayContaining([BiometricWorkstationsService, BiometricWorkstationsRepository]),
    );
  });
});
