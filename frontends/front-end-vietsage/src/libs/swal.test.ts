import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { resolveAlertContent, trustedAlertHtml } from "./swal.ts";

test("treats HTML-looking error messages as escaped text", () => {
  const content = resolveAlertContent(
    new Error('<img src=x onerror="globalThis.pwned=1">'),
    true,
  );

  assert.equal(content.text, undefined);
  assert.match(content.html ?? "", /&lt;img/);
  assert.doesNotMatch(content.html ?? "", /<img/);
});

test("renders HTML only after an explicit trusted wrapper", () => {
  const html = "<strong>Trusted application markup</strong>";

  assert.deepEqual(resolveAlertContent(trustedAlertHtml(html)), { html });
  assert.deepEqual(resolveAlertContent(html), { text: html });
});
