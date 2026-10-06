import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { parsePublicChatAction } from "./public-chat-action.ts";

test("accepts valid paired proposal and candidate locator keys", () => {
  const proposalKey = `prop_${"p".repeat(43)}`;
  const candidateKey = `cand_${"c".repeat(43)}`;
  assert.deepEqual(
    parsePublicChatAction({ type: "SELECT_GUIDE", proposalKey, candidateKey }),
    { type: "SELECT_GUIDE", proposalKey, candidateKey },
  );
  assert.deepEqual(
    parsePublicChatAction({ type: "SELECT_GUIDE", proposalKey: "trip_tour-ha-noi-1d", candidateKey: "cand_LM-HN-001" }),
    { type: "SELECT_GUIDE", proposalKey: "trip_tour-ha-noi-1d", candidateKey: "cand_LM-HN-001" },
  );
  assert.equal(parsePublicChatAction({ type: "SELECT_GUIDE", candidateKey }), null);
  assert.equal(parsePublicChatAction({ type: "SELECT_GUIDE", proposalKey, candidateKey: "cand_!invalid@" }), null);
  assert.equal(parsePublicChatAction({ type: "SELECT_GUIDE", proposalKey: "invalid_prefix", candidateKey }), null);
  assert.equal(parsePublicChatAction({ type: "LOCALMATE_BOOKING", proposalKey, candidateKey }), null);
  assert.equal(parsePublicChatAction(null), null);
});
