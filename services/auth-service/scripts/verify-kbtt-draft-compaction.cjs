#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
const { parse } = require("dotenv");

const migrationPath = path.resolve(__dirname, "../prisma/migrations/20261116010000_compact_kbtt_draft_profiles/migration.sql");

function buildFixtures() {
  const stays = [], occupants = [], rooms = [], declarations = [], cases = [];
  function add(id, options = {}) {
    const kind = options.kind || "VIETNAMESE";
    const room = { id: "room-" + id, hotelId: "fixture-hotel", roomNumber: id };
    const stay = { id: "stay-" + id, hotelId: room.hotelId, roomId: room.id,
      checkedInAt: "2026-11-15 02:00:00", plannedCheckInAt: "2026-11-15 07:00:00", plannedCheckOutAt: "2026-11-17 05:00:00" };
    const occupant = { id: "occ-" + id, stayId: stay.id, hotelId: stay.hotelId,
      fullName: "Nguyễn Minh An", gender: "NAM", identityNumber: "001090123456",
      dateOfBirth: "1990-02-28", nationality: kind === "FOREIGN" ? "GBR_PROVIDER" : "VNM", isPrimary: options.isPrimary !== false,
      ...options.occupant };
    const draft = options.rawPayload !== undefined ? options.rawPayload : {
      hoTen: occupant.fullName, gioiTinh: "M", ngayThangNamSinhStr: occupant.dateOfBirth,
      soPhong: room.roomNumber, ngayDenCsltStr: "2026-11-15 09:00:00", ngayDiDuKienStr: "2026-11-17 12:00:00",
      ...(kind === "FOREIGN" ? { soHoChieu: occupant.identityNumber, quocTich: "GBR_PROVIDER", loaiNgayThangNamSinh: "D", thoiHanTamTruStr: "2026-12-01 12:00:00" }
        : { soGiayTo: occupant.identityNumber, loaiGiayTo: 1, lyDoCuTru: 1, soDienThoai: "0901234567", diaChi: "Địa chỉ khai báo", noiCuTru: 1 }),
      ...options.draft };
    const declaration = { id, hotelId: stay.hotelId, stayId: stay.id, occupantId: occupant.id,
      declarationKind: kind, revision: 1, version: 2, status: options.status || "DRAFT", draftPayloadJson: draft,
      submittedPayloadJson: options.snapshot || null, submittedPayloadFingerprint: options.snapshot ? "unchanged-snapshot-fingerprint" : null,
      createdAt: "2026-11-15 03:00:00", updatedAt: "2026-11-15 03:00:00" };
    stays.push(stay); occupants.push(occupant); rooms.push(room); declarations.push(declaration);
    cases.push({ id, kind, draft, occupant: { ...occupant, stay: { ...stay,
      checkedInAt: new Date(stay.checkedInAt.replace(" ", "T") + "Z"), plannedCheckInAt: new Date(stay.plannedCheckInAt.replace(" ", "T") + "Z"),
      plannedCheckOutAt: new Date(stay.plannedCheckOutAt.replace(" ", "T") + "Z"), room } }, excluded: options.excluded || false });
    return declaration;
  }
  add("vn");
  add("foreign-year", { kind: "FOREIGN", occupant: { dateOfBirth: "1985", identityNumber: "P1234567", gender: "FEMALE" },
    draft: { gioiTinh: "F", ngayThangNamSinhStr: "1985-01-01", loaiNgayThangNamSinh: "Y" } });
  add("foreign-day", { kind: "FOREIGN", occupant: { dateOfBirth: "2000-02-29", identityNumber: "AB123456" } });
  add("legacy-overrides", { draft: { hoTen: "Tên khai báo khác", gioiTinh: "F", soGiayTo: "001090999999", ngayThangNamSinhStr: "1991-03-04", soDienThoai: null } });
  add("co-guest", { isPrimary: false, occupant: { fullName: "Lê Minh Hà", gender: "NỮ", identityNumber: "001099876543" }, draft: { gioiTinh: "F" } });
  add("null-values", { draft: { hoTen: null, gioiTinh: null, ngayThangNamSinhStr: null, soGiayTo: null, ghiChu: null } });
  for (const dateOfBirth of ["2026-02-31", "2026-13-01", "2026-00-00", "0000-01-01", "0001-01-01", "2026-01-99", "not-a-date"]) {
    add("invalid-date-" + dateOfBirth, { occupant: { dateOfBirth }, draft: { ngayThangNamSinhStr: "1990-01-01" } });
  }
  add("legacy-date-format", { occupant: { dateOfBirth: "28/02/1990" }, draft: { ngayThangNamSinhStr: "1990-02-28" } });
  add("overlength-legacy-name", { draft: { hoTen: "An".repeat(70) } });
  add("unknown-object-values", { rawPayload: { hoTen: 42, gioiTinh: ["M"], ngayThangNamSinhStr: { year: 1990 }, extra: false } });
  for (const status of ["SENDING", "SUBMITTED", "UNKNOWN", "CANCELLED"]) add("frozen-" + status.toLowerCase(), { status, excluded: true,
    snapshot: [{ hoTen: "Bản đã gửi không được thay đổi" }] });
  add("json-array", { rawPayload: [{ hoTen: "Không phải object" }], excluded: true });
  add("json-string", { rawPayload: "Không phải object", excluded: true });
  add("json-null", { rawPayload: null, excluded: true });
  add("json-number", { rawPayload: 42, excluded: true });
  add("cross-hotel", { excluded: true });
  rooms[rooms.length - 1].hotelId = "different-hotel";
  const old = add("old-revision", { excluded: true });
  declarations.push({ ...old, id: "new-revision", revision: 2, draftPayloadJson: { ghiChu: "Bản nháp mới hơn" } });
  return { stays, occupants, rooms, declarations, cases };
}

