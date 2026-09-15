import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { KbttService } from "./kbtt.service";
import { KbttRepository } from "../infrastructure/kbtt.repository";

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
      const dueHotels = await this.repository.findDueHotelsForAutoSubmit(currentHHmm);
      if (!dueHotels || dueHotels.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${dueHotels.length} hotels due for KBTT auto-submit at ${currentHHmm} (dryRun=${isDryRun}).`,
      );

      for (const item of dueHotels) {
        try {
          await this.kbttService.executeAutoSubmitForHotel(item.hotelId, now, isDryRun);
        } catch (hotelError: any) {
          this.logger.error(
            `Failed auto-submit execution for hotel ${item.hotelId}: ${hotelError?.message}`,
            hotelError?.stack,
          );
        }
      }
    } catch (error: any) {
      this.logger.error(`Error querying due hotels for KBTT auto-submit: ${error?.message}`, error?.stack);
    }
  }
}
