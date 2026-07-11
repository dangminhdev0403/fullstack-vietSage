import { MODULE_METADATA } from "@nestjs/common/constants";
import { HotelAccessService } from "../hotel-access.service";
import { HotelsModule } from "../hotels.module";
import { HotelCoreRepository } from "../repositories/hotel-core.repository";
import { HotelRequestsRepository } from "../repositories/hotel-requests.repository";
import { HotelRoomsRepository } from "../repositories/hotel-rooms.repository";
import { HotelServiceCatalogRepository } from "../repositories/hotel-service-catalog.repository";
import { HotelsRepository } from "../hotels.repository";

describe("HotelsModule public boundary", () => {
  it("exports only the public hotel access port and hides persistence repositories", () => {
    const moduleExports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, HotelsModule) ?? [];

    expect(moduleExports).toEqual([HotelAccessService]);
    expect(moduleExports).not.toContain(HotelCoreRepository);
    expect(moduleExports).not.toContain(HotelRoomsRepository);
    expect(moduleExports).not.toContain(HotelRequestsRepository);
    expect(moduleExports).not.toContain(HotelServiceCatalogRepository);
    expect(moduleExports).not.toContain(HotelsRepository);
  });
});
