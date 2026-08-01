import test from "node:test";
import assert from "node:assert";
// @ts-expect-error Node strip-types requires explicit extension.
import { parseIntakePayload, omitBlankOptionals } from "./intake-contract.ts";

test("Intake Contract Parsing", async (t) => {
  await t.test("Accept full v2 payload with all optional fields and portrait", () => {
    const raw = {
      schemaVersion: 2,
      transferId: "123e4567-e89b-12d3-a456-426614174000",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "NGUYEN VAN A",
        identityNumber: "012345678912",
        dateOfBirth: "1990-01-01",
        gender: "Nam",
        nationality: "Việt Nam",
        identityIssueDate: "2021-01-01",
        identityExpiryDate: "2041-01-01",
        race: "Kinh",
        residencePlace: "Hà Nội"
      },
      verification: {
        chipAuthenticated: true,
        sodVerified: true
      },
      portrait: {
        mimeType: "image/jpeg",
        base64: Buffer.from("fakeimage").toString("base64")
      }
    };
    const parsed = parseIntakePayload(raw);
    assert.strictEqual(parsed.schemaVersion, 2);
    if (parsed.schemaVersion === 2) {
      assert.strictEqual(parsed.guest.race, "Kinh");
      assert.strictEqual(parsed.portrait?.mimeType, "image/jpeg");
    }
  });

  await t.test("Accept omitted optional fields - v2 payload with just required fields", () => {
    const raw = {
      schemaVersion: 2,
      transferId: "123e4567-e89b-12d3-a456-426614174000",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "NGUYEN VAN A",
        identityNumber: "012345678912"
      }
    };
    const parsed = parseIntakePayload(raw);
    assert.strictEqual(parsed.schemaVersion, 2);
  });

  await t.test("Reject whitespace-only displayName", () => {
    const raw = {
      schemaVersion: 2,
      transferId: "123e4567-e89b-12d3-a456-426614174000",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "   ",
        identityNumber: "012345678912"
      }
    };
    assert.throws(() => parseIntakePayload(raw));
  });

  await t.test("Reject unknown keys (strict mode)", () => {
    const raw = {
      schemaVersion: 2,
      transferId: "123e4567-e89b-12d3-a456-426614174000",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "NGUYEN VAN A",
        identityNumber: "012345678912",
        unknownKey: "value"
      }
    };
    assert.throws(() => parseIntakePayload(raw));
  });

  await t.test("Reject non-JPEG/PNG MIME type (e.g. image/gif)", () => {
    const raw = {
      schemaVersion: 2,
      transferId: "123e4567-e89b-12d3-a456-426614174000",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "NGUYEN VAN A",
        identityNumber: "012345678912"
      },
      portrait: {
        mimeType: "image/gif",
        base64: Buffer.from("fakeimage").toString("base64")
      }
    };
    assert.throws(() => parseIntakePayload(raw));
  });

  await t.test("Reject malformed base64 (not valid base64 chars)", () => {
    const raw = {
      schemaVersion: 2,
      transferId: "123e4567-e89b-12d3-a456-426614174000",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "NGUYEN VAN A",
        identityNumber: "012345678912"
      },
      portrait: {
        mimeType: "image/jpeg",
        base64: "not valid base 64!!! %%"
      }
    };
    assert.throws(() => parseIntakePayload(raw));
  });

  await t.test("Reject decoded portrait over 512 KiB", () => {
    const raw = {
      schemaVersion: 2,
      transferId: "123e4567-e89b-12d3-a456-426614174000",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "NGUYEN VAN A",
        identityNumber: "012345678912"
      },
      portrait: {
        mimeType: "image/jpeg",
        // 512 KiB = 524288 bytes. We need > 524288.
        base64: Buffer.alloc(524289, 'a').toString('base64')
      }
    };
    assert.throws(() => parseIntakePayload(raw));
  });

  await t.test("Accept v1 payload (backward compat - parse as v1 or union)", () => {
    const raw = {
      schemaVersion: 1,
      transferId: "123e4567-e89b-12d3-a456-426614174000",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "NGUYEN VAN A",
        identityNumber: "012345678912"
      },
      verification: {
        chipAuthenticated: true,
        sodVerified: false
      }
    };
    const parsed = parseIntakePayload(raw);
    assert.strictEqual(parsed.schemaVersion, 1);
  });

  await t.test("Optional fields undefined/null/empty produce no row (test the omitBlankOptionals helper or schema transform)", () => {
    const input = { a: "1", b: "", c: null, d: undefined, e: "  " };
    const res = omitBlankOptionals(input);
    assert.deepStrictEqual(res, { a: "1" });
  });

  await t.test("race and residencePlace in guest object are optional strings", () => {
    const raw = {
      schemaVersion: 2,
      transferId: "123e4567-e89b-12d3-a456-426614174000",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "NGUYEN VAN A",
        identityNumber: "012345678912",
        race: "Kinh",
        // residencePlace omitted
      }
    };
    const parsed = parseIntakePayload(raw);
    if (parsed.schemaVersion === 2) {
      assert.strictEqual(parsed.guest.race, "Kinh");
      assert.strictEqual(parsed.guest.residencePlace, undefined);
    }
  });

  await t.test("verification chipAuthenticated and sodVerified are optional booleans (not required)", () => {
    const raw = {
      schemaVersion: 2,
      transferId: "123e4567-e89b-12d3-a456-426614174000",
      capturedAt: "2026-07-31T09:34:32Z",
      guest: {
        displayName: "NGUYEN VAN A",
        identityNumber: "012345678912"
      },
      verification: {
        chipAuthenticated: true
      }
    };
    const parsed = parseIntakePayload(raw);
    if (parsed.schemaVersion === 2) {
      assert.strictEqual(parsed.verification?.chipAuthenticated, true);
      assert.strictEqual(parsed.verification?.sodVerified, undefined);
    }
  });
});
