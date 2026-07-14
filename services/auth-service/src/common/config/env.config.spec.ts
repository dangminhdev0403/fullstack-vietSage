import { loadAppConfig, parseCorsOrigins, shouldEnableSwagger } from "./env.config";

const baseEnv = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/vietsage_auth?schema=public",
  NODE_ENV: "development",
  PORT: "3000",
  JWT_ACCESS_SECRET: "access-secret",
  JWT_REFRESH_SECRET: "refresh-secret",
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL: "7d",
};

describe("env config", () => {
  it("parses comma-separated CORS origins with trimming and de-duplication", () => {
    expect(
      parseCorsOrigins(" http://localhost:3000,https://app.example.com,http://localhost:3000 "),
    ).toEqual(["http://localhost:3000", "https://app.example.com"]);
  });

  it("defaults Swagger off in production and on outside production", () => {
    expect(shouldEnableSwagger("production", undefined)).toBe(false);
    expect(shouldEnableSwagger("development", undefined)).toBe(true);
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
