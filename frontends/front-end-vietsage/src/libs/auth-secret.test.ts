import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { resolveAuthSecret } from "./auth-secret.ts";

const productionEnv = (secret?: string): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  NEXTAUTH_SECRET: secret,
});

for (const secret of [
  undefined,
  "",
  "short-secret",
  "your-long-random-secret",
  "replace-with-a-random-secret-at-least-32-characters",
  "change-me-to-a-random-secret-at-least-32-characters",
]) {
  test(`rejects production auth secret: ${secret ?? "missing"}`, () => {
    assert.throws(() => resolveAuthSecret(productionEnv(secret)), /NEXTAUTH_SECRET or AUTH_SECRET/);
  });
}

test("accepts a strong production auth secret without exposing it", () => {
  const secret = "a-strong-production-secret-with-32-characters";

  assert.equal(resolveAuthSecret(productionEnv(secret)), secret);
});

test("does not expose a rejected production secret", () => {
  const secret = "change-me-secret-value-that-must-stay-private";

  assert.throws(
    () => resolveAuthSecret(productionEnv(secret)),
    (error: Error) => !error.message.includes(secret),
  );
});

test("uses AUTH_SECRET when NEXTAUTH_SECRET is absent", () => {
  const secret = "a-strong-production-auth-secret-with-32-characters";

  assert.equal(
    resolveAuthSecret({ NODE_ENV: "production", AUTH_SECRET: secret }),
    secret,
  );
});

test("keeps development secret handling delegated to Auth.js", () => {
  assert.equal(resolveAuthSecret({ NODE_ENV: "development" }), undefined);
  assert.equal(
    resolveAuthSecret({ NODE_ENV: "development", NEXTAUTH_SECRET: "dev-secret" }),
    "dev-secret",
  );
});
