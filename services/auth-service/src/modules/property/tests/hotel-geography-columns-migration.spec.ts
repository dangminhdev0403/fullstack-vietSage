import fs from "node:fs";
import path from "node:path";

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../../prisma/migrations/20260928110000_repair_hotel_geography_columns/migration.sql",
  ),
  "utf8",
);

describe("Hotel geography columns migration", () => {
  it.each([
    ['"provinceCode"', "VARCHAR(40)"],
    ['"province"', "VARCHAR(80)"],
    ['"area"', "VARCHAR(120)"],
  ])("adds %s idempotently", (column, type) => {
    expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column} ${type}`);
  });
});
