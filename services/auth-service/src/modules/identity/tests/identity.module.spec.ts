import { existsSync } from "node:fs";
import { join } from "node:path";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { JwtModule } from "@nestjs/jwt";
import { AuthService } from "../application/authentication.service";
import { AuthorizationService } from "../application/authorization.service";
import { IdentityModule } from "../identity.module";
import { AuthRepository } from "../infrastructure/auth.repository";
import { HotelUsersRepository } from "../infrastructure/hotel-users.repository";
import { RbacRepository } from "../infrastructure/rbac.repository";

describe("IdentityModule architecture boundary", () => {
  it("exports public identity services while keeping repositories hidden", () => {
    const moduleExports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, IdentityModule) ?? [];

    expect(moduleExports).toEqual([AuthService, AuthorizationService, JwtModule]);
    expect(moduleExports).not.toContain(AuthRepository);
    expect(moduleExports).not.toContain(RbacRepository);
    expect(moduleExports).not.toContain(HotelUsersRepository);
  });

  it("replaces legacy auth/rbac/hotel-users module folders with the identity bounded context", () => {
    const modulesRoot = join(__dirname, "..", "..");

    expect(existsSync(join(modulesRoot, "auth"))).toBe(false);
    expect(existsSync(join(modulesRoot, "rbac"))).toBe(false);
    expect(existsSync(join(modulesRoot, "hotel-users"))).toBe(false);
  });
});
