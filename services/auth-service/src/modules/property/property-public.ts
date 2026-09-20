export {
  HotelAccessService,
  type HotelActorContext,
  type HotelRoomScope,
} from "./application/hotel-access.service";
export {
  HotelStayOccupantsReadService,
  type ActiveStayOccupantRow,
  type CitizenshipKind,
} from "./application/hotel-stay-occupants-read.service";
export { hotelIdParamSchema } from "./domain/schemas/shared.schema";
