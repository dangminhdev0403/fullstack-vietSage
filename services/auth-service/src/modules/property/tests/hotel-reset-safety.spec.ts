import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { HotelCoreRepository } from "../infrastructure/repositories/hotel-core.repository";
import { HotelsService } from "../application/hotels.service";

// Simulate row-lock lifetime and rollback, without claiming database integration proof.
function harness(count = 1) {
  let settings: Record<string, unknown> = {
    color: "blue",
    operationalResetCount: count,
    lastOperationalResetAt: "original",
  };
  let tail = Promise.resolve();
  const deletes = jest.fn().mockResolvedValue({ count: 1 });
  const update = jest.fn();
  const lock = jest.fn();
  const prisma = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      let release!: () => void;
      let locked = false;
      let staged = settings;
      const tx: any = new Proxy(
        {
          $queryRaw: async (sql: TemplateStringsArray, id: string) => {
            expect(sql.join("?")).toContain('FROM "Hotel" WHERE id = ? FOR UPDATE');
            expect(id).toBe("hotel-1");
            const previous = tail;
            tail = new Promise<void>((resolve) => {
              release = resolve;
            });
            await previous;
            locked = true;
            staged = settings;
            lock();
            return [{ id }];
          },
          hotel: {
            findFirst: jest.fn(async ({ where }) => {
              expect(locked).toBe(true);
              if (where.tenantId && !where.tenantId.in.includes("tenant-1")) return null;
              return { id: "hotel-1", brandSettings: staged };
            }),
            update: async ({ data }) => {
              expect(locked).toBe(true);
              update(data);
              if (data.brandSettings !== undefined) staged = data.brandSettings;
              return { id: "hotel-1", brandSettings: staged };
            },
          },
        },
        {
          get(target, key) {
            if (key in target) return target[key];
            return {
              deleteMany: async (args: unknown) => {
                expect(locked).toBe(true);
                expect(JSON.stringify(args)).toContain("hotel-1");
                return deletes(args);
              },
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            };
          },
        },
      );
      try {
        const result = await callback(tx);
        settings = staged;
        return result;
      } finally {
        if (locked) release();
      }
    },
  };
  return {
    repository: new HotelCoreRepository(prisma as never),
    deletes,
    update,
    lock,
    settings: () => settings,
  };
}

