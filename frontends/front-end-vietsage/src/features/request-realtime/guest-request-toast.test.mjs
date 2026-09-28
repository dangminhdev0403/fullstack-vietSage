import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notifierSource = readFileSync(
  new URL("./guest-request-realtime-notifier.tsx", import.meta.url),
  "utf8",
);
const servicesPageSource = readFileSync(
  new URL("../../app/(vietsage)/g/services/page.tsx", import.meta.url),
  "utf8",
);

function between(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test("guest request creation shows only the submit success toast", () => {
  const createdHandler = between(notifierSource, "onCreated:", "onUpdated:");

  assert.doesNotMatch(createdHandler, /toast\./);
  assert.doesNotMatch(createdHandler, /playGuestRequestSound/);
});

test("guest request submit success toast closes after three seconds", () => {
  const submitHandler = between(
    servicesPageSource,
    "async function submitGuestRequest",
    "const pageTitle",
  );

  assert.match(submitHandler, /toast\.success\([\s\S]*\{ duration: 3000 \}/);
});
