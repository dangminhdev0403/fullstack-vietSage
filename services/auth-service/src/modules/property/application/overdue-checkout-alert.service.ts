import { Inject, Injectable, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { GuestStayStatus } from "@prisma/client";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  GUEST_REQUEST_EVENT_PUBLISHER,
  NOOP_GUEST_REQUEST_EVENT_PUBLISHER,
  type GuestRequestEventPublisher,
} from "../../../shared/events/guest-request-events.port";

export interface OverdueStayAlertResult {
  stayId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  guestDisplayName: string;
  plannedCheckOutAt: Date;
  overdueHours: number;
}

@Injectable()
export class OverdueCheckoutAlertService {
  private readonly eventPublisher: GuestRequestEventPublisher;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(GUEST_REQUEST_EVENT_PUBLISHER)
    eventPublisher?: GuestRequestEventPublisher,
    private readonly logger?: AppLogger,
  ) {
    this.eventPublisher = eventPublisher ?? NOOP_GUEST_REQUEST_EVENT_PUBLISHER;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    try {
      const alerts = await this.checkOverdueStays();
      if (alerts.length > 0) {
        this.logger?.info(
          `Overdue checkout cron published alerts for ${alerts.length} stay(s)`,
          { count: alerts.length },
        );
      }
    } catch (error) {
      this.logger?.error("Failed to run overdue checkout cron job", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async checkOverdueStays(now = new Date()): Promise<OverdueStayAlertResult[]> {
    const overdueStays = await this.prisma.guestStay.findMany({
      where: {
        status: {
          in: [
            GuestStayStatus.ACTIVE,
            GuestStayStatus.CHECKED_IN,
            GuestStayStatus.CHECKOUT_PENDING,
          ],
        },
        checkedOutAt: null,
        plannedCheckOutAt: { lt: now },
      },
      include: {
        room: {
          select: {
            id: true,
            roomNumber: true,
          },
        },
      },
    });

    const results: OverdueStayAlertResult[] = [];

    for (const stay of overdueStays) {
      const overdueHours = Number(
        ((now.getTime() - stay.plannedCheckOutAt.getTime()) / (1000 * 60 * 60)).toFixed(1),
      );

      const alert: OverdueStayAlertResult = {
        stayId: stay.id,
        hotelId: stay.hotelId,
        roomId: stay.roomId,
        roomNumber: stay.room?.roomNumber ?? "N/A",
        guestDisplayName: stay.guestDisplayName,
        plannedCheckOutAt: stay.plannedCheckOutAt,
        overdueHours,
      };

      results.push(alert);

      this.eventPublisher.publishStayOverdueCheckout?.({
        hotelId: alert.hotelId,
        stayId: alert.stayId,
        roomId: alert.roomId,
        roomNumber: alert.roomNumber,
        guestDisplayName: alert.guestDisplayName,
        plannedCheckOutAt: alert.plannedCheckOutAt,
        overdueHours: alert.overdueHours,
      });
    }

    return results;
  }
}