describe("hotel operational reset safety", () => {
  it("rejects exhausted quota before any destructive work", async () => {
    const h = harness(2);
    await expect(h.repository.resetHotelOperationalData("hotel-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.deletes).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it.each([
    {},
    null,
    { color: "red" },
    {
      operationalResetCount: 0,
      lastOperationalResetAt: "forged",
      color: "red",
    },
  ])("preserves server metadata for profile settings %j", async (settings) => {
    const h = harness(2);
    await h.repository.updateHotel("hotel-1", {
      brandSettings: settings === null ? Prisma.JsonNull : settings,
    });
    expect(h.settings()).toMatchObject({
      operationalResetCount: 2,
      lastOperationalResetAt: "original",
    });
    expect(h.settings().color).toBe(settings?.color);
  });

  it("does not introduce forged metadata when none exists", async () => {
    const h = harness();
    delete h.settings().operationalResetCount;
    delete h.settings().lastOperationalResetAt;
    await h.repository.updateHotel("hotel-1", {
      brandSettings: { operationalResetCount: 0, lastOperationalResetAt: "forged" },
    });
    expect(h.settings()).toEqual({});
  });

  it("serializes two resets competing for the final allowance", async () => {
    const h = harness(1);
    const results = await Promise.allSettled([
      h.repository.resetHotelOperationalData("hotel-1"),
      h.repository.resetHotelOperationalData("hotel-1"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(h.settings().operationalResetCount).toBe(2);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("preserves a concurrent reset increment when profile settings are replaced", async () => {
    const h = harness(0);
    await Promise.all([
      h.repository.resetHotelOperationalData("hotel-1"),
      h.repository.updateHotelScoped("hotel-1", ["tenant-1"], { brandSettings: Prisma.JsonNull }),
    ]);
    expect(h.settings().operationalResetCount).toBe(1);
    expect(h.settings().lastOperationalResetAt).not.toBe("original");
  });

  it("propagates deletion failure without committing quota and permits retry", async () => {
    const h = harness(1);
    h.deletes.mockRejectedValueOnce(new Error("delete failed"));
    await expect(h.repository.resetHotelOperationalData("hotel-1")).rejects.toThrow(
      "delete failed",
    );
    expect(h.settings().operationalResetCount).toBe(1);
    expect(h.update).not.toHaveBeenCalled();
    await expect(h.repository.resetHotelOperationalData("hotel-1")).resolves.toEqual({
      operationalResetCount: 2,
      remainingResets: 0,
    });
  });

  it("propagates counter-write failure within the same transaction", async () => {
    const h = harness(1);
    h.update.mockImplementationOnce(() => {
      throw new Error("write failed");
    });
    await expect(h.repository.resetHotelOperationalData("hotel-1")).rejects.toThrow("write failed");
    expect(h.settings().operationalResetCount).toBe(1);
  });

  it("allows super-admin resets beyond quota while preserving unrelated settings", async () => {
    const h = harness(2);
    await expect(
      h.repository.resetHotelOperationalData("hotel-1", { unlimited: true }),
    ).resolves.toEqual({ operationalResetCount: 3, remainingResets: 0 });
    expect(h.settings().color).toBe("blue");
  });

  it("denies cross-tenant repository reset and profile writes before mutation", async () => {
    const h = harness();
    await expect(
      h.repository.resetHotelOperationalData("hotel-1", { tenantIds: ["other"] }),
    ).rejects.toThrow();
    await expect(
      h.repository.updateHotelScoped("hotel-1", ["other"], { brandSettings: {} }),
    ).resolves.toBeNull();
    expect(h.deletes).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  function serviceHarness(superAdmin = false) {
    const repository = {
      resetHotelOperationalData: jest
        .fn()
        .mockResolvedValue({ operationalResetCount: 3, remainingResets: 0 }),
    };
    const access = {
      loadActorContext: jest.fn().mockResolvedValue({
        isSuperAdmin: superAdmin,
        isTenantOwner: !superAdmin,
        tenantIds: new Set(["tenant-1"]),
      }),
      assertHotelAccess: jest.fn().mockResolvedValue({ id: "hotel-1" }),
    };
    const service = new HotelsService(
      repository as never,
      {} as never,
      access as never,
      {} as never,
      { info: jest.fn() } as never,
    );
    return { service, repository, access };
  }

  it("passes tenant scope and restricted quota policy to the transaction", async () => {
    const h = serviceHarness();
    await h.service.resetOperationalData("actor", "role", "hotel-1");
    expect(h.repository.resetHotelOperationalData).toHaveBeenCalledWith("hotel-1", {
      unlimited: false,
      tenantIds: ["tenant-1"],
    });
  });

  it("retains the super-admin HTTP result shape and unlimited policy", async () => {
    const h = serviceHarness(true);
    expect(await h.service.resetOperationalData("actor", "role", "hotel-1")).toEqual({
      hotelId: "hotel-1",
      operationalResetCount: 3,
      remainingResets: 999,
      message: expect.any(String),
    });
    expect(h.repository.resetHotelOperationalData).toHaveBeenCalledWith("hotel-1", {
      unlimited: true,
      tenantIds: undefined,
    });
  });

  it("stops service reset and profile mutation after cross-tenant access denial", async () => {
    const h = serviceHarness();
    h.access.assertHotelAccess.mockRejectedValue(new ForbiddenException());
    await expect(h.service.resetOperationalData("actor", "role", "hotel-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      h.service.updateHotel("actor", "role", "hotel-1", { brandSettings: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.repository.resetHotelOperationalData).not.toHaveBeenCalled();
  });
});
