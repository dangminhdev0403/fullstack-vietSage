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
export {
  createBulkReservationsBodySchema,
  type CreateBulkReservationsBodyInput,
  groupCodeParamSchema,
  updateGroupReservationBodySchema,
  type UpdateGroupReservationBodyInput,
  upsertConfirmationTemplateBodySchema,
  type UpsertConfirmationTemplateBodyInput,
} from "./domain/schemas/reservations.schema";
export { HotelFeatureEntitlementsService } from "./application/hotel-feature-entitlements.service";
export { ReservationRoomAllocationService } from "./application/reservation-room-allocation.service";
