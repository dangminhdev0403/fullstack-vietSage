import { Injectable, Logger } from "@nestjs/common";
import type { StayCheckedInEvent, StayCheckInEventPublisher, StayDepartureChangedEvent } from "./stay-check-in-events";

export type StayCheckInListener = (event: StayCheckedInEvent) => Promise<void> | void;
export type StayDepartureChangedListener = (event: StayDepartureChangedEvent) => Promise<void> | void;

@Injectable()
export class StayCheckInEventBus implements StayCheckInEventPublisher {
  private readonly logger = new Logger(StayCheckInEventBus.name);
  private readonly listeners: StayCheckInListener[] = [];
  private readonly departureListeners: StayDepartureChangedListener[] = [];

  subscribe(listener: StayCheckInListener): void {
    this.listeners.push(listener);
  }

  subscribeDepartureChanged(listener: StayDepartureChangedListener): void {
    this.departureListeners.push(listener);
  }

  publishStayCheckedIn(event: StayCheckedInEvent): void {
    for (const listener of this.listeners) {
      void Promise.resolve()
        .then(() => listener(event))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Stay check-in listener execution failed non-blocking: ${message}`);
        });
    }
  }

  publishStayDepartureChanged(event: StayDepartureChangedEvent): void {
    for (const listener of this.departureListeners) {
      void Promise.resolve()
        .then(() => listener(event))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Stay departure listener execution failed non-blocking: ${message}`);
        });
    }
  }
}
