import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createResource, defineMutation, defineQuery } from "@dangminhdev04032005/query-resource";

class HttpError extends Error {
  constructor(data) { super("Request failed"); this.data = data; }
}
function load(file, names, dependencies) {
  const code = stripTypeScriptTypes(readFileSync(new URL(file, import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "")
    .replaceAll("export ", "");
  return new Function(...Object.keys(dependencies), `${code}\nreturn { ${names.join(", ")} };`)(...Object.values(dependencies));
}
function repository(requestInternalApi) {
  return load("./repository.ts", ["servicePortalRepository"], { requestInternalApi, HttpError }).servicePortalRepository;
}
function resource(repo) {
  return load("./resource.ts", ["servicePortalResource"], {
    createResource, defineMutation, defineQuery, servicePortalRepository: repo,
  }).servicePortalResource;
}

test("JSON reads preserve filters and cancellation through the central transport", async () => {
  const calls = [];
  const repo = repository(async (...args) => { calls.push(args); return []; });
  const signal = new AbortController().signal;
  await repo.data(signal);
  await repo.financialSummary(signal);
  await repo.settlements("HOTEL CONFIRMED", signal);
  assert.deepEqual(calls.map(([url]) => url), [
    "/api/service-portal", "/api/service-portal?action=financialSummary",
    "/api/service-portal?action=settlements&status=HOTEL+CONFIRMED",
  ]);
  assert.ok(calls.every(([, options]) => options.method === "GET" && options.signal === signal));
});

test("voucher verification keeps code/body and distinguishes invalid codes from network errors", async () => {
  let submitted;
  const order = { id: "order-1" };
  const repo = repository(async (url, options) => { submitted = [url, options]; return { valid: true, order }; });
  assert.deepEqual(await repo.verifyVoucher({ code: "VS-123" }), { valid: true, order });
  assert.equal(submitted[0], "/api/service-portal/vouchers/verify");
  assert.equal(submitted[1].method, "POST");
  assert.deepEqual(submitted[1].body, { code: "VS-123" });
  const invalid = repository(async () => { throw new HttpError({ data: { message: "Mã đã hết hạn" } }); });
  assert.deepEqual(await invalid.verifyVoucher({ code: "expired" }), { valid: false, message: "Mã đã hết hạn" });
  const fallback = repository(async () => { throw new HttpError({ message: "Không được phép" }); });
  assert.deepEqual(await fallback.verifyVoucher({ code: "other" }), { valid: false, message: "Không được phép" });
  const failure = new Error("Network unavailable");
  await assert.rejects(repository(async () => { throw failure; }).verifyVoucher({ code: "x" }), (error) => error === failure);
});

async function observeQueries(options) {
  const calls = [];
  const repo = repository(async (url) => { calls.push(url); return []; });
  const servicePortalResource = resource(repo);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const unsubscribe = [];
  const { useServicePortal } = load("./use-service-portal.ts", ["useServicePortal"], {
    servicePortalResource,
    useQuery: (queryOptions) => {
      const observer = new QueryObserver(client, queryOptions);
      unsubscribe.push(observer.subscribe(() => {}));
      return observer.getCurrentResult();
    },
    useMutation: () => ({}),
  });
  try {
    useServicePortal(options);
    for (let i = 0; client.isFetching() && i < 10; i++) await new Promise(setImmediate);
    assert.equal(client.isFetching(), 0);
    return calls;
  } finally {
    unsubscribe.forEach((stop) => stop());
    client.clear();
  }
}

test("read selection fetches only the queries consumed and keeps legacy defaults", async () => {
  assert.deepEqual(await observeQueries({ queries: [] }), []);
  assert.deepEqual(await observeQueries({ queries: ["data"] }), ["/api/service-portal"]);
  assert.deepEqual(await observeQueries({ queries: ["financialSummary", "settlements"], settlementStatus: "PAID" }), [
    "/api/service-portal?action=financialSummary", "/api/service-portal?action=settlements&status=PAID",
  ]);
  assert.deepEqual(await observeQueries(), [
    "/api/service-portal", "/api/service-portal?action=financialSummary", "/api/service-portal?action=settlements",
  ]);
});
