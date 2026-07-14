import type { ExecutionContext } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import type { Request } from "express";
import { LocalAuthGuard } from "../../infrastructure/guards/local-auth.guard";

describe("LocalAuthGuard", () => {
  it("rejects a missing login body as a validation error before Passport", async () => {
    const request = { body: {} } as Request;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;
    const guard = new LocalAuthGuard();
    let thrown: unknown;
    let pendingResult: Promise<unknown> | undefined;

    try {
      const result = guard.canActivate(context);
      if (result instanceof Promise) pendingResult = result;
    } catch (error) {
      thrown = error;
    }

    await pendingResult?.catch(() => undefined);
    expect(thrown).toBeInstanceOf(BadRequestException);
  });
});
