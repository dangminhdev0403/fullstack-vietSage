import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../../prisma/migrations/20260928094000_default_hotel_features_disabled/migration.sql",
  ),
  "utf8",
);

describe("default hotel features disabled migration", () => {
  it("disables both canonical opt-in features without enabling any feature", () => {
    expect(migration).toContain(`"status" = 'DISABLED'::"HotelFeatureStatus"`);
    expect(migration).toContain(`'guest.ai_floating_chat'`);
    expect(migration).toContain(`'frontdesk.hn2n_cccd_scanner'`);
    expect(migration).not.toContain(`'ENABLED'::"HotelFeatureStatus"`);
  });
});
