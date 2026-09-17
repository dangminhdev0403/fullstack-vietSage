export interface StayCheckedInEvent {
  hotelId: string;
  stayId: string;
  actorUserId?: string;
}

export interface StayCheckInEventPublisher {
  publishStayCheckedIn(event: StayCheckedInEvent): void;
}

export const STAY_CHECK_IN_EVENT_PUBLISHER = Symbol("STAY_CHECK_IN_EVENT_PUBLISHER");

export const NOOP_STAY_CHECK_IN_EVENT_PUBLISHER: StayCheckInEventPublisher = {
  publishStayCheckedIn: () => undefined,
};
