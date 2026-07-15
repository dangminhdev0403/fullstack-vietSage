import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { guestLocales } from "./config.ts";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { guestDictionaries } from "./dictionary.ts";

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

const localizedRequestKeys = [
  "requests.view",
  "requests.quantity",
  "requests.updatedNew",
  "requests.updatedStatus",
  "requests.updatedAnswer",
  "requests.realtimeReady",
  "requests.realtimeInterrupted",
  "requests.realtimeInterruptedHelp",
] as const;

test("every GuestOS locale exposes the same keys and placeholders", () => {
  const expectedKeys = Object.keys(guestDictionaries.vi).sort();

  for (const locale of guestLocales) {
    const dictionary = guestDictionaries[locale];
    assert.deepEqual(Object.keys(dictionary).sort(), expectedKeys, `${locale} key set`);
    for (const key of expectedKeys) {
      assert.deepEqual(
        placeholders(dictionary[key]),
        placeholders(guestDictionaries.en[key]),
        `${locale}:${key} placeholders`,
      );
    }
  }
});

test("request UI labels are explicitly localized instead of inheriting English", () => {
  for (const locale of guestLocales.filter((value) => value !== "en")) {
    for (const key of localizedRequestKeys) {
      assert.notEqual(
        guestDictionaries[locale][key],
        guestDictionaries.en[key],
        `${locale}:${key} must not fall back to English`,
      );
    }
  }
});

test("every non-English GuestOS label is explicitly localized", () => {
  for (const locale of guestLocales.filter((value) => value !== "en")) {
    for (const [key, value] of Object.entries(guestDictionaries[locale])) {
      assert.notEqual(value, guestDictionaries.en[key], `${locale}:${key} must not fall back to English`);
    }
  }
});

test("request card action labels stay short on mobile", () => {
  for (const locale of guestLocales) {
    assert.ok(
      [...guestDictionaries[locale]["requests.view"]].length <= 8,
      `${locale}:requests.view is too long`,
    );
  }
});
