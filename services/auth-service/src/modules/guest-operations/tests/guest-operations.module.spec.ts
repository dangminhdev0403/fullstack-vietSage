import { existsSync } from "node:fs";
import { join } from "node:path";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { GuestOperationsModule } from "../guest-operations.module";
import { GuestOsService } from "../application/guest-os.service";
import { GuestSessionGuard } from "../infrastructure/guards/guest-session.guard";
import { GuestOsRepository } from "../infrastructure/repositories/guest-os.repository";

describe("GuestOperationsModule public boundary", () => {
  it("exports guest session/service ports without exposing persistence internals", () => {
    const moduleExports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, GuestOperationsModule) ?? [];

    expect(moduleExports).toEqual([GuestOsService, GuestSessionGuard]);
    expect(moduleExports).not.toContain(GuestOsRepository);
  });

  it("replaces the legacy guest-os module folder with the guest-operations bounded context", () => {
    const modulesRoot = join(__dirname, "..", "..");

    expect(existsSync(join(modulesRoot, "guest-os"))).toBe(false);
    expect(existsSync(join(modulesRoot, "guest-operations"))).toBe(true);
  });
});
