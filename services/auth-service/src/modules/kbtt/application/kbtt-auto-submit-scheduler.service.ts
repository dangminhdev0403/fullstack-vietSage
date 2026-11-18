import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  formatLocalDateTime,
  plainDateAtTime,
  toYmd,
  VIETNAM_TIME_ZONE,
} from "../../../common/time/vietnam-temporal";
import { KBTT_DAILY_SCHEDULE_SLOTS } from "../domain/schemas/kbtt.schema";
import { KbttService } from "./kbtt.service";
import { KbttRepository } from "../infrastructure/kbtt.repository";

export function scheduledVietnamDate(now: Date, hhmm: string): Date {
  const dateStr = toYmd(now, VIETNAM_TIME_ZONE);
  const timeStr = hhmm.length === 5 ? `${hhmm}:00` : hhmm;
  return plainDateAtTime(dateStr, timeStr, VIETNAM_TIME_ZONE);
}

const FIXED_DAILY_SLOTS = new Set<string>(KBTT_DAILY_SCHEDULE_SLOTS);

@Injectable()
export class KbttAutoSubmitSchedulerService {
  private readonly logger = new Logger(KbttAutoSubmitSchedulerService.name);

  constructor(
    private readonly kbttService: KbttService,
    private readonly repository: KbttRepository,
  ) {}

  @Cron("* * * * *", {
    timeZone: "Asia/Ho_Chi_Minh",
  })
  async handleCron() {
    if (process.env.KBTT_AUTO_SUBMIT_KILL_SWITCH === "true") {
      this.logger.warn("KBTT auto-submit kill switch is ACTIVE. Skipping scheduled run.");
      return;
    }

    const isDryRun = process.env.KBTT_AUTO_SUBMIT_LIVE_ENABLED !== "true";
    const now = new Date();
    const currentHHmm = formatLocalDateTime(now, VIETNAM_TIME_ZONE).slice(11, 16);

    try {
      // Independent from arrival scans: departed stays still have pending TS work.
      await this.kbttService.processStayLifecycleEvents();
      await this.kbttService.runDueCooldownHealthProbes?.(now);

      const isDailySlot = FIXED_DAILY_SLOTS.has(currentHHmm);
      const dueHotels = isDailySlot
        ? ((await (this.repository.findHotelsForDailyAutoSubmitSweep
            ? this.repository.findHotelsForDailyAutoSubmitSweep()
            : this.repository.findDueHotelsForAutoSubmit(currentHHmm))) ?? [])
        : [];
      const dueScheduledRuns = (await this.repository.findDueScheduledRuns(now)) ?? [];

      if (dueHotels.length === 0 && dueScheduledRuns.length === 0) {
        return;
      }

      if (dueHotels.length > 0) {
        this.logger.log(
          `Found ${dueHotels.length} hotels due for KBTT daily slot ${currentHHmm} (dryRun=${isDryRun}).`,
        );
      }
      if (dueScheduledRuns.length > 0) {
        this.logger.log(`Found ${dueScheduledRuns.length} due scheduled/catch-up KBTT runs.`);
      }

      const tasks: Array<() => Promise<void>> = [];
      const slotScheduledFor = isDailySlot ? scheduledVietnamDate(now, currentHHmm) : null;

      for (const item of dueHotels) {
        if (!slotScheduledFor) continue;
        tasks.push(async () => {
          try {
            await this.kbttService.executeAutoSubmitForHotel(
              item.hotelId,
              slotScheduledFor,
              isDryRun,
            );
          } catch (hotelError: any) {
            this.logger.error(
              `Failed auto-submit execution for hotel ${item.hotelId}: ${hotelError?.message}`,
              hotelError?.stack,
            );
          }
        });
      }

      for (const run of dueScheduledRuns) {
        tasks.push(async () => {
          try {
            await this.kbttService.executeAutoSubmitForHotel(
              run.hotelId,
              run.scheduledFor,
              run.dryRun,
            );
          } catch (runError: any) {
            this.logger.error(
              `Failed auto-submit scheduled run ${run.id} for hotel ${run.hotelId}: ${runError?.message}`,
              runError?.stack,
            );
          }
        });
      }

      const maxConcurrent = Number(
        process.env.KBTT_MAX_CONCURRENT_HOTELS || (process.env.NODE_ENV === "test" ? 3 : 50),
      );
      const executing = new Set<Promise<void>>();
      for (const task of tasks) {
        const p: Promise<void> = Promise.resolve().then(task);
        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean, clean);
        if (executing.size >= maxConcurrent) {
          await Promise.race(executing);
        }
      }
      await Promise.all(executing);
    } catch (error: any) {
      this.logger.error(
        `Error querying due hotels for KBTT auto-submit: ${error?.message}`,
        error?.stack,
      );
    }
  }
}
