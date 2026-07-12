import { existsSync } from "node:fs";
import { join } from "node:path";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { HotelAccessService } from "../application/hotel-access.service";
import { PropertyModule } from "../property.module";
import { HotelCoreRepository } from "../infrastructure/repositories/hotel-core.repository";
import { HotelsRepository } from "../infrastructure/repositories/hotels.repository";

describe("PropertyModule public boundary", () => {
  it("exports only property access as the public cross-context port", () => {
    const moduleExports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, PropertyModule) ?? [];

    expect(moduleExports).toEqual([HotelAccessService]);
    expect(moduleExports).not.toContain(HotelsRepository);
    expect(moduleExports).not.toContain(HotelCoreRepository);
  });

  it("replaces the legacy hotels module folder with the property bounded context", () => {
    const modulesRoot = join(__dirname, "..", "..");

    expect(existsSync(join(modulesRoot, "hotels"))).toBe(false);
    expect(existsSync(join(modulesRoot, "property"))).toBe(true);
  });
});
