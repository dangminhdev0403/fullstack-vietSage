import { Injectable } from "@nestjs/common";
import { RequestRealtimeEmitter } from "../../request-realtime.emitter";
import type {
  ConversationClosedEventInput,
  GuestMessageCreatedEventInput,
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

  publishGuestMessageCreated(input: GuestMessageCreatedEventInput): void {
    RequestRealtimeEmitter.emitGuestMessageCreated(input);
  }

  publishConversationClosed(input: ConversationClosedEventInput): void {
    RequestRealtimeEmitter.emitConversationClosed(input);
  }

  publishStayOverdueCheckout(
    input: import("./guest-request-events.port").StayOverdueCheckoutEventInput,
  ): void {
    RequestRealtimeEmitter.emitStayOverdueCheckout(input);
  }
}
