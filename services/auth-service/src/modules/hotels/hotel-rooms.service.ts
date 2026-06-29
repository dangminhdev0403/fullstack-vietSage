import { Injectable } from "@nestjs/common";
import { HotelsService } from "./hotels.service";
import type {
  CheckOutBodyInput,
  CreateRoomBodyInput,
  CreateRoomsBodyInput,
  CreateStayBodyInput,
  ListRoomsQueryInput,
  QrReasonBodyInput,
  UpdateRoomBodyInput,
} from "./schemas/hotels.schema";

@Injectable()
export class HotelRoomsService {
  constructor(private readonly hotelsService: HotelsService) {}

  createRoom(actorUserId: string, hotelId: string, dto: CreateRoomBodyInput) {
    return this.hotelsService.createRoom(actorUserId, hotelId, dto);
  }

  createRooms(actorUserId: string, hotelId: string, dto: CreateRoomsBodyInput) {
    return this.hotelsService.createRooms(actorUserId, hotelId, dto);
  }

  listRooms(actorUserId: string, hotelId: string, query: ListRoomsQueryInput) {
    return this.hotelsService.listRooms(actorUserId, hotelId, query);
  }

  updateRoom(actorUserId: string, hotelId: string, roomId: string, dto: UpdateRoomBodyInput) {
    return this.hotelsService.updateRoom(actorUserId, hotelId, roomId, dto);
  }

  createStay(actorUserId: string, hotelId: string, dto: CreateStayBodyInput) {
    return this.hotelsService.createStay(actorUserId, hotelId, dto);
  }

  createAndCheckInStay(actorUserId: string, hotelId: string, dto: CreateStayBodyInput) {
    return this.hotelsService.createAndCheckInStay(actorUserId, hotelId, dto);
  }

  checkInStay(actorUserId: string, hotelId: string, stayId: string) {
    return this.hotelsService.checkInStay(actorUserId, hotelId, stayId);
  }

  checkOutStay(actorUserId: string, hotelId: string, stayId: string, dto: CheckOutBodyInput) {
    return this.hotelsService.checkOutStay(actorUserId, hotelId, stayId, dto);
  }

  rotateQr(actorUserId: string, hotelId: string, roomId: string, dto: QrReasonBodyInput) {
    return this.hotelsService.rotateQr(actorUserId, hotelId, roomId, dto);
  }

  activateQr(actorUserId: string, hotelId: string, roomId: string) {
    return this.hotelsService.activateQr(actorUserId, hotelId, roomId);
  }

  deactivateQr(actorUserId: string, hotelId: string, roomId: string, dto: QrReasonBodyInput) {
    return this.hotelsService.deactivateQr(actorUserId, hotelId, roomId, dto);
  }
}
