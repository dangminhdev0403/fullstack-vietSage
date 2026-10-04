import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ChannexBookingIngestionService } from "./channex-booking-ingestion.service";

@Injectable()
export class ChannexFeedScheduler {
  private readonly logger = new Logger(ChannexFeedScheduler.name);
  private running = false;

  constructor(private readonly ingestion: ChannexBookingIngestionService) {}

  @Cron("*/10 * * * * *", { name: "channex-booking-feed" })
  async poll(): Promise<unknown> {
    if (!process.env.CHANNEX_API_KEY?.trim()) {
      return { skipped: true, reason: "not_configured" };
    }
    if (this.running) {
      return { skipped: true, reason: "already_running" };
    }

    this.running = true;
    try {
      const result = await this.ingestion.drainFeed({ limit: 100 });
      if (!result.success) {
        this.logger.warn(
          "Channex booking feed chưa drain hoàn tất; cần kiểm tra đối soát hoặc lỗi feed",
        );
      }
      return result;
    } catch (error) {
      this.logger.error(
        `Channex booking feed poll failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      return { success: false };
    } finally {
      this.running = false;
    }
  }
}
