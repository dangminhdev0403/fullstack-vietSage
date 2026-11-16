import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { kbttReconciliationSchema, canRetryReconciledGuest } from "./types/kbtt-contract.ts";

const row = {
  id: "local-1", source: "VIETSAGE", kind: "VIETNAMESE", occupantId: "occupant-1", stayId: "stay-1", roomId: "room-1",
  roomNumber: "101", groupCode: "GRP-1", fullName: "Khách mẫu", identityNumber: "000000000001", documentType: 1, nationality: "VNM",
  checkedInAt: "2026-11-16T02:00:00Z", plannedCheckOutAt: "2026-11-18T05:00:00Z", status: "NOT_FOUND", reason: null,
  bcaRecordId: null, declarationStatus: "FAILED", providerMessage: null, canRetry: true,
};
const complete = { state: "COMPLETE", checkedAt: "2026-11-16T03:00:00Z", error: null };
const response = { items: [row], checkedAt: null, range: { dateFrom: "2026-11-16", dateTo: "2026-11-16" },
  sources: { VIETNAMESE: complete, FOREIGN: { state: "NEEDS_LOGIN", checkedAt: null, error: { code: "KBTT_SESSION_REQUIRED", message: "Cần đăng nhập lại BCA." } } } };

test("requires both country results and preserves partial failures without defaulting an unsent status", () => {
  const parsed = kbttReconciliationSchema.parse(response);
  assert.equal(parsed.sources.VIETNAMESE.state, "COMPLETE");
  assert.equal(parsed.sources.FOREIGN.state, "NEEDS_LOGIN");
  assert.equal(parsed.checkedAt, null);
  assert.equal(kbttReconciliationSchema.safeParse({ ...response, sources: { VIETNAMESE: complete } }).success, false);
  assert.equal(kbttReconciliationSchema.safeParse({ ...response, items: [{ ...row, status: "UNSENT" }] }).success, false);
  assert.equal(kbttReconciliationSchema.parse({ ...response, items: [{ ...row, status: null, canRetry: false }] }).items[0].status, null);
  assert.equal(kbttReconciliationSchema.safeParse({ ...response, items: null }).success, false);
});

test("only confirmed failed local sends with missing BCA record can be retried", () => {
  assert.equal(canRetryReconciledGuest(row), true);
  for (const status of ["MATCHED", "REVIEW", null]) assert.equal(canRetryReconciledGuest({ ...row, status }), false);
  for (const declarationStatus of ["SENDING", "UNKNOWN", "SUBMITTED", "READY", "DRAFT", null]) assert.equal(canRetryReconciledGuest({ ...row, declarationStatus }), false);
  assert.equal(canRetryReconciledGuest({ ...row, source: "BCA_ONLY", occupantId: null }), false);
  assert.equal(canRetryReconciledGuest({ ...row, canRetry: false }), false);
  assert.equal(kbttReconciliationSchema.safeParse({ ...response, items: [{ ...row, source: "BCA_ONLY" }] }).success, false);
  assert.equal(kbttReconciliationSchema.safeParse({ ...response, items: [{ ...row, status: "MATCHED" }] }).success, false);
});

function loadModule(file, dependencies) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    const key = Object.keys(dependencies).find((part) => name.includes(part));
    if (!key) throw new Error(`Unexpected import ${name}`);
    return dependencies[key];
  }, module, module.exports);
  return module.exports;
}

