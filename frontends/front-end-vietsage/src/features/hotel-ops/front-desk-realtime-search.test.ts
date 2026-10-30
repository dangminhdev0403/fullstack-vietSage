import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const frontDeskPageSource = readFileSync(
  new URL("../../app/(vietsage)/hotels/[hotelId]/front-desk/page.tsx", import.meta.url),
  "utf8",
);

const searchBarSource = readFileSync(
  new URL("../../app/(vietsage)/hotels/[hotelId]/front-desk/front-desk-search-bar.tsx", import.meta.url),
  "utf8",
);

test("FrontDeskSearchBar implements realtime debounced search without full submit reloads", () => {
  // Client component
  assert.match(searchBarSource, /"use client"/);

  // Uses React useTransition for smooth non-blocking state updates
  assert.match(searchBarSource, /useTransition/);

  // Debounce with 300ms timer
  assert.match(searchBarSource, /setTimeout\(/);
  assert.match(searchBarSource, /300/);

  // Preserves in-place scroll during URL replacement
  assert.match(searchBarSource, /router\.replace\(.*scroll:\s*false/);

  // Supports inline clear and loading spinner
  assert.match(searchBarSource, /handleClear/);
  assert.match(searchBarSource, /isPending/);
  assert.match(searchBarSource, /name="refresh"/);
  assert.match(searchBarSource, /animate-spin/);
  assert.match(searchBarSource, /name="close"/);
});

test("front-desk page.tsx searches across all dates when query q is provided", () => {
  // Uses FrontDeskSearchBar
  assert.match(frontDeskPageSource, /<FrontDeskSearchBar/);

  // Omit dateRange constraint when q is provided so search works across all dates
  assert.match(frontDeskPageSource, /\.\.\.\(q\s*\?\s*\{\}\s*:\s*dateRange\)/);

  // Renders indicator that search spans all dates
  assert.match(frontDeskPageSource, /Tìm kiếm trên tất cả ngày/);
  assert.match(frontDeskPageSource, /\(tất cả ngày\)/);
});
