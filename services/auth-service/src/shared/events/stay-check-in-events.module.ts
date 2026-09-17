import { Global, Module } from "@nestjs/common";
import { StayCheckInEventBus } from "./stay-check-in-event-bus";
import { STAY_CHECK_IN_EVENT_PUBLISHER } from "./stay-check-in-events";

@Global()
@Module({
  providers: [
    StayCheckInEventBus,
    {
      provide: STAY_CHECK_IN_EVENT_PUBLISHER,
      useExisting: StayCheckInEventBus,
    },
  ],
  exports: [StayCheckInEventBus, STAY_CHECK_IN_EVENT_PUBLISHER],
})
export class StayCheckInEventsModule {}
