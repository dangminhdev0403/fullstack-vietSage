import { Injectable } from "@nestjs/common";
import { RequestRealtimeEmitter } from "../../request-realtime.emitter";
import type {
  GuestRequestCreatedEventInput,
  GuestRequestEventPublisher,
  GuestRequestUpdatedEventInput,
} from "./guest-request-events.port";

@Injectable()
export class RequestRealtimeEventPublisher implements GuestRequestEventPublisher {
  publishGuestRequestCreated(input: GuestRequestCreatedEventInput): void {
    RequestRealtimeEmitter.emitGuestRequestCreated(input);
  }

  publishGuestRequestUpdated(input: GuestRequestUpdatedEventInput): void {
    RequestRealtimeEmitter.emitGuestRequestUpdated(input);
  }
}
