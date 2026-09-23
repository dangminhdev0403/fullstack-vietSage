import { AppLogger } from "./app-logger.service";

describe("AppLogger production log levels", () => {
  const originalLogLevel = process.env.LOG_LEVEL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it("keeps actionable logs and makes successful request logs debug-only", () => {
    process.env.NODE_ENV = "production";
    delete process.env.LOG_LEVEL;
    const info = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const logger = new AppLogger();

    logger.info("routine event");
    logger.http({ method: "GET", url: "/health", statusCode: 200, durationMs: 1 });
    logger.http({ method: "GET", url: "/missing", statusCode: 404, durationMs: 1 });
    logger.http({ method: "GET", url: "/limited", statusCode: 429, durationMs: 1 });
    logger.http({ method: "GET", url: "/failed", statusCode: 500, durationMs: 1 });

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);

    process.env.LOG_LEVEL = "debug";
    logger.http({ method: "GET", url: "/missing", statusCode: 404, durationMs: 1 });
    logger.http({ method: "GET", url: "/health", statusCode: 200, durationMs: 1 });
    expect(info).toHaveBeenCalledTimes(2);
  });
});
