import { AppLogger } from "./app-logger.service";

describe("AppLogger HTTP completion logging", () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  afterEach(() => {
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
    jest.restoreAllMocks();
  });

  it("suppresses successful HTTP completion logs unless debug logging is enabled", () => {
    delete process.env.LOG_LEVEL;
    const write = jest.spyOn(console, "log").mockImplementation(() => undefined);

    new AppLogger().http({ method: "GET", url: "/health", statusCode: 200, durationMs: 1 });

    expect(write).not.toHaveBeenCalled();
  });
});
