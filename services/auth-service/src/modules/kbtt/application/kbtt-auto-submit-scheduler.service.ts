import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { KbttService } from "./kbtt.service";
import { KbttRepository } from "../infrastructure/kbtt.repository";

function scheduledVietnamDate(now: Date, hhmm: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const [hour, minute] = hhmm.split(":").map(Number);
  return new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), hour - 7, minute),
  );
}

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
    const currentHHmm = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);

    try {
      const dueHotels = (await this.repository.findDueHotelsForAutoSubmit(currentHHmm)) ?? [];
      const dueScheduledRuns = (await this.repository.findDueScheduledRuns(now)) ?? [];

      if (dueHotels.length === 0 && dueScheduledRuns.length === 0) {
        return;
      }

      if (dueHotels.length > 0) {
        this.logger.log(
          `Found ${dueHotels.length} hotels due for KBTT auto-submit at ${currentHHmm} (dryRun=${isDryRun}).`,
        );
      }
      if (dueScheduledRuns.length > 0) {
        this.logger.log(
          `Found ${dueScheduledRuns.length} due scheduled/continuation KBTT runs.`,
        );
      }

      const tasks: Array<() => Promise<void>> = [];

      for (const item of dueHotels) {
        if (!item.autoSubmitTime) continue;
        tasks.push(async () => {
          try {
            await this.kbttService.executeAutoSubmitForHotel(
              item.hotelId,
              scheduledVietnamDate(now, item.autoSubmitTime!),
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
      this.logger.error(`Error querying due hotels for KBTT auto-submit: ${error?.message}`, error?.stack);
    }
  }
}
