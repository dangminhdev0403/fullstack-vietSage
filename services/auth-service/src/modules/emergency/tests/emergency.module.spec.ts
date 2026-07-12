import { MODULE_METADATA } from "@nestjs/common/constants";
import { EmergencyService } from "../application/emergency.service";
import { EmergencyModule } from "../emergency.module";
import { EmergencyRepository } from "../infrastructure/repositories/emergency.repository";

describe("EmergencyModule boundary", () => {
  it("exports only the application service and keeps persistence internals private", () => {
    const exportsMetadata = Reflect.getMetadata(MODULE_METADATA.EXPORTS, EmergencyModule) ?? [];

    expect(exportsMetadata).toContain(EmergencyService);
    expect(exportsMetadata).not.toContain(EmergencyRepository);
  });
});
