import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { GuestRequestPriority, GuestRequestStatus, GuestStayStatus, Prisma } from "@prisma/client";
import {
  GUEST_REQUEST_EVENT_PUBLISHER,
  NOOP_GUEST_REQUEST_EVENT_PUBLISHER,
  type GuestRequestEventPublisher,
} from "../../shared/events";
import { HotelAccessService } from "./hotel-access.service";
import { HotelRequestsRepository } from "./repositories/hotel-requests.repository";
import type { StaffRequestListRow } from "./repositories/hotel-repository.types";
import type {
  CreateRequestEventBodyInput,
  ListStaffRequestsQueryInput,
  RequestSummaryQueryInput,
  UpdateRequestAssignmentBodyInput,
  UpdateRequestStatusBodyInput,
} from "./schemas/requests.schema";

export interface StaffRequestListItemResponse {
  id: string;
  displayName: string;
  status: GuestRequestStatus;
  priority: "NORMAL" | "URGENT";
  quantity: number;
  description: string | null;
  latestNote: string | null;
  createdAt: string;
  roomNumber: string;
  guestName: string | null;
  categoryName: string | null;
  assignedToName: string | null;
  stayStatus: string | null;
  checkedOutAt: string | null;
  actions: StaffRequestAction[];
}

type StaffRequestAction = "ACCEPT" | "START" | "COMPLETE" | "CANCEL" | "FAIL";

type RequestStatusSummary = Record<GuestRequestStatus, number>;

export interface RequestSummaryResponse {
  total: number;
  statuses: RequestStatusSummary;
}

const activeRequestStatuses = [
  GuestRequestStatus.CREATED,
  GuestRequestStatus.ACKNOWLEDGED,
  GuestRequestStatus.IN_PROGRESS,
];

const completedRequestStatuses = [
  GuestRequestStatus.COMPLETED,
  GuestRequestStatus.CANCELLED,
  GuestRequestStatus.FAILED,
];

const activeStayRequestFilter = {
  stay: {
    is: {
      status: { in: [GuestStayStatus.CHECKED_IN, GuestStayStatus.ACTIVE] },
      checkedOutAt: null,
    },
  },
} satisfies Prisma.GuestRequestWhereInput;

@Injectable()
export class HotelRequestsService {
  private readonly guestRequestEventPublisher: GuestRequestEventPublisher;

  constructor(
    private readonly hotelRequestsRepository: HotelRequestsRepository,
    private readonly hotelAccessService: HotelAccessService,
    @Optional()
    @Inject(GUEST_REQUEST_EVENT_PUBLISHER)
    guestRequestEventPublisher?: GuestRequestEventPublisher,
  ) {
    this.guestRequestEventPublisher =
      guestRequestEventPublisher ?? NOOP_GUEST_REQUEST_EVENT_PUBLISHER;
  }
  async listRequests(actorUserId: string, hotelId: string, query: ListStaffRequestsQueryInput) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.GuestRequestWhereInput = {
      hotelId,
      ...activeStayRequestFilter,
      ...(query.roomNumber ? { room: { is: { roomNumber: query.roomNumber } } } : {}),
      ...(query.serviceItemId ? { serviceItemId: query.serviceItemId } : {}),
      ...(query.priority
        ? { priority: { in: this.toInternalRequestPriorities(query.priority) } }
        : {}),
      ...(query.status ? { status: query.status } : { status: { in: activeRequestStatuses } }),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
    };

    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const [total, rows] = await this.hotelRequestsRepository.listRequests(
      where,
      (page - 1) * limit,
      limit,
    );
    const completedSummary = await this.hotelRequestsRepository.summarizeRequests({
      ...where,
      status: { in: completedRequestStatuses },
    });
    const items = rows.map((row) => this.toStaffRequestListItem(row));

