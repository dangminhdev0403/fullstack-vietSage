import { AppLogger } from "./app-logger.service";
import { winstonInstance } from "./winston.config";

jest.mock("./winston.config", () => ({
  winstonInstance: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockWinston = winstonInstance as jest.Mocked<typeof winstonInstance>;

describe("AppLogger production log levels", () => {
  const originalLogLevel = process.env.LOG_LEVEL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    // Force non-TTY so write() takes the JSON (prod) path — easier to assert
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLogLevel;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
    jest.restoreAllMocks();
  });

  it("keeps actionable logs and makes successful request logs debug-only", () => {
    process.env.NODE_ENV = "production";
    delete process.env.LOG_LEVEL;
    const logger = new AppLogger();

    logger.info("routine event");
    logger.http({ method: "GET", url: "/health", statusCode: 200, durationMs: 1 });
    logger.http({ method: "GET", url: "/missing", statusCode: 404, durationMs: 1 });
    logger.http({ method: "GET", url: "/limited", statusCode: 429, durationMs: 1 });
    logger.http({ method: "GET", url: "/failed", statusCode: 500, durationMs: 1 });

    // prod default = WARN → info/debug suppressed
    const warnCalls = mockWinston.log.mock.calls.filter(([lvl]) => lvl === "warn");
    const errorCalls = mockWinston.log.mock.calls.filter(([lvl]) => lvl === "error");
    const infoCalls = mockWinston.log.mock.calls.filter(([lvl]) => lvl === "info");

    expect(infoCalls).toHaveLength(0);
    expect(warnCalls).toHaveLength(1);  // 429
    expect(errorCalls).toHaveLength(1); // 500

    jest.clearAllMocks();

    process.env.LOG_LEVEL = "debug";
    logger.http({ method: "GET", url: "/missing", statusCode: 404, durationMs: 1 });
    logger.http({ method: "GET", url: "/health", statusCode: 200, durationMs: 1 });

    const debugCalls = mockWinston.log.mock.calls.filter(([lvl]) => lvl === "debug");
    expect(debugCalls).toHaveLength(2);
  });
});
