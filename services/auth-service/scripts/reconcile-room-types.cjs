const { randomUUID } = require("node:crypto");
const { Client } = require("pg");
require("dotenv").config({ quiet: true });

const apply = process.argv.includes("--apply");
if (process.argv.some((arg) => arg !== "--apply" && arg !== process.argv[0] && arg !== process.argv[1])) {
  throw new Error("Usage: node scripts/reconcile-room-types.cjs [--apply]");
}
const url = new URL(process.env.DATABASE_URL);
// ponytail: local-only writes; add an explicit staging target gate after its own approval.
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || decodeURIComponent(url.pathname) !== "/vietsage_auth") {
  throw new Error("Only the approved local vietsage_auth database is allowed");
}

const normalize = (value) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const key = (hotelId, name) => `${hotelId}\0${normalize(name)}`;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  options: apply ? undefined : "-c default_transaction_read_only=on",
  lock_timeout: 3000,
  statement_timeout: 15000,
});

async function main() {
  await client.connect();
  try {
    await client.query(apply ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN READ ONLY");
    const target = await client.query("SELECT current_database() AS name");
    if (target.rows[0].name !== "vietsage_auth") throw new Error("Unexpected database");

    const rooms = (await client.query(`SELECT "id", "hotelId", "type", "price"::text, "roomTypeId"
      FROM "Room" ORDER BY "id" ${apply ? "FOR UPDATE" : ""}`)).rows;
    const types = (await client.query(`SELECT "id", "hotelId", "name", "normalizedKey", "basePrice"::text
      FROM "RoomType" ORDER BY "id" ${apply ? "FOR UPDATE" : ""}`)).rows;
    const mappings = (await client.query(`SELECT "id", "hotelId", kind, "localId", "channexId"
      FROM "ChannexMapping" WHERE kind IN ('room_type', 'rate_plan') ORDER BY "id" ${apply ? "FOR UPDATE" : ""}`)).rows;
    const byKey = new Map(types.map((type) => [key(type.hotelId, type.name), type]));
    const byId = new Map(types.map((type) => [type.id, type]));
    const groups = new Map();
    for (const room of rooms) {
      if (!room.type || !room.type.trim() || !room.price || Number(room.price) <= 0) {
        throw new Error(`Unresolved room ${room.id}: missing type or positive price`);
      }
      const groupKey = key(room.hotelId, room.type);
      const group = groups.get(groupKey);
      if (group && (group.name !== room.type.trim() || group.price !== room.price)) {
        throw new Error(`Conflicting names or prices for ${room.type} in hotel ${room.hotelId}`);
      }
      if (!group) groups.set(groupKey, { hotelId: room.hotelId, name: room.type.trim(), price: room.price, rooms: [] });
      groups.get(groupKey).rooms.push(room);
    }

    for (const [groupKey, group] of groups) {
      let type = byKey.get(groupKey);
      if (type && (type.normalizedKey !== normalize(group.name) || type.name !== group.name || type.basePrice !== group.price)) {
        throw new Error(`Catalog conflict for ${group.name} in hotel ${group.hotelId}`);
      }
      if (!type) {
        type = { id: randomUUID(), hotelId: group.hotelId, name: group.name, normalizedKey: normalize(group.name), basePrice: group.price };
        byKey.set(groupKey, type);
        byId.set(type.id, type);
      }
      for (const room of group.rooms) {
        if (room.roomTypeId && room.roomTypeId !== type.id) throw new Error(`Conflicting type ID on room ${room.id}`);
      }
    }

    const changes = [];
    const occupied = new Set(mappings.map((mapping) => `${mapping.hotelId}\0${mapping.kind}\0${mapping.localId}`));
    for (const mapping of mappings) {
      const suffix = mapping.kind === "rate_plan" ? ":STANDARD" : "";
      if (suffix && !mapping.localId.endsWith(suffix)) throw new Error(`Unexpected rate-plan key ${mapping.localId}`);
      const source = suffix ? mapping.localId.slice(0, -suffix.length) : mapping.localId;
      const type = byId.get(source) ?? byKey.get(key(mapping.hotelId, source));
      if (!type || type.hotelId !== mapping.hotelId) throw new Error(`Unresolved mapping ${mapping.kind}: ${mapping.localId}`);
      const next = `${type.id}${suffix}`;
      if (next === mapping.localId) continue;
      const targetKey = `${mapping.hotelId}\0${mapping.kind}\0${next}`;
      if (occupied.has(targetKey)) throw new Error(`Mapping collision: ${mapping.kind} ${next}`);
      occupied.add(targetKey);
      changes.push({ id: mapping.id, kind: mapping.kind, from: mapping.localId, to: next, channexId: mapping.channexId });
    }

    const created = [...byKey.values()].filter((type) => !types.some((existing) => existing.id === type.id));
    const unlinked = rooms.filter((room) => !room.roomTypeId);
    if (apply) {
      for (const type of created) {
        await client.query(`INSERT INTO "RoomType" ("id", "hotelId", "name", "normalizedKey", "basePrice", "createdAt", "updatedAt")
          VALUES ($1,$2,$3,$4,$5,now(),now())`, [type.id, type.hotelId, type.name, type.normalizedKey, type.basePrice]);
      }
      for (const room of unlinked) {
        const type = byKey.get(key(room.hotelId, room.type));
        const result = await client.query(`UPDATE "Room" SET "roomTypeId"=$1, "updatedAt"=now()
          WHERE "id"=$2 AND "roomTypeId" IS NULL`, [type.id, room.id]);
        if (result.rowCount !== 1) throw new Error(`Room changed during reconciliation: ${room.id}`);
      }
      for (const change of changes) {
        const result = await client.query(`UPDATE "ChannexMapping" SET "localId"=$1, "updatedAt"=now()
          WHERE "id"=$2 AND "localId"=$3 AND "channexId"=$4`, [change.to, change.id, change.from, change.channexId]);
        if (result.rowCount !== 1) throw new Error(`Mapping changed during reconciliation: ${change.id}`);
      }
      const check = await client.query(`SELECT count(*)::int AS missing FROM "Room" WHERE "roomTypeId" IS NULL`);
      if (check.rows[0].missing !== 0) throw new Error("Unlinked rooms remain");
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
    console.log(JSON.stringify({
      mode: apply ? "applied" : "dry-run", groups: groups.size, catalogCreated: created.length,
      roomsLinked: unlinked.length, mappingsRekeyed: changes.length, remoteIdsPreserved: true,
    }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
