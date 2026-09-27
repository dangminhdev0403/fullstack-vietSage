import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as path from "node:path";
import { inferProvinceAndScope } from "../src/modules/localmate/domain/constants/geography.constant";

type TourKnowledgeRow = {
  id: string;
  tourCode: string;
  title: string;
  content: string;
};

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export async function backfillTourKnowledge() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const res = await pool.query<TourKnowledgeRow>(
      `SELECT "id", "tourCode", "title", "content", "provinceCode", "province", "tourScope"
       FROM "LocalMateTourKnowledge"
       WHERE "provinceCode" IS NULL
          OR BTRIM("provinceCode") = ''
          OR "provinceCode" = 'UNCLASSIFIED'
       ORDER BY "tourCode" ASC`,
    );

    console.log(`Found ${res.rows.length} tour records to backfill.`);

    let updatedCount = 0;
    for (const tour of res.rows) {
      const inferred = inferProvinceAndScope(tour.title, tour.content);
      if (inferred.provinceCode === "UNCLASSIFIED") continue;

      await pool.query(
        `UPDATE "LocalMateTourKnowledge"
         SET "provinceCode" = $1,
             "province" = $2,
             "tourScope" = $3::"TourScope",
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $4`,
        [inferred.provinceCode, inferred.province, inferred.tourScope, tour.id],
      );

      updatedCount++;
      console.log(
        `Updated [${tour.tourCode}] -> provinceCode=${inferred.provinceCode}, province=${inferred.province}, tourScope=${inferred.tourScope}`,
      );
    }

    console.log(`Successfully backfilled ${updatedCount} tour knowledge records.`);
    return { total: res.rows.length, updated: updatedCount };
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  backfillTourKnowledge()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Backfill failed:", err);
      process.exit(1);
    });
}
