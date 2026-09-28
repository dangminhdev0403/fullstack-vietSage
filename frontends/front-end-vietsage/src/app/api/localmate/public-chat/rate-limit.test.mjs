import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { clearPublicChatQuota, consumePublicChatQuota } from "./rate-limit.ts";

afterEach(clearPublicChatQuota);

describe("consumePublicChatQuota", () => {
  it("allows twelve requests, blocks the next one, then resets", () => {
    for (let index = 0; index < 12; index += 1) {
      assert.equal(consumePublicChatQuota("client", 1_000).allowed, true);
    }
    assert.equal(consumePublicChatQuota("client", 1_000).allowed, false);
    assert.equal(consumePublicChatQuota("client", 61_000).allowed, true);
  });
});
