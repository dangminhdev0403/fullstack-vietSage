import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { resolveConfiguredBackendApiBaseUrl, resolveBrowserReachableBackendUrl } from "./backend-api-config.ts";

test("resolves backend URL using server env, public env, then port 8080 default", () => {
  assert.equal(resolveConfiguredBackendApiBaseUrl({ AUTH_API_BASE_URL: "http://server:8080", NEXT_PUBLIC_AUTH_API_BASE_URL: "http://public:8080" }), "http://server:8080");
  assert.equal(resolveConfiguredBackendApiBaseUrl({ NEXT_PUBLIC_AUTH_API_BASE_URL: "http://public:8080" }), "http://public:8080");
  assert.equal(resolveConfiguredBackendApiBaseUrl({}), "http://localhost:8080");
});

test("resolveBrowserReachableBackendUrl upgrades http to https and matches host when running in remote browser", () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: {
        hostname: "vietsage.com",
        protocol: "https:",
      },
    } as unknown as Window & typeof globalThis;

    assert.equal(resolveBrowserReachableBackendUrl("http://localhost:8080"), "https://vietsage.com");
    assert.equal(resolveBrowserReachableBackendUrl("http://vietsage.com:8080"), "https://vietsage.com");
    assert.equal(resolveBrowserReachableBackendUrl("https://api.vietsage.com"), "https://api.vietsage.com");
  } finally {
    globalThis.window = originalWindow;
  }
});