function migrationParts(migration) {
  const start = migration.indexOf("-- COMPACT_CTE"), end = migration.indexOf("-- APPLY_COMPACTION");
  if (start < 0 || end < start) throw new Error("Migration SELECT boundary is missing");
  return { ctes: migration.slice(start + "-- COMPACT_CTE".length, end),
    mutation: migration.slice(start + "-- COMPACT_CTE".length).replace(/COMMIT;\s*$/i, "") };
}

function fixtureQuery(migration) {
  const { ctes } = migrationParts(migration);
  const sources = [
    '"GuestStay" AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS s(id text, "hotelId" text, "roomId" text, "checkedInAt" timestamp, "plannedCheckInAt" timestamp, "plannedCheckOutAt" timestamp)),',
    '"GuestStayOccupant" AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS o(id text, "stayId" text, "hotelId" text, "fullName" text, gender text, "identityNumber" text, "dateOfBirth" text, nationality text, "isPrimary" boolean)),',
    '"Room" AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS r(id text, "hotelId" text, "roomNumber" text)),',
    '"KbttGuestDeclaration" AS (SELECT * FROM jsonb_to_recordset($4::jsonb) AS d(id text, "hotelId" text, "stayId" text, "occupantId" text, "declarationKind" text, revision int, version int, status text, "draftPayloadJson" jsonb, "submittedPayloadJson" jsonb, "submittedPayloadFingerprint" text, "createdAt" timestamp, "updatedAt" timestamp)),',
  ].join("\n");
  return ctes.replace(/\bWITH\s+/i, "WITH " + sources) + " SELECT id, original_payload, new_payload FROM compacted";
}

async function selectFixtures(client, migration, fixtures) {
  return (await client.query(fixtureQuery(migration), [fixtures.stays, fixtures.occupants, fixtures.rooms, fixtures.declarations].map(value => JSON.stringify(value)))).rows;
}

function createReadOnlyClient() {
  const envPath = path.resolve(__dirname, "../.env");
  const local = fs.existsSync(envPath) ? parse(fs.readFileSync(envPath)) : {};
  const connectionString = process.env.KBTT_MIGRATION_TEST_DATABASE_URL || process.env.DATABASE_URL || local.DATABASE_URL;
  if (!connectionString) throw new Error("A database URL is required for read-only migration verification");
  return new Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 10000, application_name: "kbtt-compaction-readonly-check" });
}

module.exports = { migrationPath, buildFixtures, migrationParts, fixtureQuery, selectFixtures, createReadOnlyClient };

if (require.main === module) {
  (async () => {
    const migration = fs.readFileSync(migrationPath, "utf8");
    const client = createReadOnlyClient();
    try {
      await client.connect();
      await client.query("BEGIN READ ONLY");
      await client.query("EXPLAIN (COSTS OFF) " + migrationParts(migration).mutation);
      const rows = await selectFixtures(client, migration, buildFixtures());
      const bytes = value => Buffer.byteLength(JSON.stringify(value), "utf8");
      const beforeJsonBytes = rows.reduce((total, row) => total + bytes(row.original_payload), 0);
      const afterJsonBytes = rows.reduce((total, row) => total + bytes(row.new_payload), 0);
      console.log(JSON.stringify({ mode: "READ ONLY", migrationPlanned: true, syntheticRowsChecked: rows.length,
        beforeJsonBytes, afterJsonBytes, savedJsonBytes: beforeJsonBytes - afterJsonBytes }));
      await client.query("ROLLBACK");
    } finally { await client.end(); }
  })().catch(error => { console.error("Read-only migration verification failed:", error.code || error.message); process.exitCode = 1; });
}
