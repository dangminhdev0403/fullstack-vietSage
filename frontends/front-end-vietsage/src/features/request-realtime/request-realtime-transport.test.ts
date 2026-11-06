import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { resolveRequestRealtimeAddTrailingSlash } from "./request-realtime-transport.ts";

test("omits the slash for the same-origin development Next proxy", () => {
  assert.equal(resolveRequestRealtimeAddTrailingSlash("https://vietsage.localhost", "https://vietsage.localhost", true), false);
  assert.equal(resolveRequestRealtimeAddTrailingSlash("http://localhost:3000", "http://localhost:3000", true), false);
});

test("retains the slash for the default backend on a different port", () => {
  assert.equal(resolveRequestRealtimeAddTrailingSlash("http://localhost:8080", "http://localhost:3000", true), true);
});

test("retains the slash for explicit cross-origin realtime backends and custom paths", () => {
  assert.equal(resolveRequestRealtimeAddTrailingSlash("https://api.vietsage.localhost", "https://vietsage.localhost", true), true);
  assert.equal(resolveRequestRealtimeAddTrailingSlash("https://realtime.example.com/custom", "https://vietsage.localhost", true), true);
  assert.equal(resolveRequestRealtimeAddTrailingSlash("//api.vietsage.localhost", "https://vietsage.localhost", true), true);
});

test("compares normalized origins for explicit same-origin URLs", () => {
  assert.equal(resolveRequestRealtimeAddTrailingSlash("https://VIETSAGE.localhost:443/custom", "https://vietsage.localhost", true), false);
  assert.equal(resolveRequestRealtimeAddTrailingSlash("/custom", "https://vietsage.localhost", true), false);
});

test("retains the slash when the protocol differs", () => {
  assert.equal(resolveRequestRealtimeAddTrailingSlash("http://vietsage.localhost", "https://vietsage.localhost", true), true);
});

test("retains the slash for production Nginx routing", () => {
  assert.equal(resolveRequestRealtimeAddTrailingSlash("https://stay.vietsage.com", "https://stay.vietsage.com", false), true);
  assert.equal(resolveRequestRealtimeAddTrailingSlash("https://api.vietsage.com", "https://stay.vietsage.com", false), true);
});

test("retains the slash without a browser origin", () => {
  assert.equal(resolveRequestRealtimeAddTrailingSlash("http://localhost:8080", undefined, true), true);
});

test("retains the slash when either URL cannot be parsed", () => {
  assert.equal(resolveRequestRealtimeAddTrailingSlash("https://[invalid", "https://vietsage.localhost", true), true);
  assert.equal(resolveRequestRealtimeAddTrailingSlash("https://vietsage.localhost", "invalid", true), true);
});