test("one hotel-scoped resource request refreshes both countries, independently of client-side selection", async () => {
  const calls = [];
  let result = response;
  const { kbttResource: config } = loadModule("./resources/kbtt-resource.ts", {
    "query-resource": { createResource: () => (config) => config, defineQuery: (config) => config, defineMutation: (config) => config },
    "kbtt-repository": { kbttRepository: { reconciliation: async (...args) => { calls.push(args); if(result instanceof Error) throw result; return result; } } },
  });
  const signal = new AbortController().signal;
  const query = config.queries.reconciliation;
  assert.deepEqual(query.inputKey(), []);
  const actual = await query.queryFn({ scope: { hotelId: "hotel-1" }, signal });
  assert.equal(actual.sources.VIETNAMESE.state, "COMPLETE");
  assert.equal(actual.sources.FOREIGN.state, "NEEDS_LOGIN");
  assert.deepEqual(calls, [["hotel-1", signal, true]]);
  await config.mutations.refreshReconciliation.mutationFn({ scope: { hotelId: "hotel-1" } });
  assert.deepEqual(calls[1], ["hotel-1", undefined, true]);
  result = new Error("provider source unavailable");
  await assert.rejects(query.queryFn({ scope: { hotelId: "hotel-1" }, signal }), /unavailable/);
});

test("repository uses one GET with force and refuses malformed reconciliation instead of manufacturing empty rows", async () => {
  const calls = []; let payload = { data: response };
  const contract = await import("./types/kbtt-contract.ts");
  const { kbttRepository: repository } = loadModule("./repositories/kbtt-repository.ts", {
    "internal-api-client": { requestInternalApiEnvelope: async (...args) => { calls.push(args); return payload; } },
    "kbtt-contract": contract,
  });
  const signal = new AbortController().signal;
  assert.equal((await repository.reconciliation("hotel/1", signal, true)).sources.FOREIGN.state, "NEEDS_LOGIN");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/hotel-ops/hotels/hotel%2F1/kbtt/reconciliation?force=true");
  assert.deepEqual(calls[0][1], { method: "GET", signal });
  payload = { data: { items: [] } };
  await assert.rejects(repository.reconciliation("hotel-1", signal, true));
});


test("local guest snapshot is available independently when full both-country synchronization fails", async () => {
  const local = { ...response, items: [{ ...row, status: null, canRetry: false }], checkedAt: null,
    sources: { VIETNAMESE: { state: "PENDING", checkedAt: null, error: null }, FOREIGN: { state: "PENDING", checkedAt: null, error: null } } };
  assert.equal(kbttReconciliationSchema.parse(local).items.length, 1);
  const calls = [];
  const { kbttResource: config } = loadModule("./resources/kbtt-resource.ts", {
    "query-resource": { createResource: () => (config) => config, defineQuery: (config) => config, defineMutation: (config) => config },
    "kbtt-repository": { kbttRepository: { reconciliation: async (...args) => {
      calls.push(args);
      if (args[3] === true) return local;
      throw new Error("BCA read failed");
    } } },
  });
  const signal = new AbortController().signal;
  const context = { scope: { hotelId: "hotel-1" }, signal };
  const immediate = await config.queries.reconciliationLocal.queryFn(context);
  assert.equal(immediate.items[0].status, null);
  assert.equal(immediate.sources.VIETNAMESE.state, "PENDING");
  assert.equal(immediate.sources.FOREIGN.state, "PENDING");
  await assert.rejects(config.queries.reconciliation.queryFn(context), /BCA read failed/);
  assert.deepEqual(calls, [["hotel-1", signal, false, true], ["hotel-1", signal, true]]);
  assert.equal(immediate.items[0].fullName, row.fullName);
});

test("local-only repository GET bypasses force provider reads and validates its pending DTO", async () => {
  const calls = [];
  const pending = { ...response, items: [{ ...row, status: null, canRetry: false }],
    sources: { VIETNAMESE: { state: "PENDING", checkedAt: null, error: null }, FOREIGN: { state: "PENDING", checkedAt: null, error: null } } };
  const contract = await import("./types/kbtt-contract.ts");
  const { kbttRepository: repository } = loadModule("./repositories/kbtt-repository.ts", {
    "internal-api-client": { requestInternalApiEnvelope: async (...args) => { calls.push(args); return { data: pending }; } },
    "kbtt-contract": contract,
  });
  const result = await repository.reconciliation("hotel-1", undefined, false, true);
  assert.equal(calls[0][0], "/api/hotel-ops/hotels/hotel-1/kbtt/reconciliation?localOnly=true");
  assert.equal(calls[0][1].method, "GET");
  assert.equal(result.items[0].status, null);
});
