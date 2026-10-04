import { BadRequestException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { StripeSignatureVerifier } from "../infrastructure/stripe-signature.verifier";

describe("StripeSignatureVerifier", () => {
  let verifier: StripeSignatureVerifier;
  const secret = "whsec_test_secret_key_1234567890abcdef";

  beforeEach(() => {
    verifier = new StripeSignatureVerifier();
  });

  const createValidHeader = (payload: string, timestamp: number, webhookSecret = secret): string => {
    const signedPayload = `${timestamp}.${payload}`;
    const sig = createHmac("sha256", webhookSecret).update(signedPayload, "utf8").digest("hex");
    return `t=${timestamp},v1=${sig}`;
  };

  it("verifies a valid signature with correct timestamp", () => {
    const rawBody = JSON.stringify({ id: "evt_123", type: "checkout.session.completed" });
    const now = Math.floor(Date.now() / 1000);
    const header = createValidHeader(rawBody, now);

    const result = verifier.verify({
      rawBody,
      signatureHeader: header,
      secret,
      currentTimestamp: now,
    });

    expect(result.verified).toBe(true);
    expect(result.timestamp).toBe(now);
  });

  it("works with Buffer rawBody", () => {
    const rawBody = Buffer.from(JSON.stringify({ id: "evt_123", type: "checkout.session.completed" }), "utf8");
    const now = Math.floor(Date.now() / 1000);
    const header = createValidHeader(rawBody.toString("utf8"), now);

    const result = verifier.verify({
      rawBody,
      signatureHeader: header,
      secret,
      currentTimestamp: now,
    });

    expect(result.verified).toBe(true);
  });

  it("rejects when timestamp drift exceeds 300 seconds into the past", () => {
    const rawBody = JSON.stringify({ id: "evt_stale" });
    const now = 1700000000;
    const staleTimestamp = now - 301;
    const header = createValidHeader(rawBody, staleTimestamp);

    expect(() =>
      verifier.verify({
        rawBody,
        signatureHeader: header,
        secret,
        currentTimestamp: now,
        toleranceSeconds: 300,
      }),
    ).toThrow(BadRequestException);
  });

  it("rejects when timestamp drift exceeds 300 seconds into the future", () => {
    const rawBody = JSON.stringify({ id: "evt_future" });
    const now = 1700000000;
    const futureTimestamp = now + 301;
    const header = createValidHeader(rawBody, futureTimestamp);

    expect(() =>
      verifier.verify({
        rawBody,
        signatureHeader: header,
        secret,
        currentTimestamp: now,
        toleranceSeconds: 300,
      }),
    ).toThrow(BadRequestException);
  });

  it("rejects missing signature header", () => {
    expect(() =>
      verifier.verify({
        rawBody: "payload",
        signatureHeader: undefined,
        secret,
      }),
    ).toThrow(BadRequestException);
  });

  it("rejects malformed header without timestamp", () => {
    expect(() =>
      verifier.verify({
        rawBody: "payload",
        signatureHeader: "v1=abc123",
        secret,
      }),
    ).toThrow(BadRequestException);
  });

  it("rejects malformed header without v1 signature", () => {
    expect(() =>
      verifier.verify({
        rawBody: "payload",
        signatureHeader: `t=${Math.floor(Date.now() / 1000)}`,
        secret,
      }),
    ).toThrow(BadRequestException);
  });

  it("rejects invalid signature HMAC", () => {
    const rawBody = JSON.stringify({ id: "evt_123" });
    const now = Math.floor(Date.now() / 1000);
    const header = `t=${now},v1=0000000000000000000000000000000000000000000000000000000000000000`;

    expect(() =>
      verifier.verify({
        rawBody,
        signatureHeader: header,
        secret,
        currentTimestamp: now,
      }),
    ).toThrow(BadRequestException);
  });

  it("verifies when multiple v1 signatures exist (key rotation scenario)", () => {
    const rawBody = JSON.stringify({ id: "evt_rotated" });
    const now = Math.floor(Date.now() / 1000);
    const validHeader = createValidHeader(rawBody, now, secret);
    const [, validSig] = validHeader.split(",");
    const header = `t=${now},v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef,${validSig}`;

    const result = verifier.verify({
      rawBody,
      signatureHeader: header,
      secret,
      currentTimestamp: now,
    });

    expect(result.verified).toBe(true);
  });

  it("never leaks webhook secret in error messages", () => {
    const rawBody = "tampered body";
    const now = Math.floor(Date.now() / 1000);
    const header = createValidHeader("original body", now);

    try {
      verifier.verify({
        rawBody,
        signatureHeader: header,
        secret,
        currentTimestamp: now,
      });
      fail("Expected exception");
    } catch (err: any) {
      expect(err.message).not.toContain(secret);
    }
  });
});
