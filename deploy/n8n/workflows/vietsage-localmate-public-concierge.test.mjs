import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = JSON.parse(
  readFileSync(new URL("./vietsage-localmate-public-concierge.json", import.meta.url), "utf8"),
);
const source = JSON.stringify(workflow);

test("public workflow emits only canonical tour refs for BFF exchange", () => {
  assert.match(source, /proposalRefs/);
  assert.doesNotMatch(source, /GuestOS|kênh đặt dịch vụ chính thức|official channel/i);
  assert.doesNotMatch(source, /LOCALMATE_BOOKING|bookingCandidate/);
});

test("webhook has deterministic fallback and no successful execution storage", () => {
  assert.equal(workflow.settings.executionOrder, "v1");
  assert.equal(workflow.settings.saveDataSuccessExecution, "none");
  assert.ok(workflow.nodes.some((node) => node.name === "Fallback · Hỏi vị trí hoặc báo lỗi"));
  assert.ok(workflow.nodes.some((node) => node.type === "n8n-nodes-base.respondToWebhook"));
});
