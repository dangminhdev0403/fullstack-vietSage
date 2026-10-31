import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { registerHooks } from "node:module";
import test, { after } from "node:test";

const context = new AsyncLocalStorage();
const fixtureKey = Symbol.for("vietsage.auth-session-refresh.test");
const actualModuleUrl = new URL("./auth-session-refresh.ts", import.meta.url).href;
let refreshImplementation;
let calls;
let saves;

globalThis[fixtureKey] = {
  refresh: (...args) => {
    calls.push(args);
    return refreshImplementation(...args);
  },
  update: async (tokens) => {
    const request = context.getStore();
    assert.ok(request, "cookie writes must run in a request context");
    if (request.saveError) throw request.saveError;
    saves.push({ requestId: request.id, tokens });
    request.tokens = tokens;
  },
  read: async () => context.getStore()?.tokens ?? {},
};

const fixtureExpression = `globalThis[Symbol.for("vietsage.auth-session-refresh.test")]`;
const stubSources = {
  "server-only": "export {};",
  "@/auth": `export const unstable_update = (...args) => ${fixtureExpression}.update(...args);`,
  "@/features/auth/service/auth-service-instance": `export const authService = { refresh: (...args) => ${fixtureExpression}.refresh(...args) };`,
  "@/core/logging/runtime-console": "export const runtimeConsole = { info() {} };",
  "@/libs/server-session-tokens": `export const readServerSessionTokens = (...args) => ${fixtureExpression}.read(...args);`,
};
const hook = registerHooks({
  resolve(specifier, resolutionContext, nextResolve) {
    if (resolutionContext.parentURL === actualModuleUrl && specifier in stubSources) {
      return {
        url: `data:text/javascript,${encodeURIComponent(stubSources[specifier])}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, resolutionContext);
  },
});

const { refreshAndSaveSessionTokens, refreshSessionTokens } = await import(actualModuleUrl);

after(() => {
  hook.deregister();
  delete globalThis[fixtureKey];
});

function reset(implementation) {
  calls = [];
  saves = [];
  refreshImplementation = implementation;
}

function request(id, tokens = {}) {
  return { id, tokens };
}

function refreshedTokens() {
  return {
    accessToken: "test-new-access",
    refreshToken: "test-new-refresh",
    accessTokenExpiresAt: Date.now() + 60_000,
  };
}

test("concurrent requests share one rotation but both persist their response cookies", async () => {
  let finish;
  const rotated = refreshedTokens();
  reset(() => new Promise((resolve) => { finish = resolve; }));
  const firstRequest = request("first");
  const secondRequest = request("second");

  const first = context.run(firstRequest, () => refreshAndSaveSessionTokens("test-old-concurrent"));
  const second = context.run(secondRequest, () => refreshAndSaveSessionTokens("test-old-concurrent"));
  assert.equal(calls.length, 1);
  finish(rotated);

  const results = await Promise.all([first, second]);
  assert.deepEqual(results, [rotated, rotated]);
  assert.deepEqual(saves.map((entry) => entry.requestId).sort(), ["first", "second"]);
  assert.deepEqual(firstRequest.tokens, { ...rotated, authError: null });
  assert.deepEqual(secondRequest.tokens, { ...rotated, authError: null });
});

test("one request failing to save cookies does not fail the other request", async () => {
  let finish;
  const rotated = refreshedTokens();
  const saveError = new Error("cookie write failed");
  reset(() => new Promise((resolve) => { finish = resolve; }));
  const firstRequest = { ...request("failed"), saveError };
  const secondRequest = request("saved");
  const first = context.run(firstRequest, () => refreshAndSaveSessionTokens("test-old-save-error"));
  const second = context.run(secondRequest, () => refreshAndSaveSessionTokens("test-old-save-error"));
  finish(rotated);

  const results = await Promise.allSettled([first, second]);
  assert.equal(calls.length, 1);
  assert.equal(results[0].status, "rejected");
  assert.equal(results[0].reason, saveError);
  assert.equal(results[1].status, "fulfilled");
  assert.deepEqual(results[1].value, rotated);
  assert.deepEqual(saves.map((entry) => entry.requestId), ["saved"]);
});

test("failed shared rotation does not write cookies and permits a subsequent retry", async () => {
  const refreshError = new Error("refresh rejected");
  reset(async () => { throw refreshError; });
  const requests = [request("a"), request("b")];
  const outcomes = await Promise.allSettled(requests.map((value) =>
    context.run(value, () => refreshAndSaveSessionTokens("test-old-retry"))));
  assert.equal(calls.length, 1);
  assert.ok(outcomes.every((outcome) => outcome.status === "rejected" && outcome.reason === refreshError));
  assert.equal(saves.length, 0);

  const rotated = refreshedTokens();
  refreshImplementation = async () => rotated;
  assert.deepEqual(await context.run(requests[0], () => refreshAndSaveSessionTokens("test-old-retry")), rotated);
  assert.equal(calls.length, 2);
  assert.equal(saves.length, 1);
});

test("an expired or invalid rotated expiry cannot mask a failed refresh", async () => {
  const refreshError = new Error("refresh expired");
  reset(async () => { throw refreshError; });
  for (const expiry of [Date.now() - 1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const expired = { ...refreshedTokens(), accessTokenExpiresAt: expiry };
    await assert.rejects(
      context.run(request("expired", expired), () => refreshAndSaveSessionTokens("test-old-expired")),
      (error) => error === refreshError,
    );
  }
  assert.equal(saves.length, 0);
});

test("a current unexpired rotated cookie remains a valid recovery path", async () => {
  reset(async () => { throw new Error("stale refresh token"); });
  const current = refreshedTokens();
  const result = await context.run(request("already-rotated", current), () =>
    refreshAndSaveSessionTokens("test-old-rotated"));
  assert.deepEqual(result, current);
  assert.equal(saves.length, 0);
});

test("rotation-only callers never write a request cookie", async () => {
  const rotated = refreshedTokens();
  reset(async () => rotated);
  assert.deepEqual(await refreshSessionTokens("test-rotation-only"), rotated);
  assert.equal(calls.length, 1);
  assert.equal(saves.length, 0);
});
