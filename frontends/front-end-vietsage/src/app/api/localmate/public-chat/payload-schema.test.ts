import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires explicit TypeScript extension
import { payloadSchema } from "./payload-schema.ts";

test("payloadSchema accepts history entries longer than 500 characters and truncates to 1000", () => {
  const longReply = "Dạ, em gợi ý vài điểm nổi bật ở Hà Nội:\n" + "- Điểm A: ".repeat(60) + " rất đẹp.";
  assert.ok(longReply.length > 500, "Ensure test reply exceeds 500 characters");

  const input = {
    message: "Có gì hay ở làng gốm Bát Tràng?",
    location: "Hà Nội",
    language: "vi",
    history: [
      {
        role: "localmate",
        text: longReply,
      },
    ],
  };

  const parsed = payloadSchema.safeParse(input);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.history.length, 1);
    assert.equal(parsed.data.history[0].role, "localmate");
    assert.ok(parsed.data.history[0].text.length <= 1000);
  }
});

test("payloadSchema bounds history length to the last 8 entries", () => {
  const historyEntries = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? ("guest" as const) : ("localmate" as const),
    text: `Message ${i}`,
  }));

  const input = {
    message: "Tiếp tục tư vấn",
    location: "Hà Nội",
    history: historyEntries,
  };

  const parsed = payloadSchema.safeParse(input);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.history.length, 8);
    assert.equal(parsed.data.history[0].text, "Message 4");
    assert.equal(parsed.data.history[7].text, "Message 11");
  }
});

test("payloadSchema rejects invalid message or oversized payload", () => {
  assert.equal(payloadSchema.safeParse({ message: "" }).success, false);
  assert.equal(payloadSchema.safeParse({ message: "   " }).success, false);
  assert.equal(payloadSchema.safeParse({ message: "a".repeat(2_001) }).success, false);
});

test("payloadSchema accepts all 6 supported locales and defaults to vi", () => {
  const supported = ["vi", "en", "zh", "ko", "ru", "hi"] as const;
  for (const lang of supported) {
    const parsed = payloadSchema.safeParse({
      message: "Tư vấn du lịch",
      location: "Hà Nội",
      language: lang,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.language, lang);
    }
  }

  const defaulted = payloadSchema.safeParse({
    message: "Tư vấn du lịch",
    location: "Hà Nội",
  });
  assert.equal(defaulted.success, true);
  if (defaulted.success) {
    assert.equal(defaulted.data.language, "vi");
  }
});
