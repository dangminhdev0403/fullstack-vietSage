import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CapacityReservationStatus,
  MarketplaceOrderActorType,
  MarketplaceOrderStatus,
  MarketplaceRecordStatus,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import { canTransitionMarketplaceOrder } from "../domain/marketplace-order-transitions";
import type {
  CreateMarketplaceOrder,
  MarketplaceTransition,
} from "../domain/marketplace-order.schema";
import { ServicePortalService } from "./service-portal.service";

@Injectable()
export class MarketplaceOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: ServicePortalService,
  ) {}

  async createGuestOrder(scope: { hotelId: string; stayId: string }, body: CreateMarketplaceOrder) {
    const existing = await this.prisma.marketplaceOrder.findUnique({
      where: {
        stayId_idempotencyKey: { stayId: scope.stayId, idempotencyKey: body.idempotencyKey },
      },
    });
    if (existing) return existing;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const service = await tx.marketplaceService.findFirst({
          where: {
            id: body.serviceId,
            status: MarketplaceRecordStatus.ACTIVE,
            category: { isActive: true },
            serviceTenant: {
              type: "SERVICE",
              serviceProfile: { status: MarketplaceRecordStatus.ACTIVE },
              hotelServiceLinks: { some: { hotelId: scope.hotelId, status: "ACTIVE" } },
            },
          },
        });
        if (!service) throw new NotFoundException("Không tìm thấy dịch vụ Marketplace");
        const reserved =
          service.capacityAvailable == null
            ? 1
            : (
                await tx.marketplaceService.updateMany({
                  where: {
                    id: service.id,
                    serviceTenantId: service.serviceTenantId,
                    status: MarketplaceRecordStatus.ACTIVE,
                    capacityAvailable: { gte: body.quantity },
                  },
                  data: {
                    capacityAvailable: { decrement: body.quantity },
                    version: { increment: 1 },
                  },
                })
              ).count;
        if (reserved !== 1) throw new ConflictException("Dịch vụ đã hết khả năng phục vụ");
        const totalAmount = service.unitPrice.mul(body.quantity);
        return tx.marketplaceOrder.create({
          data: {
            orderNumber: `MP${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`,
            idempotencyKey: body.idempotencyKey,
            hotelId: scope.hotelId,
            stayId: scope.stayId,
            serviceTenantId: service.serviceTenantId,
            serviceId: service.id,
            quantity: body.quantity,
            unitPriceSnapshot: service.unitPrice,
            totalAmount,
            currency: service.currency,
            serviceNameSnapshot: service.name,
            serviceModeSnapshot: service.mode,
            waitingMinutesSnapshot: service.waitingMinutes,
            guestNote: body.guestNote,
            capacityReservationStatus:
              service.capacityAvailable == null
                ? CapacityReservationStatus.NOT_REQUIRED
                : CapacityReservationStatus.RESERVED,
            events: {
              create: {
                actorType: MarketplaceOrderActorType.GUEST,
                toStatus: MarketplaceOrderStatus.PENDING,
              },
            },
          },
          include: { events: true },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.prisma.marketplaceOrder.findUnique({
          where: {
            stayId_idempotencyKey: { stayId: scope.stayId, idempotencyKey: body.idempotencyKey },
          },
        });
        if (duplicate) return duplicate;
      }
      throw error;
    }
  }

  listGuestOrders(stayId: string) {
    return this.prisma.marketplaceOrder.findMany({
      where: { stayId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async guestOrder(stayId: string, orderId: string) {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: orderId, stayId },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) throw new NotFoundException("Không tìm thấy đơn Marketplace");
    return order;
  }

  async listServiceOrders(userId: string) {
    return this.prisma.marketplaceOrder.findMany({
      where: { serviceTenantId: await this.portal.tenantId(userId) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async serviceOrder(userId: string, orderId: string) {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: orderId, serviceTenantId: await this.portal.tenantId(userId) },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) throw new NotFoundException("Không tìm thấy đơn Marketplace");
    return order;
  }

  listHotelOrders(hotelId: string) {
    return this.prisma.marketplaceOrder.findMany({
      where: { hotelId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async hotelOrder(hotelId: string, orderId: string) {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: orderId, hotelId },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) throw new NotFoundException("Không tìm thấy đơn Marketplace");
    return order;
  }

  async hotelRevenue(hotelId: string, from?: Date, to?: Date, serviceTenantId?: string) {
    const where = {
      hotelId,
      ...(serviceTenantId ? { serviceTenantId } : {}),
      ...(from || to
        ? { recognizedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    };
    const [summary, entries] = await Promise.all([
      this.prisma.marketplaceRevenueEntry.aggregate({
        where,
        _sum: { grossAmount: true },
        _count: true,
      }),
      this.prisma.marketplaceRevenueEntry.findMany({
        where,
        orderBy: { recognizedAt: "desc" },
        take: 100,
      }),
    ]);
    return { grossAmount: summary._sum.grossAmount ?? 0, orderCount: summary._count, entries };
  }

  async transitionServiceOrder(userId: string, orderId: string, body: MarketplaceTransition) {
    const serviceTenantId = await this.portal.tenantId(userId);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.marketplaceOrder.findFirst({
        where: { id: orderId, serviceTenantId },
      });
      if (!order) throw new NotFoundException("Không tìm thấy đơn Marketplace");
      if (!canTransitionMarketplaceOrder(order.status, body.toStatus, order.serviceModeSnapshot))
        throw new ConflictException("Trạng thái đơn không hợp lệ");
      const updated = await tx.marketplaceOrder.updateMany({
        where: { id: order.id, serviceTenantId, status: order.status, version: order.version },
        data: {
          status: body.toStatus,
          version: { increment: 1 },
          completedAt: body.toStatus === "COMPLETED" ? new Date() : undefined,
          cancelledAt: body.toStatus === "CANCELLED" ? new Date() : undefined,
          capacityReservationStatus:
            body.toStatus === "COMPLETED" && order.capacityReservationStatus === "RESERVED"
              ? "CONSUMED"
              : body.toStatus === "CANCELLED" && order.capacityReservationStatus === "RESERVED"
                ? "RELEASED"
                : undefined,
        },
      });
      if (updated.count !== 1) throw new ConflictException("Đơn đã được cập nhật bởi người khác");
      if (body.toStatus === "CANCELLED" && order.capacityReservationStatus === "RESERVED")
        await tx.marketplaceService.update({
          where: { id: order.serviceId },
          data: { capacityAvailable: { increment: order.quantity }, version: { increment: 1 } },
        });
      if (body.toStatus === "COMPLETED")
        await tx.marketplaceRevenueEntry.create({
          data: {
            orderId: order.id,
            hotelId: order.hotelId,
            serviceTenantId,
            grossAmount: order.totalAmount,
            currency: order.currency,
            recognizedAt: new Date(),
          },
        });
      await tx.marketplaceOrderEvent.create({
        data: {
          orderId: order.id,
          actorType: MarketplaceOrderActorType.SERVICE_STAFF,
          actorId: userId,
          fromStatus: order.status,
          toStatus: body.toStatus,
          note: body.note,
        },
      });
      return tx.marketplaceOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: { events: { orderBy: { createdAt: "asc" } }, revenue: true },
      });
    });
  }
}
