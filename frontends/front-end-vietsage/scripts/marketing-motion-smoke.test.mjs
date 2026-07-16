import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const motionRoot = readFileSync(
  new URL("../src/components/marketing/marketing-motion-root.tsx", import.meta.url),
  "utf8",
);
const marketingShell = readFileSync(
  new URL("../src/components/marketing/marketing-shell.tsx", import.meta.url),
  "utf8",
);
const landingPage = readFileSync(
  new URL("../src/app/page.tsx", import.meta.url),
  "utf8",
);
const globalCss = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

test("marketing reveals are permanent after first intersection", () => {
  assert.doesNotMatch(
    motionRoot,
    /entry\.isIntersecting\s*\?\s*["']true["']\s*:\s*["']false["']/,
    "reveals must not be hidden again after leaving the viewport",
  );
  assert.match(motionRoot, /revealObserver\?\.unobserve\(entry\.target\)/);
});

test("motion readiness keeps initially visible content from flashing", () => {
  const prepareVisibleTarget = motionRoot.indexOf('target.dataset.visible = "true"');
  const enableMotion = motionRoot.indexOf('root.dataset.motion = "ready"');

  assert.ok(prepareVisibleTarget >= 0, "visible targets should be prepared");
  assert.ok(enableMotion > prepareVisibleTarget, "motion mode must start after visible targets are prepared");
});

test("landing sections use distinct reveal choreography", () => {
  const source = `${marketingShell}\n${landingPage}`;
  const cssVariants = new Set(
    [...globalCss.matchAll(/\[data-reveal="([^"]+)"\]/g)].map((match) => match[1]),
  );

  assert.ok(cssVariants.size >= 5, `expected at least 5 reveal variants, received ${cssVariants.size}`);
  assert.match(source, /data-reveal="fade"/);
  assert.match(source, /data-reveal="scale"/);
  assert.match(source, /"from-left"/);
  assert.match(source, /"from-right"/);
  assert.match(source, /data-reveal="cta"/);
});

test("scene backgrounds crossfade through stable layered surfaces", () => {
  assert.match(marketingShell, /data-scene-backdrop="operations"/);
  assert.match(globalCss, /\.vs-scene-backdrop-layer\s*\{/);
  assert.match(globalCss, /opacity[^;]*;/);
});

test("reduced motion leaves every reveal visible", () => {
  assert.match(
    globalCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-reveal\][\s\S]*?opacity:\s*1/,
  );
});
