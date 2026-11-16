import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { compactKbttDraft, composeKbttDraft } from "../domain/kbtt-draft-profile";
import { kbttForeignReadySchema, kbttVietnameseReadySchema } from "../domain/schemas/kbtt.schema";

const { migrationPath, buildFixtures, migrationParts, selectFixtures, createReadOnlyClient } = require(
  path.resolve(__dirname, "../../../../scripts/verify-kbtt-draft-compaction.cjs"),
);
const migration = fs.readFileSync(migrationPath, "utf8");
const fixtures = buildFixtures();
const client = createReadOnlyClient();
let rows: Array<{ id: string; original_payload: Record<string, unknown>; new_payload: Record<string, unknown> }>;
let compacted: Map<string, Record<string, unknown>>;

describe("BCA draft compaction migration: read-only PostgreSQL payload parity", () => {
  beforeAll(async () => {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    rows = await selectFixtures(client, migration, fixtures);
    compacted = new Map(rows.map(row => [row.id, row.new_payload]));
  }, 15000);

  afterAll(async () => {
    try { await client.query("ROLLBACK"); } finally { await client.end(); }
  });

  it("plans the exact migration UPDATE without applying it", async () => {
    expect((await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only).toBe("on");
    const result = await client.query("EXPLAIN (COSTS OFF) " + migrationParts(migration).mutation);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it.each(fixtures.cases.filter((fixture: any) => !fixture.excluded))(
    "preserves hydrated draft fields for $id",
    (fixture: any) => {
      expect(compacted.has(fixture.id)).toBe(true);
      const after = composeKbttDraft(fixture.kind, compacted.get(fixture.id)!, fixture.occupant);
      const before = composeKbttDraft(fixture.kind, fixture.draft, fixture.occupant);
      expect(after).toEqual(before);
      expect(composeKbttDraft(fixture.kind, compactKbttDraft(fixture.kind, fixture.draft, fixture.occupant), fixture.occupant))
        .toEqual(before);
    },
  );

  it.each(["vn", "foreign-year", "foreign-day", "co-guest", "legacy-overrides"])(
    "keeps the validated outbound payload and fingerprint identical for %s",
    id => {
      const fixture = fixtures.cases.find((candidate: any) => candidate.id === id);
      const schema = fixture.kind === "FOREIGN" ? kbttForeignReadySchema : kbttVietnameseReadySchema;
      const before = schema.parse(composeKbttDraft(fixture.kind, fixture.draft, fixture.occupant));
      const after = schema.parse(composeKbttDraft(fixture.kind, compacted.get(id)!, fixture.occupant));
      const fingerprint = (payload: unknown) => createHash("sha256").update(JSON.stringify([payload])).digest("hex");
      expect(after).toEqual(before);
      expect(fingerprint(after)).toBe(fingerprint(before));
    },
  );

  it("removes common copies while retaining BCA-only values and precision", () => {
    expect(compacted.get("vn")).toEqual({ loaiGiayTo: 1, lyDoCuTru: 1, soDienThoai: "0901234567", diaChi: "Địa chỉ khai báo", noiCuTru: 1 });
    expect(compacted.get("foreign-year")).toEqual({ quocTich: "GBR_PROVIDER", loaiNgayThangNamSinh: "Y", thoiHanTamTruStr: "2026-12-01 12:00:00" });
    expect(compacted.get("legacy-overrides")).toMatchObject({ hoTen: "Tên khai báo khác", gioiTinh: "F", soGiayTo: "001090999999", ngayThangNamSinhStr: "1991-03-04", soDienThoai: null });
  });

  it("keeps JSON nulls and conservatively retains unmatched legacy birth-date formats", () => {
    expect(compacted.get("null-values")).toMatchObject({ hoTen: null, gioiTinh: null, ngayThangNamSinhStr: null, soGiayTo: null, ghiChu: null });
    expect(compacted.get("legacy-date-format")).toHaveProperty("ngayThangNamSinhStr", "1990-02-28");
  });

  it("never selects frozen declarations, malformed payload shapes or older revisions", () => {
    for (const fixture of fixtures.cases.filter((candidate: any) => candidate.excluded)) {
      expect(compacted.has(fixture.id)).toBe(false);
    }
    expect(compacted.has("new-revision")).toBe(true);
  });

  it("is idempotent when the exact SQL transform is run twice", async () => {
    const next = buildFixtures();
    next.declarations = next.declarations.map((declaration: any) => compacted.has(declaration.id)
      ? { ...declaration, draftPayloadJson: compacted.get(declaration.id) } : declaration);
    const second = await selectFixtures(client, migration, next);
    expect(new Map(second.map((row: any) => [row.id, row.new_payload]))).toEqual(compacted);
  });

  it("only writes compacted draft JSON plus CAS version; snapshots and profile tables remain untouched", () => {
    const mutation = migrationParts(migration).mutation;
    const update = mutation.slice(mutation.indexOf('-- APPLY_COMPACTION'));
    expect(update).toMatch(/UPDATE\s+"KbttGuestDeclaration"/);
    expect(update).toMatch(/SET\s+"draftPayloadJson"\s*=\s*compacted\.new_payload,\s*version\s*=\s*d\.version\s*\+\s*1/);
    expect(update).not.toMatch(/submittedPayload|submittedAt|providerResponse|UPDATE\s+"(?:GuestStay|GuestStayOccupant)"/);
    expect(update).toMatch(/d\.version\s*=\s*compacted\.version/);
    expect(update).toMatch(/IS DISTINCT FROM\s+compacted\.new_payload/);
  });
});
