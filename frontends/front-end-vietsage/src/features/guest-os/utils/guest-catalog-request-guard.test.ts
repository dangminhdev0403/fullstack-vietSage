import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { GuestCatalogRequestGuard } from "./guest-catalog-request-guard.ts";

test("only the latest catalog request generation may update UI state", () => {
  const guard = new GuestCatalogRequestGuard();
  const requestA = guard.begin();
  assert.equal(guard.isCurrent(requestA), true);

  const requestB = guard.begin();
  assert.equal(guard.isCurrent(requestA), false);
  assert.equal(guard.isCurrent(requestB), true);

  guard.invalidate();
  assert.equal(guard.isCurrent(requestB), false);
});
