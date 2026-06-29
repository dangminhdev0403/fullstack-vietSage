import { Injectable } from "@nestjs/common";
import { HotelsService } from "./hotels.service";
import type {
  CreateRequestEventBodyInput,
  ListStaffRequestsQueryInput,
  RequestSummaryQueryInput,
  UpdateRequestAssignmentBodyInput,
  UpdateRequestStatusBodyInput,
} from "./schemas/hotels.schema";

@Injectable()
export class HotelRequestsService {
  constructor(private readonly hotelsService: HotelsService) {}

  listRequests(actorUserId: string, hotelId: string, query: ListStaffRequestsQueryInput) {
    return this.hotelsService.listRequests(actorUserId, hotelId, query);
  }

  getRequestsSummary(actorUserId: string, hotelId: string, query: RequestSummaryQueryInput) {
    return this.hotelsService.getRequestsSummary(actorUserId, hotelId, query);
  }

  getRequestDetail(actorUserId: string, hotelId: string, requestId: string) {
    return this.hotelsService.getRequestDetail(actorUserId, hotelId, requestId);
  }

  updateRequestStatus(
    actorUserId: string,
    hotelId: string,
    requestId: string,
    dto: UpdateRequestStatusBodyInput,
  ) {
    return this.hotelsService.updateRequestStatus(actorUserId, hotelId, requestId, dto);
  }

  updateRequestAssignment(
    actorUserId: string,
    hotelId: string,
    requestId: string,
    dto: UpdateRequestAssignmentBodyInput,
  ) {
    return this.hotelsService.updateRequestAssignment(actorUserId, hotelId, requestId, dto);
  }

  createRequestEvent(
    actorUserId: string,
    hotelId: string,
    requestId: string,
    dto: CreateRequestEventBodyInput,
  ) {
    return this.hotelsService.createRequestEvent(actorUserId, hotelId, requestId, dto);
  }
}
