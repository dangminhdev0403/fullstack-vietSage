import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// @ts-expect-error Node strip-types requires the explicit TypeScript extension.
import { parseKbttPublicCatalog } from "./kbtt-public-catalog-contract.ts";

test("maps public BCA catalogs to the UI contract without auth-service or DB", () => {
  const fetchedAt = "2026-09-14T00:00:00.000Z";
  const reasons = parseKbttPublicCatalog(
    "STAY_REASON",
    { code: "200", data: [{ id: 1, name: "Du lịch" }] },
    undefined,
    fetchedAt,
  );
  assert.deepEqual(reasons, [
    {
      id: "STAY_REASON::1",
      kind: "STAY_REASON",
      code: "1",
      parentCode: null,
      nameVi: "Du lịch",
      nameEn: null,
      isActive: true,
      fetchedAt,
    },
  ]);

  const wards = parseKbttPublicCatalog(
    "WARD",
    {
      code: 200,
      data: [
        {
          maPhuongXa: "10101",
          tenPhuongXa: "Phúc Xá",
          tenPhuongXaEn: "Phuc Xa",
          trucThuocTinh: "101",
        },
        {
          maPhuongXa: "99999",
          tenPhuongXa: "Khác",
          trucThuocTinh: "999",
        },
      ],
    },
    "101",
    fetchedAt,
  );
  assert.equal(wards.length, 1);
  assert.equal(wards[0].code, "10101");
  assert.equal(wards[0].parentCode, "101");
});

test("catalog route is server-cached and bypasses auth-service", () => {
  const route = readFileSync(
    new URL(
      "../../app/api/hotel-ops/kbtt/catalogs/[kind]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const server = readFileSync(
    new URL("./kbtt-public-catalog.server.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    route,
    /executeHotelOpsBackendRequest|httpServer|@\/auth/,
  );
  assert.match(route, /s-maxage=86400/);
  assert.match(server, /next:\s*\{\s*revalidate:\s*CACHE_SECONDS/);
  assert.match(server, /const inFlight = new Map/);
  assert.match(server, /MAX_RESPONSE_BYTES/);
});
