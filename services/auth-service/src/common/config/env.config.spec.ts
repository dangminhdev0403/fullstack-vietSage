import { loadAppConfig, parseCorsOrigins, shouldEnableSwagger } from "./env.config";

const baseEnv = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/vietsage_auth?schema=public",
  NODE_ENV: "development",
  PORT: "3000",
  JWT_ACCESS_SECRET: "test-access-secret-with-32-characters",
  JWT_REFRESH_SECRET: "test-refresh-secret-with-32-characters",
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL: "7d",
};

describe("env config", () => {
  it("parses comma-separated CORS origins with trimming and de-duplication", () => {
    expect(
      parseCorsOrigins(" http://localhost:3000,https://app.example.com,http://localhost:3000 "),
    ).toEqual(["http://localhost:3000", "https://app.example.com"]);
  });

  it("defaults Swagger off in every environment", () => {
    expect(shouldEnableSwagger("production", undefined)).toBe(false);
    expect(shouldEnableSwagger("development", undefined)).toBe(false);
  });

  it("allows Swagger to be explicitly enabled in production", () => {
    expect(shouldEnableSwagger("production", "true")).toBe(true);
  });

  it("loads CORS and auth rate limit config", () => {
    const config = loadAppConfig({
      ...baseEnv,
      CORS_ORIGINS: "http://localhost:3000,https://app.example.com",
      AUTH_LOGIN_RATE_LIMIT_TTL_SECONDS: "30",
      AUTH_LOGIN_RATE_LIMIT_LIMIT: "5",
      AUTH_REFRESH_RATE_LIMIT_TTL_SECONDS: "45",
      AUTH_REFRESH_RATE_LIMIT_LIMIT: "12",
    });

    expect(config.corsOrigins).toEqual(["http://localhost:3000", "https://app.example.com"]);
    expect(config.rateLimits.login).toEqual({ ttlSeconds: 30, limit: 5 });
    expect(config.rateLimits.refresh).toEqual({ ttlSeconds: 45, limit: 12 });
  });

  it("loads an explicit trusted proxy allowlist and defaults to none", () => {
    expect(loadAppConfig(baseEnv).trustedProxies).toEqual([]);
    expect(
      loadAppConfig({ ...baseEnv, AUTH_TRUSTED_PROXIES: " 10.0.0.8,10.0.0.9,10.0.0.8 " })
        .trustedProxies,
    ).toEqual(["10.0.0.8", "10.0.0.9"]);
  });

  it.each([
    ["JWT_ACCESS_SECRET", "short-secret"],
    ["JWT_REFRESH_SECRET", "short-secret"],
    ["JWT_ACCESS_SECRET", "replace-with-access-secret-at-least-32-characters"],
    ["JWT_REFRESH_SECRET", "change-me-refresh-secret-at-least-32-characters"],
  ])("rejects weak or placeholder %s values", (name, value) => {
    expect(() =>
      loadAppConfig({
        ...baseEnv,
        NODE_ENV: "production",
        [name]: value,
      }),
    ).toThrow(name);
  });

  it.each([
    ["AUTHZ_ENFORCEMENT_ENABLED", "false"],
    ["AUTHZ_STRICT_MODE", "false"],
  ])("rejects production with %s disabled", (name, value) => {
    expect(() =>
      loadAppConfig({
        ...baseEnv,
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: "a-secure-access-secret-with-32-characters",
        JWT_REFRESH_SECRET: "a-secure-refresh-secret-with-32-characters",
        [name]: value,
      }),
    ).toThrow(name);
  });

  it("defaults request realtime off with a 60 second ticket TTL", () => {
    const config = loadAppConfig(baseEnv);
    expect(config.requestRealtime).toEqual({
      enabled: false,
      ticketSecret: null,
      ticketTtlSeconds: 60,
      audience: "request-realtime",
    });
  });

  it.each([undefined, "", "short-secret"])(
    "rejects enabled request realtime with a missing or weak ticket secret: %p",
    (ticketSecret) => {
      expect(() =>
        loadAppConfig({
          ...baseEnv,
          REQUEST_REALTIME_ENABLED: "true",
          REQUEST_REALTIME_TICKET_SECRET: ticketSecret,
        }),
      ).toThrow("REQUEST_REALTIME_TICKET_SECRET");
    },
  );

  it("rejects a non-positive request realtime ticket TTL", () => {
    expect(() =>
      loadAppConfig({
        ...baseEnv,
        REQUEST_REALTIME_TICKET_TTL_SECONDS: "0",
      }),
    ).toThrow("REQUEST_REALTIME_TICKET_TTL_SECONDS");
  });
});
