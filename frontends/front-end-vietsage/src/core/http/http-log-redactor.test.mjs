import assert from "node:assert/strict";
import test from "node:test";

import { toLogSafePayload } from "./http-log-redactor.ts";

test("redacts nested credential fields without hiding safe expiry metadata", () => {
  const sanitized = toLogSafePayload({
    data: {
      sessionToken: "guest-session-secret",
      RefreshToken: "refresh-secret",
      accessToken: "access-secret",
      accessTokenExpiresAt: 1_800_000_000_000,
      nested: [{ password: "password-secret", communicationKey: "bridge-secret" }],
    },
  });

  assert.deepEqual(sanitized, {
    data: {
      sessionToken: "[redacted]",
      RefreshToken: "[redacted]",
      accessToken: "[redacted]",
      accessTokenExpiresAt: 1_800_000_000_000,
      nested: [{ password: "[redacted]", communicationKey: "[redacted]" }],
    },
  });
});

test("redacts generic bearer-style token fields and cookies", () => {
  assert.deepEqual(
    toLogSafePayload({ token: "opaque", csrfToken: "csrf", cookie: "sid=secret" }),
    { token: "[redacted]", csrfToken: "[redacted]", cookie: "[redacted]" },
  );
});
