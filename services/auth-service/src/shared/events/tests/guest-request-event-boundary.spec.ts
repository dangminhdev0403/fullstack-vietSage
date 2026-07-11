import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(__dirname, "..", "..", "..");

const contextFiles = [
  "modules/guest-os/guest-os.service.ts",
  "modules/hotels/hotel-requests.service.ts",
  "modules/telegram/telegram-notification.service.ts",
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
