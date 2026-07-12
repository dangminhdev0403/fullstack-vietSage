import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import {
  DomainEventStatus,
  FolioItemSourceType,
  FolioItemType,
  FolioStatus,
  GuestRequestActorType,
  GuestRequestPriority,
  GuestRequestStatus,
  GuestStayStatus,
  Prisma,
  TenantUserStatus,
} from "@prisma/client";
import { PrismaService } from "../../../../prisma/prisma.service";
import { requestDetailInclude, requestListInclude } from "./hotel-repository.types";

@Injectable()
export class HotelRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}
  async listRequests(where: Prisma.GuestRequestWhereInput, skip: number, take: number) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.guestRequest.count({ where });
      const rows = await tx.guestRequest.findMany({
        where,
        include: requestListInclude,
        orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
        skip,
        take,
      });

      return [total, rows] as const;
    });
  }

  async summarizeRequests(where: Prisma.GuestRequestWhereInput) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.guestRequest.count({ where });
      const statuses = await tx.guestRequest.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      });

      return { total, statuses };
    });
  }

  async summarizeOperationalRequests(where: Prisma.GuestRequestWhereInput) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const activeStatuses = [
      GuestRequestStatus.CREATED,
      GuestRequestStatus.ACKNOWLEDGED,
      GuestRequestStatus.IN_PROGRESS,
    ];

    return this.prisma.$transaction(async (tx) => {
      const [pending, urgent, unassigned, completedToday] = await Promise.all([
        tx.guestRequest.count({ where: { ...where, status: { in: activeStatuses } } }),
        tx.guestRequest.count({
          where: {
            ...where,
            status: { in: activeStatuses },
            priority: GuestRequestPriority.URGENT,
          },
        }),
        tx.guestRequest.count({
          where: { ...where, status: { in: activeStatuses }, assignedToUserId: null },
        }),
        tx.guestRequest.count({
          where: {
            ...where,
            status: GuestRequestStatus.COMPLETED,
            completedAt: { gte: today, lt: tomorrow },
          },
        }),
      ]);

      return { pending, urgent, unassigned, completedToday };
    });
  }

  async findRequestInHotel(hotelId: string, requestId: string) {
    return this.prisma.guestRequest.findFirst({ where: { id: requestId, hotelId } });
  }

  async findRequestDetailInHotel(hotelId: string, requestId: string) {
    return this.prisma.guestRequest.findFirst({
      where: { id: requestId, hotelId },
      include: requestDetailInclude,
    });
  }

  async findAssignableStaffInTenant(userId: string, tenantId: string) {
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantUsers: { some: { tenantId, status: TenantUserStatus.ACTIVE } },
      },
      select: { id: true },
    });
  }

  async updateRequestStatus(input: {
    hotelId: string;
    requestId: string;
    actorUserId: string;
    status: GuestRequestStatus;
    note?: string;
    assignedToUserId?: string;
    priority?: Prisma.GuestRequestUpdateInput["priority"];
    tenantId: string;
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.guestRequest.findFirstOrThrow({
          where: { id: input.requestId, hotelId: input.hotelId },
        });

        let billingFolioItemId: string | undefined;
        const completedAt = input.status === GuestRequestStatus.COMPLETED ? new Date() : undefined;

        if (input.status === GuestRequestStatus.COMPLETED) {
          const folioItem = await this.createServiceFolioItemFromGuestRequest(tx, {
            hotelId: input.hotelId,
            requestId: input.requestId,
            actorUserId: input.actorUserId,
            completedAt: completedAt ?? new Date(),
          });
          billingFolioItemId = folioItem.id;
        }

        const updated = await tx.guestRequest.update({
          where: { id: input.requestId },
          data: {
            status: input.status,
            assignedToUserId: input.assignedToUserId,
            priority: input.priority,
            completedAt,
            cancelledAt: input.status === GuestRequestStatus.CANCELLED ? new Date() : undefined,
            billingPostStatus: input.status === GuestRequestStatus.COMPLETED ? "POSTED" : undefined,
            billingPostedAt: input.status === GuestRequestStatus.COMPLETED ? new Date() : undefined,
            billingFolioItemId,
          },
          include: requestDetailInclude,
        });

        await tx.guestRequestEvent.create({
          data: {
            requestId: input.requestId,
            hotelId: input.hotelId,
            actorType: GuestRequestActorType.STAFF,
            actorUserId: input.actorUserId,
            eventType: "REQUEST_UPDATED",
            fromStatus: existing.status,
            toStatus: updated.status,
            note: input.note,
          },
        });

        await this.createDomainEvent(tx, {
          eventType: "REQUEST_UPDATED",
          aggregateType: "GuestRequest",
          aggregateId: updated.id,
          hotelId: input.hotelId,
          tenantId: input.tenantId,
          payload: { requestId: updated.id, fromStatus: existing.status, toStatus: updated.status },
        });

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateRequestAssignment(input: {
    hotelId: string;
    requestId: string;
    actorUserId: string;
    assignedToUserId: string | null;
    note?: string;
    tenantId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.guestRequest.findFirstOrThrow({
        where: { id: input.requestId, hotelId: input.hotelId },
      });

      const updated = await tx.guestRequest.update({
        where: { id: input.requestId },
        data: { assignedToUserId: input.assignedToUserId },
        include: requestDetailInclude,
      });

      await tx.guestRequestEvent.create({
        data: {
          requestId: input.requestId,
          hotelId: input.hotelId,
          actorType: GuestRequestActorType.STAFF,
          actorUserId: input.actorUserId,
          eventType: "REQUEST_ASSIGNMENT_UPDATED",
          note: input.note,
          metadata: {
            fromAssignedToUserId: existing.assignedToUserId,
            toAssignedToUserId: input.assignedToUserId,
          },
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "REQUEST_ASSIGNMENT_UPDATED",
        aggregateType: "GuestRequest",
        aggregateId: updated.id,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: {
          requestId: updated.id,
          fromAssignedToUserId: existing.assignedToUserId,
          toAssignedToUserId: input.assignedToUserId,
        },
      });

      return updated;
    });
  }

  async createRequestEvent(input: {
    hotelId: string;
    requestId: string;
    actorUserId: string;
    note: string;
    metadata?: Prisma.InputJsonValue;
    tenantId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.guestRequestEvent.create({
        data: {
          requestId: input.requestId,
          hotelId: input.hotelId,
          actorType: GuestRequestActorType.STAFF,
          actorUserId: input.actorUserId,
          eventType: "REQUEST_NOTE_ADDED",
          note: input.note,
          metadata: input.metadata,
        },
      });

      await this.createDomainEvent(tx, {
        eventType: "REQUEST_NOTE_ADDED",
        aggregateType: "GuestRequest",
        aggregateId: input.requestId,
        hotelId: input.hotelId,
        tenantId: input.tenantId,
        payload: { requestId: input.requestId, eventId: event.id },
      });

      return event;
    });
  }

  private async findExistingFolioItemByGuestRequest(
    tx: Prisma.TransactionClient,
    requestId: string,
  ) {
    return tx.folioItem.findUnique({
      where: { guestRequestId: requestId },
      select: { id: true, folioId: true },
    });
  }

  private async createServiceFolioItemFromGuestRequest(
    tx: Prisma.TransactionClient,
    input: { hotelId: string; requestId: string; actorUserId: string; completedAt: Date },
  ) {
    const existingFolioItem = await this.findExistingFolioItemByGuestRequest(tx, input.requestId);

    if (existingFolioItem) {
      await this.recalculateFolioTotals(tx, existingFolioItem.folioId);
      return existingFolioItem;
    }

    const request = await tx.guestRequest.findFirstOrThrow({
      where: { id: input.requestId, hotelId: input.hotelId },
      include: {
        stay: { select: { id: true, status: true } },
        serviceItem: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                defaultPrice: true,
                currency: true,
              },
            },
          },
        },
      },
    });

    if (request.stay.status !== GuestStayStatus.ACTIVE) {
      throw new ConflictException("Không thể ghi nhận phí dịch vụ cho lượt lưu trú chưa hoạt động");
    }

    if (!request.serviceItem) {
      throw new BadRequestException("Yêu cầu không có dịch vụ để ghi nhận tính phí");
    }

    const folio = await tx.folio.findFirst({
      where: { hotelId: input.hotelId, stayId: request.stayId, status: FolioStatus.OPEN },
      select: { id: true, currency: true },
    });

    if (!folio) {
      throw new ConflictException("Không tìm thấy folio đang mở cho lượt lưu trú");
    }

    const unitPrice =
      request.serviceItem.priceOverride ?? request.serviceItem.category.defaultPrice;
    const quantity = Math.max(request.quantity ?? 1, 1);
    const subtotal = new Prisma.Decimal(unitPrice).mul(quantity);
    const zero = new Prisma.Decimal(0);

    const folioItem = await tx.folioItem.create({
      data: {
        hotelId: input.hotelId,
        folioId: folio.id,
        stayId: request.stayId,
        itemType: FolioItemType.SERVICE,
        sourceType: FolioItemSourceType.GUEST_REQUEST,
        sourceId: request.id,
        roomId: request.roomId,
        serviceItemId: request.serviceItemId,
        guestRequestId: request.id,
        codeSnapshot: request.serviceItem.id,
        nameSnapshot: request.serviceItem.name,
        descriptionSnapshot: request.description ?? request.title,
        quantity,
        unitPriceSnapshot: unitPrice,
        taxRateSnapshot: zero,
        taxAmountSnapshot: zero,
        discountAmountSnapshot: zero,
        subtotalSnapshot: subtotal,
        totalSnapshot: subtotal,
        currency: request.serviceItem.category.currency ?? folio.currency,
        billingSourceSnapshot: {
          guestRequestId: request.id,
          serviceItemId: request.serviceItem.id,
          serviceName: request.serviceItem.name,
          categoryId: request.serviceItem.category.id,
          categoryName: request.serviceItem.category.name,
          priceSource: request.serviceItem.priceOverride ? "SERVICE_OVERRIDE" : "CATEGORY_DEFAULT",
          originalUnitPrice: unitPrice.toString(),
          quantity,
        },
        serviceCompletedAt: input.completedAt,
        postedAt: input.completedAt,
        postedByUserId: input.actorUserId,
      },
      select: { id: true, folioId: true },
    });

    await this.recalculateFolioTotals(tx, folio.id);
    return folioItem;
  }

  private async recalculateFolioTotals(tx: Prisma.TransactionClient, folioId: string) {
    const totals = await tx.folioItem.aggregate({
      where: { folioId, voidedAt: null },
      _sum: {
        subtotalSnapshot: true,
        taxAmountSnapshot: true,
        discountAmountSnapshot: true,
        totalSnapshot: true,
      },
    });

    await tx.folio.update({
      where: { id: folioId },
      data: {
        subtotalAmount: totals._sum.subtotalSnapshot ?? new Prisma.Decimal(0),
        taxAmount: totals._sum.taxAmountSnapshot ?? new Prisma.Decimal(0),
        discountAmount: totals._sum.discountAmountSnapshot ?? new Prisma.Decimal(0),
        totalAmount: totals._sum.totalSnapshot ?? new Prisma.Decimal(0),
      },
    });
  }

  private async createDomainEvent(
    tx: Prisma.TransactionClient,
    input: {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      hotelId?: string;
      tenantId?: string;
      payload: Prisma.InputJsonValue;
    },
  ) {
    return tx.domainEvent.create({
      data: {
        ...input,
        status: DomainEventStatus.PENDING,
      },
    });
  }
}
