import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { parsePublicChatAction } from "./public-chat-action.ts";

test("accepts only a bounded LocalMate booking candidate", () => {
  assert.deepEqual(
    parsePublicChatAction({ type: "LOCALMATE_BOOKING", candidateKey: "cand_LM-HN-001" }),
    { type: "LOCALMATE_BOOKING", candidateKey: "cand_LM-HN-001" },
  );
  assert.equal(parsePublicChatAction({ type: "LOCALMATE_BOOKING", candidateKey: "../../admin" }), null);
  assert.equal(parsePublicChatAction({ type: "OTHER", candidateKey: "cand_LM-HN-001" }), null);
  assert.equal(parsePublicChatAction(null), null);
});
