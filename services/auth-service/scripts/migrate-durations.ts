import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "node:path";
import { normalizeTourDuration } from "../src/modules/localmate/domain/constants/geography.constant";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function migrateTourDurations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const res = await pool.query(
      `SELECT "id", "tourCode", "duration" FROM "LocalMateTourKnowledge"`
    );

    console.log(`Found ${res.rows.length} tour records to examine.`);

    let updatedCount = 0;
    for (const row of res.rows) {
      const canonical = normalizeTourDuration(row.duration);
      if (canonical !== row.duration) {
        await pool.query(
          `UPDATE "LocalMateTourKnowledge"
           SET "duration" = $1,
               "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = $2`,
          [canonical, row.id]
        );
        console.log(`[${row.tourCode}] "${row.duration}" -> "${canonical}"`);
        updatedCount++;
      } else {
        console.log(`[${row.tourCode}] Already canonical: "${row.duration}"`);
      }
    }

    console.log(`Migration complete. Updated ${updatedCount} records.`);
    return { total: res.rows.length, updated: updatedCount };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateTourDurations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
