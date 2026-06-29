import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./modules/health/health.controller";
import { HealthService } from "./modules/health/health.service";

describe("HealthController", () => {
  let healthController: HealthController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    healthController = app.get<HealthController>(HealthController);
  });

  it("returns service health data", () => {
    const result = healthController.getHealth();

    expect(result.status).toBe("ok");
    expect(result.service).toBe("auth-service");
    expect(typeof result.uptimeSeconds).toBe("number");
    expect(result.timestamp).toEqual(expect.any(String));
  });
});
