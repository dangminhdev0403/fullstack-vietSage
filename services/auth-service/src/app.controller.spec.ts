import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./modules/health/health.controller";
import { HealthService } from "./modules/health/health.service";

describe("HealthController", () => {
  it("returns process liveness without querying dependencies", () => {
    const healthService = new HealthService({ $queryRaw: jest.fn() } as never);
    const healthController = new HealthController(healthService);
    const result = healthController.getHealth();

    expect(result.status).toBe("ok");
    expect(result.service).toBe("auth-service");
    expect(typeof result.uptimeSeconds).toBe("number");
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it("returns readiness only when PostgreSQL responds", async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ ready: 1 }]) };
    const healthService = new HealthService(prisma as never);
    const healthController = new HealthController(healthService);

    await expect(healthController.getReadiness()).resolves.toMatchObject({
      status: "ready",
      dependencies: { database: "up" },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns 503 readiness when PostgreSQL is unavailable", async () => {
    const healthService = new HealthService({
      $queryRaw: jest.fn().mockRejectedValue(new Error("database down")),
    } as never);
    const healthController = new HealthController(healthService);

    await expect(healthController.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
