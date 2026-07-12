import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(__dirname, "..", "..", "..");

const contextFiles = [
  "modules/guest-operations/application/guest-os.service.ts",
  "modules/property/application/hotel-requests.service.ts",
  "modules/notifications/application/telegram-notification.service.ts",
];

describe("guest request event boundary", () => {
  it("keeps domain modules behind the guest request event publisher port", () => {
    for (const relativeFile of contextFiles) {
      const source = readFileSync(join(sourceRoot, relativeFile), "utf8");

      expect(source).not.toContain("RequestRealtimeEmitter");
      expect(source).toContain("GuestRequestEventPublisher");
    }
  });
});
