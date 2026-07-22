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
} from "../../../shared/events";
import { HotelAccessService } from "../../property/property-public";
import { HotelRequestsRepository } from "../infrastructure/repositories/hotel-requests.repository";
import type { StaffRequestListRow } from "../infrastructure/repositories/guest-request-repository.types";
import type {
  CreateRequestEventBodyInput,
  ListStaffRequestsQueryInput,
  RequestSummaryQueryInput,
  UpdateRequestAssignmentBodyInput,
  UpdateRequestStatusBodyInput,
} from "../domain/schemas/requests.schema";
import {
  activeGuestRequestStatuses,
  canonicalGuestRequestStatuses,
  compatibleGuestRequestStatuses,
  normalizeGuestRequestStatus,
  type CanonicalGuestRequestStatus,
} from "../domain/guest-request-status";

export interface StaffRequestListItemResponse {
  id: string;
  displayName: string;
  status: CanonicalGuestRequestStatus;
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

type RequestStatusSummary = Record<CanonicalGuestRequestStatus, number>;

export interface RequestSummaryResponse {
  total: number;
  statuses: RequestStatusSummary;
}

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

function buildRequestSearchFilter(search: string | undefined): Prisma.GuestRequestWhereInput {
  const q = search?.trim();
  if (!q) return {};

  return {
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { room: { is: { roomNumber: { contains: q, mode: "insensitive" } } } },
      { stay: { is: { guestDisplayName: { contains: q, mode: "insensitive" } } } },
      { stay: { is: { guestPhone: { contains: q, mode: "insensitive" } } } },
      { stay: { is: { reservationCode: { contains: q, mode: "insensitive" } } } },
      { serviceItem: { is: { name: { contains: q, mode: "insensitive" } } } },
      { serviceItem: { is: { category: { is: { name: { contains: q, mode: "insensitive" } } } } } },
    ],
  };
}

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
  private parseHotelArgs<T>(
    arg2: string,
    arg3?: string | T,
    arg4?: T,
  ): { activeRoleId: string; hotelId: string; payload: T } {
    if (typeof arg3 === "string") {
      return { activeRoleId: arg2, hotelId: arg3, payload: (arg4 ?? {}) as T };
    }
    return { activeRoleId: "", hotelId: arg2, payload: (arg3 ?? {}) as T };
  }

  private parseHotelRequestArgs<T>(
    arg2: string,
    arg3: string,
    arg4?: string | T,
    arg5?: T,
  ): { activeRoleId: string; hotelId: string; requestId: string; payload: T } {
    if (typeof arg4 === "string") {
      return { activeRoleId: arg2, hotelId: arg3, requestId: arg4, payload: (arg5 ?? {}) as T };
    }
    return { activeRoleId: "", hotelId: arg2, requestId: arg3, payload: (arg4 ?? {}) as T };
  }

  async listRequests(
    actorUserId: string,
    activeRoleIdOrHotelId: string,
    hotelIdOrQuery?: string | ListStaffRequestsQueryInput,
    queryInput?: ListStaffRequestsQueryInput,
  ) {
    const {
      activeRoleId,
      hotelId,
      payload: query,
    } = this.parseHotelArgs<ListStaffRequestsQueryInput>(
      activeRoleIdOrHotelId,
      hotelIdOrQuery,
      queryInput,
    );
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.GuestRequestWhereInput = {
      hotelId,
      ...activeStayRequestFilter,
      ...buildRequestSearchFilter(query.q),
      ...(query.roomNumber ? { room: { is: { roomNumber: query.roomNumber } } } : {}),
      ...(query.serviceItemId ? { serviceItemId: query.serviceItemId } : {}),
      ...(query.priority
        ? { priority: { in: this.toInternalRequestPriorities(query.priority) } }
        : {}),
      ...(query.status
        ? { status: { in: compatibleGuestRequestStatuses(query.status) } }
        : { status: { in: [...activeGuestRequestStatuses] } }),
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
    activeRoleIdOrHotelId: string,
    hotelIdOrQuery?: string | RequestSummaryQueryInput,
    queryInput?: RequestSummaryQueryInput,
  ): Promise<RequestSummaryResponse> {
    const {
      activeRoleId,
      hotelId,
      payload: query,
    } = this.parseHotelArgs<RequestSummaryQueryInput>(
      activeRoleIdOrHotelId,
      hotelIdOrQuery,
      queryInput,
    );
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const where: Prisma.GuestRequestWhereInput = {
      hotelId,
      ...activeStayRequestFilter,
      ...buildRequestSearchFilter(query.q),
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

  async getRequestDetail(
    actorUserId: string,
    activeRoleIdOrHotelId: string,
    hotelIdOrRequestId: string,
    requestIdParam?: string,
  ) {
    const { activeRoleId, hotelId, requestId } = this.parseHotelRequestArgs<void>(
      activeRoleIdOrHotelId,
      hotelIdOrRequestId,
      requestIdParam,
    );
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const request = await this.hotelRequestsRepository.findRequestDetailInHotel(hotelId, requestId);
    if (!request) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    return this.withProductRequestPriority(request);
  }

  async updateRequestStatus(
    actorUserId: string,
    activeRoleIdOrHotelId: string,
    hotelIdOrRequestId: string,
    requestIdOrDto: string | UpdateRequestStatusBodyInput,
    dtoParam?: UpdateRequestStatusBodyInput,
  ) {
    const {
      activeRoleId,
      hotelId,
      requestId,
      payload: dto,
    } = this.parseHotelRequestArgs<UpdateRequestStatusBodyInput>(
      activeRoleIdOrHotelId,
      hotelIdOrRequestId,
      requestIdOrDto,
      dtoParam,
    );
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const existing = await this.hotelRequestsRepository.findRequestInHotel(hotelId, requestId);
    if (!existing) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    this.assertRequestTransition(existing.status, dto.status);

    const updated = await this.hotelRequestsRepository.updateRequestStatus({
      hotelId,
      requestId,
      actorUserId,
      expectedStatus: existing.status,
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
    activeRoleId: string,
    hotelId: string,
    requestId: string,
    dto: UpdateRequestAssignmentBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const existing = await this.hotelRequestsRepository.findRequestInHotel(hotelId, requestId);
    if (!existing) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    const assignedToUserId = dto.assignedToUserId ?? null;
    if (assignedToUserId) {
      const assignee = await this.hotelRequestsRepository.findAssignableStaffInTenant(
        assignedToUserId,
        hotel.tenantId,
        hotelId,
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
    activeRoleId: string,
    hotelId: string,
    requestId: string,
    dto: CreateRequestEventBodyInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );
    const existing = await this.hotelRequestsRepository.findRequestInHotel(hotelId, requestId);
    if (!existing) {
      throw new NotFoundException("Không tìm thấy yêu cầu");
    }

    const event = await this.hotelRequestsRepository.createRequestEvent({
      hotelId,
      requestId,
      actorUserId,
      note: dto.note.trim(),
      visibility: dto.visibility,
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
      answered: dto.visibility === "GUEST",
    });

    return event;
  }

  private assertRequestTransition(from: GuestRequestStatus, to: CanonicalGuestRequestStatus) {
    const normalizedFrom = normalizeGuestRequestStatus(from);
    const allowed: Record<CanonicalGuestRequestStatus, CanonicalGuestRequestStatus[]> = {
      CREATED: [GuestRequestStatus.ACKNOWLEDGED, GuestRequestStatus.CANCELLED],
      ACKNOWLEDGED: [GuestRequestStatus.IN_PROGRESS, GuestRequestStatus.CANCELLED],
      IN_PROGRESS: [GuestRequestStatus.COMPLETED, GuestRequestStatus.FAILED],
      COMPLETED: [],
      CANCELLED: [],
      FAILED: [],
    };

    if (normalizedFrom === to) {
      return;
    }

    if (!allowed[normalizedFrom].includes(to)) {
      throw new BadRequestException(`Yêu cầu không thể chuyển từ ${from} sang ${to}`);
    }
  }

  private toStaffRequestListItem(row: StaffRequestListRow): StaffRequestListItemResponse {
    return {
      id: row.id,
      displayName: row.serviceItem?.name ?? row.title ?? "Request",
      status: normalizeGuestRequestStatus(row.status),
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
      actions: this.getStaffRequestActions(normalizeGuestRequestStatus(row.status)),
    };
  }

  private getStaffRequestActions(status: CanonicalGuestRequestStatus): StaffRequestAction[] {
    switch (status) {
      case GuestRequestStatus.CREATED:
        return ["ACCEPT", "CANCEL"];
      case GuestRequestStatus.ACKNOWLEDGED:
        return ["START", "CANCEL"];
      case GuestRequestStatus.IN_PROGRESS:
        return ["COMPLETE", "FAIL"];
      case GuestRequestStatus.COMPLETED:
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
  ): Omit<T, "priority" | "status"> & {
    priority: "NORMAL" | "URGENT";
    status: CanonicalGuestRequestStatus;
  } {
    return {
      ...request,
      status: normalizeGuestRequestStatus((request as T & { status: GuestRequestStatus }).status),
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
      canonicalGuestRequestStatuses.map((status) => [status, 0]),
    ) as RequestStatusSummary;

    for (const row of rows) {
      statuses[normalizeGuestRequestStatus(row.status)] += row._count._all;
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
      canCancel: normalizeGuestRequestStatus(row.status) === GuestRequestStatus.CREATED,
    };
  }

  private toGuestPortalRequestStatus(status: GuestRequestStatus) {
    return normalizeGuestRequestStatus(status);
  }
}
