import assert from "node:assert/strict";
import test from "node:test";
import { kbttConnectionSchema, kbttCredentialsSchema, kbttErrorCode, kbttErrorMessage } from "./types/kbtt-contract.ts";
import { buildWorkspaceNavigation } from "../workspace/config/workspace-registry.ts";

test("KBTT validates write-only credentials, strips secret fields, sanitizes errors, and scopes owner navigation", () => {
  const credentials = kbttCredentialsSchema.parse({ username: " owner ", password: " password " });
  assert.deepEqual(credentials, { username: "owner", password: " password " });
  for (const input of [
    { username: " ", password: "password" },
    { username: "owner", password: "" },
    { username: "x".repeat(121), password: "password" },
    { username: "owner", password: "x".repeat(257) },
    { username: "owner", password: "password", tenantId: "another-tenant" },
  ]) assert.equal(kbttCredentialsSchema.safeParse(input).success, false);

  const connection = kbttConnectionSchema.parse({
    configured: true, status: "CONNECTED", maskedUsername: "o***r",
    csltId: "123", csltKhuVuc: null, csltDonVi: null, maTTCuaCslt: null, maPxCuaCslt: null, isCsltChinh: null,
    lastCheckedAt: null, lastConnectedAt: null, lastErrorCode: null, lastErrorMessage: null,
    password: "must-not-return", accessToken: "must-not-return", refreshToken: "must-not-return", ciphertext: "must-not-return",
  });
  for (const field of ["password", "accessToken", "refreshToken", "ciphertext"]) assert.equal(field in connection, false);
  assert.equal(kbttErrorCode({ data: { code: "KBTT_AUTH_FAILED" } }), "KBTT_AUTH_FAILED");
  assert.equal(kbttErrorCode({ error: { code: "KBTT_PROVIDER_UNAVAILABLE" } }), "KBTT_PROVIDER_UNAVAILABLE");
  assert.equal(kbttErrorCode({ message: "password=do-not-render" }), null);
  assert.equal(kbttErrorCode({ code: "constructor" }), null);
  assert.equal(kbttErrorMessage("password=do-not-render"), kbttErrorMessage(null));
  assert.equal(kbttErrorMessage("KBTT_AUTH_FAILED"), "Tài khoản hoặc mật khẩu không đúng. Vui lòng đăng nhập lại.");

  for (const permission of ["hotel.kbtt.view", "hotel.kbtt.manage", "hotel.dashboard.view"]) {
    const entry = buildWorkspaceNavigation({ persona: "owner", permissions: [permission], hotelId: "hotel-1" }).find((item) => item.key === "owner.hotel.kbtt");
    assert.equal(entry?.label, "Khai báo tạm trú Bộ Công an");
    assert.equal(entry?.href, "/owner/hotels/hotel-1/kbtt");
  }
  for (const scope of [
    { persona: "owner", permissions: ["hotel.kbtt.view"] },
    { persona: "owner", permissions: [], hotelId: "hotel-1" },
    { persona: "front_desk", permissions: ["hotel.kbtt.view"], hotelId: "hotel-1" },
  ]) assert.equal(buildWorkspaceNavigation(scope).some((item) => item.key === "owner.hotel.kbtt"), false);
});