    return {
      page,
      limit,
      total,
      items,
      groups: {
        active: { total, items },
        completed: { total: completedSummary.total, items: [] },
      },
    };
  }

  async getRequestsSummary(
    actorUserId: string,
    hotelId: string,
    query: RequestSummaryQueryInput,
  ): Promise<RequestSummaryResponse> {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const where: Prisma.GuestRequestWhereInput = {
      hotelId,
      ...activeStayRequestFilter,
      ...(query.roomNumber ? { room: { is: { roomNumber: query.roomNumber } } } : {}),
      ...(query.serviceItemId ? { serviceItemId: query.serviceItemId } : {}),
      ...(query.priority
        ? { priority: { in: this.toInternalRequestPriorities(query.priority) } }
        : {}),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
    };

    const summary = await this.hotelRequestsRepository.summarizeRequests(where);

    return {
      total: summary.total,
      statuses: this.toRequestStatusSummary(summary.statuses),
    };
  }

  async getRequestDetail(actorUserId: string, hotelId: string, requestId: string) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const request = await this.hotelRequestsRepository.findRequestDetailInHotel(hotelId, requestId);
    if (!request) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    return this.withProductRequestPriority(request);
  }

  async updateRequestStatus(
    actorUserId: string,
    hotelId: string,
    requestId: string,
    dto: UpdateRequestStatusBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const existing = await this.hotelRequestsRepository.findRequestInHotel(hotelId, requestId);
    if (!existing) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    this.assertRequestTransition(existing.status, dto.status);

    const updated = await this.hotelRequestsRepository.updateRequestStatus({
      hotelId,
      requestId,
      actorUserId,
      status: dto.status,
      note: dto.note?.trim(),
      assignedToUserId: dto.assignedToUserId,
      priority: dto.priority,
      tenantId: hotel.tenantId,
    });

    this.guestRequestEventPublisher.publishGuestRequestUpdated({
      hotelId,
      sessionId: updated.session?.id,
      requestId,
      ownerRequest: this.toStaffRequestListItem(updated),
      guestRequest: this.toGuestRequestRealtimeItem(updated),
      answered: Boolean(dto.note?.trim()),
    });

    return this.withProductRequestPriority(updated);
  }

  async updateRequestAssignment(
    actorUserId: string,
    hotelId: string,
    requestId: string,
    dto: UpdateRequestAssignmentBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const existing = await this.hotelRequestsRepository.findRequestInHotel(hotelId, requestId);
    if (!existing) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    const assignedToUserId = dto.assignedToUserId ?? null;
    if (assignedToUserId) {
      const assignee = await this.hotelRequestsRepository.findAssignableStaffInTenant(
        assignedToUserId,
        hotel.tenantId,
      );
      if (!assignee) {
        throw new BadRequestException("Người dùng được phân công không khả dụng cho khách sạn này");
      }
    }

    const updated = await this.hotelRequestsRepository.updateRequestAssignment({
      hotelId,
      requestId,
      actorUserId,
      assignedToUserId,
      note: dto.note?.trim(),
      tenantId: hotel.tenantId,
    });

    this.guestRequestEventPublisher.publishGuestRequestUpdated({
      hotelId,
      sessionId: updated.session?.id,
      requestId,
      ownerRequest: this.toStaffRequestListItem(updated),
      guestRequest: this.toGuestRequestRealtimeItem(updated),
      answered: Boolean(dto.note?.trim()),
    });

    return this.withProductRequestPriority(updated);
  }

  async createRequestEvent(
    actorUserId: string,
    hotelId: string,
    requestId: string,
    dto: CreateRequestEventBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(actorUserId, hotelId);
    const existing = await this.hotelRequestsRepository.findRequestInHotel(hotelId, requestId);
    if (!existing) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    const event = await this.hotelRequestsRepository.createRequestEvent({
      hotelId,
      requestId,
      actorUserId,
      note: dto.note.trim(),
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      tenantId: hotel.tenantId,
    });

    const updated = await this.hotelRequestsRepository.findRequestDetailInHotel(hotelId, requestId);
    if (!updated) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    this.guestRequestEventPublisher.publishGuestRequestUpdated({
      hotelId,
      sessionId: updated.session?.id,
      requestId,
      ownerRequest: this.toStaffRequestListItem(updated),
      guestRequest: this.toGuestRequestRealtimeItem(updated),
      answered: true,
    });

    return event;
  }

  private assertRequestTransition(from: GuestRequestStatus, to: GuestRequestStatus) {
    const allowed: Record<GuestRequestStatus, GuestRequestStatus[]> = {
      NEW: [GuestRequestStatus.CONFIRMED, GuestRequestStatus.CANCELLED],
      CONFIRMED: [GuestRequestStatus.IN_PROGRESS, GuestRequestStatus.CANCELLED],
      PENDING: [GuestRequestStatus.ACCEPTED, GuestRequestStatus.REJECTED],
      ACCEPTED: [GuestRequestStatus.ON_THE_WAY],
      ON_THE_WAY: [GuestRequestStatus.IN_PROGRESS],
      CREATED: [GuestRequestStatus.ACKNOWLEDGED, GuestRequestStatus.CANCELLED],
      ACKNOWLEDGED: [GuestRequestStatus.IN_PROGRESS, GuestRequestStatus.CANCELLED],
      IN_PROGRESS: [GuestRequestStatus.COMPLETED, GuestRequestStatus.FAILED],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
      FAILED: [],
    };

    if (from === to) {
      return;
    }

    if (!allowed[from].includes(to)) {
      throw new BadRequestException(`Yêu cầu không thể chuyển từ ${from} sang ${to}`);
    }
  }

  private toStaffRequestListItem(row: StaffRequestListRow): StaffRequestListItemResponse {
    return {
      id: row.id,
      displayName: row.serviceItem?.name ?? row.title ?? "Request",
      status: row.status,
      priority: this.toStaffRequestListPriority(row.priority),
      quantity: row.quantity,
      description: row.description,
      latestNote: row.events?.[0]?.note ?? null,
      createdAt: row.createdAt.toISOString(),
      roomNumber: row.room.roomNumber,
      guestName: row.stay.guestDisplayName,
      categoryName: row.serviceItem?.category.name ?? null,
      assignedToName: row.assignedTo?.fullName ?? row.assignedTo?.email ?? null,
      stayStatus: row.stay.status ?? null,
      checkedOutAt: row.stay.checkedOutAt?.toISOString() ?? null,
      actions: this.getStaffRequestActions(row.status),
    };
  }

  private getStaffRequestActions(status: GuestRequestStatus): StaffRequestAction[] {
    switch (status) {
      case GuestRequestStatus.NEW:
      case GuestRequestStatus.PENDING:
      case GuestRequestStatus.CREATED:
        return ["ACCEPT", "CANCEL"];
      case GuestRequestStatus.CONFIRMED:
      case GuestRequestStatus.ACCEPTED:
      case GuestRequestStatus.ACKNOWLEDGED:
        return ["START", "CANCEL"];
      case GuestRequestStatus.ON_THE_WAY:
      case GuestRequestStatus.IN_PROGRESS:
        return ["COMPLETE", "FAIL"];
      case GuestRequestStatus.COMPLETED:
      case GuestRequestStatus.REJECTED:
      case GuestRequestStatus.CANCELLED:
      case GuestRequestStatus.FAILED:
        return [];
    }
  }

  private toStaffRequestListPriority(
    priority: StaffRequestListRow["priority"],
  ): "NORMAL" | "URGENT" {
    return String(priority) === "URGENT" || String(priority) === "HIGH" ? "URGENT" : "NORMAL";
  }

  private withProductRequestPriority<T extends { priority: unknown }>(
    request: T,
  ): Omit<T, "priority"> & { priority: "NORMAL" | "URGENT" } {
    return {
      ...request,
      priority: this.toStaffRequestListPriority(
        request.priority as StaffRequestListRow["priority"],
      ),
    };
  }

  private toInternalRequestPriorities(priority: "NORMAL" | "URGENT"): GuestRequestPriority[] {
    switch (priority) {
      case "NORMAL":
        return [GuestRequestPriority.NORMAL];
      case "URGENT":
        return [GuestRequestPriority.URGENT];
    }
  }

  private toRequestStatusSummary(
    rows: Array<{ status: GuestRequestStatus; _count: { _all: number } }>,
  ): RequestStatusSummary {
    const statuses = Object.fromEntries(
      Object.values(GuestRequestStatus).map((status) => [status, 0]),
    ) as RequestStatusSummary;

    for (const row of rows) {
      statuses[row.status] = row._count._all;
    }

    return statuses;
  }

  private toGuestRequestRealtimeItem(row: StaffRequestListRow) {
    return {
      id: row.id,
      displayName: row.serviceItem?.name ?? row.title ?? "Request",
      status: this.toGuestPortalRequestStatus(row.status),
      quantity: row.quantity,
      description: row.description,
      answer: row.events[0]?.note ?? null,
      createdAt: row.createdAt.toISOString(),
      canCancel: row.status === GuestRequestStatus.CREATED,
    };
  }

  private toGuestPortalRequestStatus(status: GuestRequestStatus) {
    switch (status) {
      case GuestRequestStatus.COMPLETED:
        return "COMPLETED";
      case GuestRequestStatus.CANCELLED:
        return "CANCELLED";
      case GuestRequestStatus.FAILED:
        return "FAILED";
      case GuestRequestStatus.CREATED:
      case GuestRequestStatus.ACKNOWLEDGED:
      case GuestRequestStatus.IN_PROGRESS:
        return "PENDING";
    }
  }
}
