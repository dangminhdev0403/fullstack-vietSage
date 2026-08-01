import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hookSource = readFileSync(new URL("../hooks/use-workstation-scan.ts", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("./cccd-check-in-panel.tsx", import.meta.url), "utf8");

test("scan UI clears an expired request locally", () => {
  assert.match(hookSource, /Date\.now\(\) >= scan\.expiresAt/);
  assert.match(hookSource, /phase: 'expired'/);
});

test("check-in scan panel contains no workstation pairing controls", () => {
  assert.doesNotMatch(panelSource, /Kết nối máy|Mã kết nối dùng một lần|pairCode|createPairing/);
  assert.match(panelSource, /Quét CCCD/);
});
