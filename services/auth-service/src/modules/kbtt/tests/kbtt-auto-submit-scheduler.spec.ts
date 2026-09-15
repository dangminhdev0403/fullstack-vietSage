import { Test, TestingModule } from "@nestjs/testing";
import { KbttAutoSubmitSchedulerService } from "../application/kbtt-auto-submit-scheduler.service";
import { KbttService } from "../application/kbtt.service";
import { KbttRepository } from "../infrastructure/kbtt.repository";

describe("KbttAutoSubmitSchedulerService", () => {
  let scheduler: KbttAutoSubmitSchedulerService;
  let kbttService: Partial<Record<keyof KbttService, jest.Mock>>;
  let repository: Partial<Record<keyof KbttRepository, jest.Mock>>;

  beforeEach(async () => {
    delete process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH;
    delete process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED;

    kbttService = {
      executeAutoSubmitForHotel: jest.fn().mockResolvedValue({ id: "run-1" }),
      getAutoSubmitConfig: jest.fn(),
      updateAutoSubmitConfig: jest.fn(),
    };

    repository = {
      findDueHotelsForAutoSubmit: jest.fn().mockResolvedValue([
        { hotelId: "hotel-1", autoSubmitTime: "04:30" },
        { hotelId: "hotel-2", autoSubmitTime: "04:30" },
      ]),
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
    delete process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH;
    delete process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED;
  });

  it("should skip execution when kill switch is enabled", async () => {
    process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH = "true";

    await scheduler.handleCron();

    expect(repository.findDueHotelsForAutoSubmit).not.toHaveBeenCalled();
    expect(kbttService.executeAutoSubmitForHotel).not.toHaveBeenCalled();
  });

  it("should process due hotels with dryRun=true by default", async () => {
    await scheduler.handleCron();

    expect(repository.findDueHotelsForAutoSubmit).toHaveBeenCalled();
    expect(kbttService.executeAutoSubmitForHotel).toHaveBeenCalledTimes(2);
    expect(kbttService.executeAutoSubmitForHotel).toHaveBeenCalledWith(
      "hotel-1",
      expect.any(Date),
      true, // dryRun default
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
});
