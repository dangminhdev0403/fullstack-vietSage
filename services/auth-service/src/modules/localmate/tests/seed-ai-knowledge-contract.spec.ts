import fs from "node:fs";
import path from "node:path";

const seed = fs.readFileSync(
  path.resolve(__dirname, "../../../../scripts/seed-ai-knowledge.ts"),
  "utf8",
);

describe("AI knowledge seed safety contract", () => {
  it("does not grant hotel features, cross-link every hotel, or fabricate Telegram identities", () => {
    expect(seed).not.toContain(`'ENABLED'::"HotelFeatureStatus"`);
    expect(seed).not.toContain('INSERT INTO "HotelServiceLink"');
    expect(seed).not.toContain('INSERT INTO "LocalMateTelegramBinding"');
    expect(seed).not.toContain('SELECT id FROM "Tenant" WHERE "type" = \'SERVICE\' LIMIT 1');
  });

  it("owns only the deterministic LocalMate service tenant", () => {
    expect(seed).toContain("'LOCALMATE_SERVICE_TENANT'");
    expect(seed).toContain('ON CONFLICT ("code") DO UPDATE');
  });
});
