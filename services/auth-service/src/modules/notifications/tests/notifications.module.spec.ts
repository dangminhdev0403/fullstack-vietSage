import { existsSync } from "node:fs";
import { join } from "node:path";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { NotificationsModule } from "../notifications.module";
import { TelegramNotificationService } from "../application/telegram-notification.service";
import { HotelNotificationRoutesService } from "../application/hotel-notification-routes.service";

describe("NotificationsModule public boundary", () => {
  it("exports provider delivery service without exposing route configuration internals", () => {
    const moduleExports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, NotificationsModule) ?? [];

    expect(moduleExports).toEqual([TelegramNotificationService]);
    expect(moduleExports).not.toContain(HotelNotificationRoutesService);
  });

  it("replaces the legacy telegram module folder with the notifications bounded context", () => {
    const modulesRoot = join(__dirname, "..", "..");

    expect(existsSync(join(modulesRoot, "telegram"))).toBe(false);
    expect(existsSync(join(modulesRoot, "notifications"))).toBe(true);
  });
});
