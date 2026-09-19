import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isAllowedApiMutationRequest } from "./api-mutation-origin.ts";

const sessionCookie = "__Secure-authjs.session-token=encrypted-session";

function request({
  method = "POST",
  origin,
  cookie = sessionCookie,
  site = "same-origin",
  url = "https://vietsage.com/api/hotel-ops/hotels/h1/rooms",
} = {}) {
  const headers = new Headers({ host: "vietsage.com" });
  if (origin) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  if (site) headers.set("sec-fetch-site", site);
  return new Request(url, { method, headers });
}

test("allows safe methods and non-cookie API clients", () => {
  assert.equal(isAllowedApiMutationRequest(request({ method: "GET", origin: undefined })), true);
  assert.equal(isAllowedApiMutationRequest(request({ cookie: "", origin: undefined, site: undefined })), true);
});

test("allows same-origin cookie-authenticated API mutations", () => {
  assert.equal(isAllowedApiMutationRequest(request({ origin: "https://vietsage.com" })), true);
});

test("rejects cross-site, mismatched, and originless cookie-authenticated mutations", () => {
  assert.equal(
    isAllowedApiMutationRequest(request({ origin: "https://vietsage.com", site: "cross-site" })),
    false,
  );
  assert.equal(isAllowedApiMutationRequest(request({ origin: "https://evil.example" })), false);
  assert.equal(isAllowedApiMutationRequest(request({ origin: undefined, site: undefined })), false);
});

test("root proxy matcher includes API routes", async () => {
  const source = await readFile(new URL("../../../proxy.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\(\?!api\|/);
});
