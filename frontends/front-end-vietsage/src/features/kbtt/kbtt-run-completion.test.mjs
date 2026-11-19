import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("completed BCA run refreshes local acceptance even when provider reconciliation fails", () => {
  const invalidated = [];
  let state = { pendingSchedule: { id: "scheduled" }, recentRuns: [] };
  const activeRef = { current: false };
  const queries = Object.fromEntries(["autoSubmitConfig", "reconciliation", "reconciliationLocal", "inHouseDeclarations", "connection", "declarations", "declarationDetail"].map(name => [name, {
    options: () => ({}), invalidateAll: () => { invalidated.push(name); },
  }]));
  const resource = { queries, mutations: Object.fromEntries(["updateAutoSubmitConfig", "testAutoSubmit", "scheduleAutoSubmit", "cancelScheduledAutoSubmit"].map(name => [name, { options: () => ({}) }])) };
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("./hooks/use-kbtt-auto-submit.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (name === "react") return { useMemo: fn => fn(), useCallback: fn => fn, useRef: () => activeRef, useEffect: fn => fn() };
    if (name === "@tanstack/react-query") return { useQueryClient: () => ({}), useQuery: () => ({ data: state }), useMutation: () => ({}) };
    if (name.includes("kbtt-resource")) return { kbttResource: { bind: () => resource } };
    throw new Error(name);
  }, mod, mod.exports);
  mod.exports.useKbttAutoSubmit("hotel-a");
  assert.deepEqual(invalidated, []);
  state = { recentRuns: [{ status: "COMPLETED", successCount: 2 }] };
  mod.exports.useKbttAutoSubmit("hotel-a");
  assert.ok(invalidated.includes("reconciliationLocal"));
  assert.ok(invalidated.includes("connection"));
  assert.ok(invalidated.includes("inHouseDeclarations"));
  const count = invalidated.length;
  mod.exports.useKbttAutoSubmit("hotel-a");
  assert.equal(invalidated.length, count);
});
