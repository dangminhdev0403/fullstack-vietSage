const { Client } = require("pg");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(
    `SELECT "tourCode", title, duration, highlights, content 
     FROM "LocalMateTourKnowledge" 
     WHERE "tourCode" = 'TOUR-QN-0001'`
  );
  console.log(res.rows[0]);
  await client.end();
}

run();
