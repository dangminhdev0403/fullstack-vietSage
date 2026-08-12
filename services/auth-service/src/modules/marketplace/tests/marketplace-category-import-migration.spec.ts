import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../../prisma/migrations/20260812000000_marketplace_category_import_i18n/migration.sql",
  ),
  "utf8",
);

describe("marketplace category import i18n migration", () => {
  it("adds importKey, creates translation table with cascade FK, backfills nameEn, and drops legacy nameEn and icon columns", () => {
    expect(sql).toContain('ALTER TABLE "MarketplaceCategory" ADD COLUMN "importKey" VARCHAR(80)');
    expect(sql).toContain('CREATE UNIQUE INDEX "MarketplaceCategory_importKey_key"');
    expect(sql).toContain('CREATE TABLE "MarketplaceCategoryTranslation"');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "MarketplaceCategoryTranslation_categoryId_locale_key"',
    );
    expect(sql).toContain(
      'FOREIGN KEY ("categoryId") REFERENCES "MarketplaceCategory"("id") ON DELETE CASCADE',
    );
    expect(sql).toContain('INSERT INTO "MarketplaceCategoryTranslation"');
    expect(sql).toContain('DROP COLUMN "nameEn"');
    expect(sql).toContain('DROP COLUMN "icon"');
  });
});
