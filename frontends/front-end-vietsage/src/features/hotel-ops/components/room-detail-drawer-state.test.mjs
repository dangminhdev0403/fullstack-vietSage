import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./room-detail-drawer.tsx", import.meta.url), "utf8");

test("room detail form resets by room/mode key without setState synchronization effects", () => {
  assert.match(source, /key={`\$\{props\.room\.id}:\$\{props\.initialMode \?\? "view"}`}/);
  assert.match(source, /useState\(room\.roomNumber \?\? ""\)/);
  assert.match(source, /function startEditing\(\)[\s\S]*setFormRoomNumber\(room\.roomNumber \?\? ""\)[\s\S]*setIsEditing\(true\)/);
  assert.match(source, /onClick={startEditing}/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{\s*setIsEditing/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{\s*if \(!room\) return;\s*setFormRoomNumber/);
});
