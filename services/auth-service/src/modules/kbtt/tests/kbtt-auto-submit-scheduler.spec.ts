import { Test, TestingModule } from "@nestjs/testing";
import { KbttAutoSubmitSchedulerService } from "../application/kbtt-auto-submit-scheduler.service";
import { KbttService } from "../application/kbtt.service";
import { KbttRepository } from "../infrastructure/kbtt.repository";

describe("KbttAutoSubmitSchedulerService", () => {
  let scheduler: KbttAutoSubmitSchedulerService;
  let kbttService: Partial<Record<keyof KbttService, jest.Mock>>;
  let repository: Partial<Record<keyof KbttRepository, jest.Mock>>;

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    // Default test time: 12:00 in Asia/Ho_Chi_Minh (05:00 UTC)
    jest.setSystemTime(new Date("2026-09-14T05:00:00.000Z"));
    delete process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH;
    delete process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED;

    kbttService = {
      processStayLifecycleEvents: jest.fn().mockResolvedValue(undefined),
      runDueCooldownHealthProbes: jest.fn().mockResolvedValue(undefined),
      executeAutoSubmitForHotel: jest.fn().mockResolvedValue({ id: "run-1" }),
      getAutoSubmitConfig: jest.fn(),
      updateAutoSubmitConfig: jest.fn(),
    };

    repository = {
      findHotelsForDailyAutoSubmitSweep: jest.fn().mockResolvedValue([
        { hotelId: "hotel-1", autoSubmitTime: null },
        { hotelId: "hotel-2", autoSubmitTime: null },
      ]),
      findDueHotelsForAutoSubmit: jest.fn().mockResolvedValue([
        { hotelId: "hotel-1", autoSubmitTime: null },
        { hotelId: "hotel-2", autoSubmitTime: null },
      ]),
      findDueScheduledRuns: jest.fn().mockResolvedValue([]),
      findHotelsWithPendingErrorDeclarations: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KbttAutoSubmitSchedulerService,
        { provide: KbttService, useValue: kbttService },
        { provide: KbttRepository, useValue: repository },
      ],
    }).compile();

    scheduler = module.get<KbttAutoSubmitSchedulerService>(KbttAutoSubmitSchedulerService);
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH;
    delete process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED;
  });

  it("should skip execution when kill switch is enabled", async () => {
    process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH = "true";

    await scheduler.handleCron();

    expect(repository.findHotelsForDailyAutoSubmitSweep).not.toHaveBeenCalled();
    expect(kbttService.processStayLifecycleEvents).not.toHaveBeenCalled();
    expect(kbttService.executeAutoSubmitForHotel).not.toHaveBeenCalled();
  });

  it("processes pending checkout delivery even without arrival schedules", async () => {
    (repository.findHotelsForDailyAutoSubmitSweep as jest.Mock).mockResolvedValue([]);
    (repository.findDueScheduledRuns as jest.Mock).mockResolvedValue([]);

    await scheduler.handleCron();

    expect(kbttService.processStayLifecycleEvents).toHaveBeenCalledTimes(1);
    expect(kbttService.executeAutoSubmitForHotel).not.toHaveBeenCalled();
  });

  it("should process due hotels at fixed 12:00 and 21:00 Vietnam slots with dryRun=true by default", async () => {
    await scheduler.handleCron();

    expect(repository.findHotelsForDailyAutoSubmitSweep).toHaveBeenCalledTimes(1);
    expect(kbttService.executeAutoSubmitForHotel).toHaveBeenCalledTimes(2);
    expect(kbttService.executeAutoSubmitForHotel).toHaveBeenCalledWith(
      "hotel-1",
      new Date("2026-09-14T05:00:00.000Z"),
      true,
    );

    (kbttService.executeAutoSubmitForHotel as jest.Mock).mockClear();
    jest.setSystemTime(new Date("2026-09-14T14:00:00.000Z")); // 21:00 Vietnam time
    await scheduler.handleCron();
    expect(kbttService.executeAutoSubmitForHotel).toHaveBeenCalledWith(
      "hotel-1",
      new Date("2026-09-14T14:00:00.000Z"),
      true,
    );
  });

  it("should process due hotels with dryRun=false when KBTT_AUTO_SUBMIT_LIVE_ENABLED=true", async () => {
    process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED = "true";

    await scheduler.handleCron();

    expect(kbttService.executeAutoSubmitForHotel).toHaveBeenCalledWith(
      "hotel-1",
      expect.any(Date),
      false, // dryRun false
    );
  });

  it("should isolate errors so one hotel failure does not prevent subsequent hotels", async () => {
    (kbttService.executeAutoSubmitForHotel as jest.Mock)
      .mockRejectedValueOnce(new Error("Network glitch"))
      .mockResolvedValueOnce({ id: "run-2" });

    await scheduler.handleCron();

    expect(kbttService.executeAutoSubmitForHotel).toHaveBeenCalledTimes(2);
    expect(kbttService.executeAutoSubmitForHotel).toHaveBeenLastCalledWith(
      "hotel-2",
      expect.any(Date),
      true,
    );
  });

  it("queries connected hotels with autoSubmitEnabled=true without custom autoSubmitTime filter", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new KbttRepository({
      kbttHotelConnection: { findMany },
    } as never);

    await repository.findHotelsForDailyAutoSubmitSweep();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          autoSubmitEnabled: true,
          status: "CONNECTED",
        },
      }),
    );
  });

  it("takes over an expired lease atomically", async () => {
    const expired = {
      id: "run-1",
      hotelId: "hotel-1",
      scheduledFor: new Date("2026-09-15T21:30:00.000Z"),
      status: "RUNNING",
      leaseExpiresAt: new Date(0),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce({
        ...expired,
        leaseExpiresAt: new Date("2026-09-15T21:40:00.000Z"),
      });
    const repository = new KbttRepository({
      kbttAutoSubmitRun: { findUnique, updateMany },
    } as never);

    await expect(
      repository.claimAutoSubmitRunLease("hotel-1", expired.scheduledFor, true),
    ).resolves.toMatchObject({ id: "run-1" });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "run-1",
          status: "RUNNING",
          leaseExpiresAt: { lte: expect.any(Date) },
        }),
      }),
    );
  });

  it("proves several due hotels execute with bounded concurrency so a slow hotel does not block others, while isolating failures", async () => {
    const events: string[] = [];
    let resolveHuge: () => void = () => {};
    const hugePromise = new Promise<void>((resolve) => {
      resolveHuge = resolve;
    });

    (repository.findHotelsForDailyAutoSubmitSweep as jest.Mock).mockResolvedValue([
      { hotelId: "hotel-huge", autoSubmitTime: null },
      { hotelId: "hotel-fast-1", autoSubmitTime: null },
      { hotelId: "hotel-failing", autoSubmitTime: null },
      { hotelId: "hotel-fast-2", autoSubmitTime: null },
    ]);

    (kbttService.executeAutoSubmitForHotel as jest.Mock).mockImplementation(
      async (hotelId: string) => {
        events.push(`start:${hotelId}`);
        if (hotelId === "hotel-huge") {
          await hugePromise;
          events.push("finish:hotel-huge");
          return { id: "run-huge" };
        }
        if (hotelId === "hotel-failing") {
          events.push("fail:hotel-failing");
          throw new Error("Hotel failure");
        }
        events.push(`finish:${hotelId}`);
        return { id: `run-${hotelId}` };
      },
    );

    const cronPromise = scheduler.handleCron();

    // Give microtasks time to start initial concurrent batch
    await new Promise((r) => setImmediate(r));

    // Because concurrency > 1, hotel-fast-1 must have started and finished even though hotel-huge is still running!
    expect(events).toContain("start:hotel-huge");
    expect(events).toContain("start:hotel-fast-1");
    expect(events).toContain("finish:hotel-fast-1");

    // Now resolve hotel-huge so handleCron can finish
    resolveHuge();
    await cronPromise;

    expect(events).toContain("finish:hotel-huge");
    expect(events).toContain("finish:hotel-fast-2");
    expect(events).toContain("fail:hotel-failing");
    expect(kbttService.executeAutoSubmitForHotel).toHaveBeenCalledTimes(4);
  });

  it("due continuation and 10m catch-up runs execute when due and duplicate cron ticks cannot run them twice (test 4)", async () => {
    jest.setSystemTime(new Date("2026-09-14T05:10:00.000Z")); // 12:10 Vietnam time
    const continuationRun = {
      id: "run-cont-1",
      hotelId: "hotel-cont",
      scheduledFor: new Date("2026-09-14T05:10:00.000Z"),
      status: "RUNNING",
      leaseExpiresAt: new Date("2026-09-14T05:09:59.000Z"),
      dryRun: true,
      summaryJson: { trigger: "CATCH_UP_10M" },
    };

    (repository.findHotelsForDailyAutoSubmitSweep as jest.Mock).mockResolvedValue([]);
    (repository.findDueScheduledRuns as jest.Mock) = jest.fn().mockResolvedValue([continuationRun]);

    let executionCount = 0;
    (kbttService.executeAutoSubmitForHotel as jest.Mock).mockImplementation(async () => {
      executionCount++;
      return { id: "run-cont-1" };
    });

    await scheduler.handleCron();
    expect(kbttService.executeAutoSubmitForHotel).toHaveBeenCalledWith(
      "hotel-cont",
      continuationRun.scheduledFor,
      true,
    );
    expect(executionCount).toBe(1);

    // Second tick when already claimed or no longer due
    (repository.findDueScheduledRuns as jest.Mock).mockResolvedValue([]);
    await scheduler.handleCron();
    expect(executionCount).toBe(1);
  });

  it("does not run daily sweeps or retired 15m error scans outside 12:00 and 21:00 while still checking cooldown probes", async () => {
    jest.setSystemTime(new Date("2026-09-17T03:00:00.000Z")); // 10:00 in Vietnam (+7)
    (repository.findDueScheduledRuns as jest.Mock).mockResolvedValue([]);

    await scheduler.handleCron();

    expect(kbttService.runDueCooldownHealthProbes).toHaveBeenCalledTimes(1);
    expect(repository.findHotelsForDailyAutoSubmitSweep).not.toHaveBeenCalled();
    expect(repository.findHotelsWithPendingErrorDeclarations).not.toHaveBeenCalled();
    expect(kbttService.executeAutoSubmitForHotel).not.toHaveBeenCalled();
  });
});
