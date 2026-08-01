import { ExecutionContext, HttpException, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import { AUTH_RATE_LIMIT_METADATA_KEY } from "./auth-rate-limit.decorator";

function makeContext(
  ip = "127.0.0.1",
  headers: Record<string, string | string[] | undefined> = {},
): ExecutionContext {
  const handler = () => undefined;
  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        ip,
        socket: {},
      }),
    }),
  } as unknown as ExecutionContext;
}

function expectHttpStatus(action: () => unknown, status: HttpStatus): void {
  try {
    action();
    throw new Error("Expected HttpException");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(status);
  }
}

describe("AuthRateLimitGuard", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    process.env = {
      ...envBackup,
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/vietsage_auth?schema=public",
      NODE_ENV: "test",
      PORT: "3000",
      JWT_ACCESS_SECRET: "test-access-secret-with-32-characters",
      JWT_REFRESH_SECRET: "test-refresh-secret-with-32-characters",
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL: "7d",
      AUTH_LOGIN_RATE_LIMIT_TTL_SECONDS: "60",
      AUTH_LOGIN_RATE_LIMIT_LIMIT: "2",
    };
  });

  afterEach(() => {
    process.env = envBackup;
    jest.useRealTimers();
  });

  it("blocks requests after the configured limit", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockImplementation((metadataKey) => {
      return metadataKey === AUTH_RATE_LIMIT_METADATA_KEY ? "login" : undefined;
    });
    const guard = new AuthRateLimitGuard(reflector);
    const context = makeContext();

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({ status: HttpStatus.TOO_MANY_REQUESTS }),
    );
  });

  it("resets a bucket after the ttl expires", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockImplementation((metadataKey) => {
      return metadataKey === AUTH_RATE_LIMIT_METADATA_KEY ? "login" : undefined;
    });
    const guard = new AuthRateLimitGuard(reflector);
    const context = makeContext();

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);

    jest.setSystemTime(new Date("2026-01-01T00:01:01.000Z"));

    expect(guard.canActivate(context)).toBe(true);
  });

  it("applies the login limit to change-password requests", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockImplementation((metadataKey) => {
      return metadataKey === AUTH_RATE_LIMIT_METADATA_KEY ? "change-password" : undefined;
    });
    const guard = new AuthRateLimitGuard(reflector);
    const context = makeContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it("ignores spoofed forwarded addresses when the peer is not a trusted proxy", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockReturnValue("login");
    const guard = new AuthRateLimitGuard(reflector);

    expect(
      guard.canActivate(makeContext("203.0.113.10", { "x-forwarded-for": "198.51.100.1" })),
    ).toBe(true);
    expect(
      guard.canActivate(makeContext("203.0.113.10", { "x-forwarded-for": "198.51.100.2" })),
    ).toBe(true);
    expect(() =>
      guard.canActivate(makeContext("203.0.113.10", { "x-forwarded-for": "198.51.100.3" })),
    ).toThrow(HttpException);
  });

  it("does not trust a private peer unless deployment explicitly allows it", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockReturnValue("login");
    const guard = new AuthRateLimitGuard(reflector);

    expect(guard.canActivate(makeContext("10.0.0.8", { "x-forwarded-for": "198.51.100.1" }))).toBe(
      true,
    );
    expect(guard.canActivate(makeContext("10.0.0.8", { "x-forwarded-for": "198.51.100.2" }))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(makeContext("10.0.0.8", { "x-forwarded-for": "198.51.100.3" })),
    ).toThrow(HttpException);
  });

  it("selects the first untrusted address from the right of a configured proxy chain", () => {
    process.env.AUTH_TRUSTED_PROXIES = "10.0.0.8,10.0.0.9";
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockReturnValue("login");
    const guard = new AuthRateLimitGuard(reflector);

    expect(
      guard.canActivate(makeContext("10.0.0.9", { "x-forwarded-for": "198.51.100.1, 10.0.0.8" })),
    ).toBe(true);
    expect(
      guard.canActivate(
        makeContext("10.0.0.9", { "x-forwarded-for": "203.0.113.77, 198.51.100.1, 10.0.0.8" }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        makeContext("10.0.0.9", { "x-forwarded-for": "192.0.2.44, 198.51.100.1, 10.0.0.8" }),
      ),
    ).toThrow(HttpException);
  });

  it("removes expired buckets while processing new clients", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockReturnValue("login");
    const guard = new AuthRateLimitGuard(reflector);

    expect(guard.canActivate(makeContext("203.0.113.1"))).toBe(true);
    jest.setSystemTime(new Date("2026-01-01T00:01:01.000Z"));
    expect(guard.canActivate(makeContext("203.0.113.2"))).toBe(true);

    expect((guard as unknown as { buckets: Map<string, unknown> }).buckets.size).toBe(1);
  });

  it("rejects a new client at capacity without resetting an active bucket", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockReturnValue("login");
    const guard = new AuthRateLimitGuard(reflector);
    const buckets = (
      guard as unknown as {
        buckets: Map<string, { count: number; resetAt: number }>;
      }
    ).buckets;
    const resetAt = Date.now() + 60_000;
    buckets.set("login:203.0.113.1", { count: 2, resetAt });
    for (let index = 1; index < 10_000; index += 1) {
      buckets.set(`login:198.51.100.${index}`, { count: 1, resetAt });
    }

    expectHttpStatus(
      () => guard.canActivate(makeContext("192.0.2.1")),
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expectHttpStatus(
      () => guard.canActivate(makeContext("203.0.113.1")),
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(buckets.get("login:203.0.113.1")).toEqual({ count: 2, resetAt });
  });

  it("reuses an expired client bucket while at capacity", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockReturnValue("login");
    const guard = new AuthRateLimitGuard(reflector);
    const buckets = (
      guard as unknown as {
        buckets: Map<string, { count: number; resetAt: number }>;
      }
    ).buckets;
    const now = Date.now();
    for (let index = 0; index < 9_999; index += 1) {
      buckets.set(`login:active-${index}`, { count: 1, resetAt: now + 60_000 });
    }
    buckets.set("login:203.0.113.1", { count: 2, resetAt: now - 1 });

    expect(guard.canActivate(makeContext("203.0.113.1"))).toBe(true);
  });

  it("eventually cleans expired buckets after an active cleanup batch", () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, "get").mockReturnValue("login");
    const guard = new AuthRateLimitGuard(reflector);
    const buckets = (
      guard as unknown as {
        buckets: Map<string, { count: number; resetAt: number }>;
      }
    ).buckets;
    const now = Date.now();
    for (let index = 0; index < 100; index += 1) {
      buckets.set(`login:active-${index}`, { count: 1, resetAt: now + 60_000 });
    }
    buckets.set("login:expired", { count: 1, resetAt: now - 1 });

    expect(guard.canActivate(makeContext("203.0.113.1"))).toBe(true);
    expect(guard.canActivate(makeContext("203.0.113.2"))).toBe(true);

    expect(buckets.has("login:expired")).toBe(false);
  });
});
