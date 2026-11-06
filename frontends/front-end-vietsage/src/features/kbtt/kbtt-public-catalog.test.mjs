import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

// @ts-expect-error Node strip-types requires the explicit TypeScript extension.
import { parseKbttPublicCatalog } from "./kbtt-public-catalog-contract.ts";

test("defaults catalog requests to demo and preserves explicit provider selection", async (t) => {
  const previousBaseUrl = process.env.KBTT_BASE_URL;
  t.after(() => {
    if (previousBaseUrl === undefined) delete process.env.KBTT_BASE_URL;
    else process.env.KBTT_BASE_URL = previousBaseUrl;
  });
  delete process.env.KBTT_BASE_URL;

  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: new URL(url), options });
    return new Response(JSON.stringify({ code: "200", data: [] }));
  });
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") {
        return { url: "data:text/javascript,", shortCircuit: true };
      }
      if (specifier === "./kbtt-public-catalog-contract") {
        return nextResolve(`${specifier}.ts`, context);
      }
      return nextResolve(specifier, context);
    },
  });
  let getKbttPublicCatalog;
  try {
    ({ getKbttPublicCatalog } = await import("./kbtt-public-catalog.server.ts"));
  } finally {
    hooks.deregister();
  }

  const catalogPaths = {
    NATIONALITY: "/cms-backend/public/dm-qt/3th/get-all",
    PROVINCE: "/cms-backend/public/dm-tinh-tp/get-all",
    WARD: "/cms-backend/public/dm-phuong-xa",
    STAY_REASON: "/cms-backend/public/ly-do-cu-tru/get-all",
    DOCUMENT_TYPE: "/cms-backend/public/loai-giay-to/get-all",
    RESIDENCE_PLACE: "/cms-backend/public/noi-cu-tru/get-all",
  };
  for (const [kind, path] of Object.entries(catalogPaths)) {
    const parentCode = kind === "WARD" ? "101" : undefined;
    assert.deepEqual(await getKbttPublicCatalog(kind, parentCode), []);
    const request = requests.at(-1);
    assert.equal(request.url.origin, "https://api-kbtt.ai-vlab.com");
    assert.equal(request.url.pathname, path);
    assert.equal(request.url.searchParams.get("trucThuocTinh"), parentCode ?? null);
    assert.deepEqual(request.options.next, {
      revalidate: 86400,
      tags: [`kbtt-catalog-${kind}:${parentCode ?? ""}`],
    });
    assert.equal(request.options.redirect, "error");
  }

  process.env.KBTT_BASE_URL = "https://configured-kbtt.test";
  await getKbttPublicCatalog("WARD", "202");
  assert.equal(
    requests.at(-1).url.href,
    "https://configured-kbtt.test/cms-backend/public/dm-phuong-xa?trucThuocTinh=202",
  );
  assert.equal(requests.length, 7);
});

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
