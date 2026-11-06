import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

function loadRepository(request) {
  const source = stripTypeScriptTypes(readFileSync(new URL("./repositories/hotel-partner-settlements-repository.ts", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "")
    .replaceAll("export ", "");
  return new Function("requestInternalApi", source + "\nreturn hotelPartnerSettlementsRepository;")(request);
}

test("settlement reads isolate encoded hotel scope, forward cancellation and preserve server amounts", async () => {
  const calls = [];
  const settlement = [{ id: "s", netAmount: "9007199254740993.01", status: "UNSETTLED" }];
  const revenue = { grossAmount: "123456789.99", orderCount: 2 };
  const repository = loadRepository(async (...args) => {
    calls.push(args);
    return args[0].endsWith("/revenue") ? revenue : settlement;
  });
  const signal = new AbortController().signal;
  assert.equal(await repository.list("hotel/a?", signal), settlement);
  assert.equal(await repository.revenue("hotel/a?", signal), revenue);
  assert.deepEqual(calls.map(([url, options]) => [url, options.method, options.signal]), [
    ["/api/hotel-ops/hotels/hotel%2Fa%3F/marketplace/settlements", "GET", signal],
    ["/api/hotel-ops/hotels/hotel%2Fa%3F/marketplace/revenue", "GET", signal],
  ]);
});

test("settlement commands send only selected identities and preserve server batch count", async () => {
  const calls = [];
  const response = { settledCount: 1 };
  const repository = loadRepository(async (...args) => { calls.push(args); return response; });
  await repository.settle("hotel/a", "settlement/b");
  const ids = ["s1", "s2"];
  assert.equal(await repository.settleBatch("hotel/a", ids), response);
  assert.deepEqual(calls, [
    ["/api/hotel-ops/hotels/hotel%2Fa/marketplace/settlements/settlement%2Fb/settle", { method: "POST" }],
    ["/api/hotel-ops/hotels/hotel%2Fa/marketplace/settlements/settle-batch", { method: "POST", body: { settlementIds: ids } }],
  ]);
});

test("failed settlement commands propagate the transport failure without a retry or fabricated success", async () => {
  let calls = 0;
  const error = new Error("Settlement rejected");
  const repository = loadRepository(async () => { calls++; throw error; });
  await assert.rejects(repository.settleBatch("hotel", ["s"]), (received) => received === error);
  assert.equal(calls, 1);
});
