import type { ImportPreviewResult } from "./import.types";
import { ImportService } from "./import.service";

describe("ImportService", () => {
  it("allows atomic imports up to 30 seconds", async () => {
    const adapter = {
      type: "service-catalog",
      supportedModes: ["replace"],
      authorize: jest.fn(),
      commit: jest.fn().mockResolvedValue({ summary: {} }),
    };
    const tx = {};
    const registry = { get: jest.fn().mockReturnValue(adapter) };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new ImportService(registry as never, prisma as never);
    const preview = {
      importType: "service-catalog",
      mode: "replace",
      context: { actorUserId: "user-1" },
      payload: {},
      currentState: {},
      validation: [],
      diff: [],
      summary: {
        create: 0,
        update: 0,
        disable: 0,
        unchanged: 0,
        errors: 0,
        warnings: 0,
        totalEntities: 0,
        byEntityType: {},
      },
    } as any;

    await service.commit(preview);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 30_000 });
  });
});
