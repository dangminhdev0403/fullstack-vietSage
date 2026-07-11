import { Module } from "@nestjs/common";
import { GUEST_REQUEST_EVENT_PUBLISHER } from "./guest-request-events.port";
import { RequestRealtimeEventPublisher } from "./request-realtime-event.publisher";

@Module({
  providers: [
    {
      provide: GUEST_REQUEST_EVENT_PUBLISHER,
      useClass: RequestRealtimeEventPublisher,
    },
  ],
  exports: [GUEST_REQUEST_EVENT_PUBLISHER],
})
export class GuestRequestEventsModule {}
