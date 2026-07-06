import { ExecutionContext, HttpException, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import { AUTH_RATE_LIMIT_METADATA_KEY } from "./auth-rate-limit.decorator";

function makeContext(ip = "127.0.0.1"): ExecutionContext {
  const handler = () => undefined;
  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {},
        ip,
        socket: {},
      }),
    }),
  } as unknown as ExecutionContext;
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
      JWT_ACCESS_SECRET: "access-secret",
      JWT_REFRESH_SECRET: "refresh-secret",
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
});
