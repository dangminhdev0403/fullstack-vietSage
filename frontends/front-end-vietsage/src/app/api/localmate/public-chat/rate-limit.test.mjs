import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearPublicChatQuota,
  consumePublicChatQuota,
  consumePublicChatQuotas,
  resolvePublicChatRateKey,
} from "./rate-limit.ts";

afterEach(clearPublicChatQuota);

describe("resolvePublicChatRateKey", () => {
  const validToken = "a".repeat(43);

  it("primarily binds to explicit valid session capability token", () => {
    const request = new Request("http://localhost/api/localmate/public-chat", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    const key = resolvePublicChatRateKey(request, validToken);
    assert.equal(key, `session:${validToken}`);
  });

  it("remains stable across different IP addresses when using the same session capability", () => {
    const req1 = new Request("http://localhost/api/localmate/public-chat", {
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    const req2 = new Request("http://localhost/api/localmate/public-chat", {
      headers: { "x-forwarded-for": "203.0.113.99", "x-real-ip": "203.0.113.99" },
    });
    assert.equal(resolvePublicChatRateKey(req1, validToken), resolvePublicChatRateKey(req2, validToken));
  });

  it("ignores an attacker-controlled token header when no server-read token is provided", () => {
    const request = new Request("http://localhost/api/localmate/public-chat", {
      headers: {
        "x-public-localmate-token": validToken,
        "x-forwarded-for": "203.0.113.1",
      },
    });
    assert.equal(resolvePublicChatRateKey(request), "ip:203.0.113.1");
  });

  it("does not parse a raw Cookie header as a trusted session capability", () => {
    const request = new Request("http://localhost/api/localmate/public-chat", {
      headers: {
        cookie: `some_cookie=abc; public_localmate_token=${validToken}; other=xyz`,
        "x-forwarded-for": "203.0.113.1",
      },
    });
    assert.equal(resolvePublicChatRateKey(request), "ip:203.0.113.1");
  });

  it("falls back to normalized trusted IP when session capability is absent or invalid", () => {
    const reqInvalid = new Request("http://localhost/api/localmate/public-chat", {
      headers: { "x-real-ip": "203.0.113.5" },
    });
    assert.equal(resolvePublicChatRateKey(reqInvalid, "too-short"), "ip:203.0.113.5");

    const reqNone = new Request("http://localhost/api/localmate/public-chat", {
      headers: { "x-real-ip": "203.0.113.5" },
    });
    assert.equal(resolvePublicChatRateKey(reqNone), "ip:203.0.113.5");
  });

  it("resists x-forwarded-for client spoofing by prioritizing x-real-ip or edge-appended IP", () => {
    // When client prepends fake IPs: "fake-ip-1, fake-ip-2, real-edge-ip"
    const reqWithRealIp = new Request("http://localhost/api/localmate/public-chat", {
      headers: {
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        "x-real-ip": "203.0.113.10",
      },
    });
    assert.equal(resolvePublicChatRateKey(reqWithRealIp), "ip:203.0.113.10");

    const reqChainOnly = new Request("http://localhost/api/localmate/public-chat", {
      headers: {
        "x-forwarded-for": "1.2.3.4, 198.51.100.22",
      },
    });
    // Takes the last (edge-appended) entry rather than the spoofed first entry
    assert.equal(resolvePublicChatRateKey(reqChainOnly), "ip:198.51.100.22");
  });

  it("normalizes IPv4-mapped IPv6 and strips ports", () => {
    const reqMapped = new Request("http://localhost/api/localmate/public-chat", {
      headers: { "x-real-ip": "::ffff:198.51.100.33" },
    });
    assert.equal(resolvePublicChatRateKey(reqMapped), "ip:198.51.100.33");

    const reqPort = new Request("http://localhost/api/localmate/public-chat", {
      headers: { "x-real-ip": "198.51.100.44:8080" },
    });
    assert.equal(resolvePublicChatRateKey(reqPort), "ip:198.51.100.44");
  });

  it("falls back to ip:unknown when no IP headers are present", () => {
    const reqEmpty = new Request("http://localhost/api/localmate/public-chat");
    assert.equal(resolvePublicChatRateKey(reqEmpty), "ip:unknown");
  });
});

describe("consumePublicChatQuota", () => {
  it("allows twelve requests, blocks the next one, then resets", () => {
    for (let index = 0; index < 12; index += 1) {
      assert.equal(consumePublicChatQuota("client", 1_000).allowed, true);
    }
    assert.equal(consumePublicChatQuota("client", 1_000).allowed, false);
    assert.equal(consumePublicChatQuota("client", 61_000).allowed, true);
  });

  it("isolates different session and IP rate keys", () => {
    for (let index = 0; index < 12; index += 1) {
      assert.equal(consumePublicChatQuota("session:alpha", 1_000).allowed, true);
    }
    assert.equal(consumePublicChatQuota("session:alpha", 1_000).allowed, false);
    assert.equal(consumePublicChatQuota("session:beta", 1_000).allowed, true);
    assert.equal(consumePublicChatQuota("ip:203.0.113.1", 1_000).allowed, true);
  });

  it("enforces both IP and session quotas so rotating tokens cannot bypass the IP limit", () => {
    for (let index = 0; index < 12; index += 1) {
      assert.equal(
        consumePublicChatQuotas(["ip:203.0.113.1", `session:token-${index}`], 1_000).allowed,
        true,
      );
    }
    assert.equal(
      consumePublicChatQuotas(["ip:203.0.113.1", "session:fresh-token"], 1_000).allowed,
      false,
    );
  });
});
