import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CapacityReservationStatus,
  FolioItemSourceType,
  FolioItemType,
  FolioStatus,
  MarketplaceOrderActorType,
  MarketplaceOrderStatus,
  MarketplaceRecordStatus,
  MarketplaceServiceMode,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import { RequestRealtimeEmitter } from "../../../request-realtime.emitter";
import { canTransitionMarketplaceOrder } from "../domain/marketplace-order-transitions";
import type {
  CheckoutCart,
  CreateMarketplaceOrder,
  MarketplaceTransition,
} from "../domain/marketplace-order.schema";
import { ServicePortalService } from "./service-portal.service";
import type { SupportedLocale } from "../../../common/i18n/i18n.types";
import {
  calculateFeePercentage,
  calculateOnSiteServiceFee,
} from "../domain/marketplace-pricing";

@Injectable()
export class MarketplaceOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: ServicePortalService,
  ) {}

  async createGuestOrder(
    scope: { hotelId: string; stayId: string; sessionId?: string },
    body: CreateMarketplaceOrder,
  ) {
    const existing = await this.prisma.marketplaceOrder.findUnique({
      where: {
        stayId_idempotencyKey: { stayId: scope.stayId, idempotencyKey: body.idempotencyKey },
      },
      include: {
        items: true,
        events: { orderBy: { createdAt: "asc" } },
        voucher: true,
      },
    });
    if (existing) return existing;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const pricingConfig = await tx.marketplacePricingConfig?.findUnique({
          where: { id: "default" },
          select: { deliveryServiceFeeRate: true },
        });
        const service = await tx.marketplaceService.findFirst({
          where: {
            id: body.serviceId,
            status: MarketplaceRecordStatus.ACTIVE,
            serviceTenant: {
              type: "SERVICE",
              serviceProfile: {
                status: MarketplaceRecordStatus.ACTIVE,
                categoryId: { not: null },
                category: { isActive: true },
              },
              hotelServiceLinks: { some: { hotelId: scope.hotelId, status: "ACTIVE" } },
            },
          },
          include: { serviceTenant: { include: { serviceProfile: true } } },
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

        const partnerSubtotal = service.unitPrice.mul(body.quantity);
        const hotelServiceFeeAmount = calculateOnSiteServiceFee(
          partnerSubtotal,
          service.mode,
          service.serviceTenant.serviceProfile?.deliveryServiceFeeRate ??
            pricingConfig?.deliveryServiceFeeRate,
        );
        const customerTotalAmount = partnerSubtotal.add(hotelServiceFeeAmount);
        const totalAmount = customerTotalAmount;

        const order = await tx.marketplaceOrder.create({
          data: {
            orderNumber: `MP${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`,
            idempotencyKey: body.idempotencyKey,
            hotelId: scope.hotelId,
            stayId: scope.stayId,
            serviceTenantId: service.serviceTenantId,
            serviceId: service.id,
            quantity: body.quantity,
            unitPriceSnapshot: service.unitPrice,
            pricingUnitSnapshot: service.pricingUnit,
            partnerSubtotal,
            hotelServiceFeeAmount,
            customerTotalAmount,
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
            items: {
              create: {
                serviceId: service.id,
                quantity: body.quantity,
                unitPriceSnapshot: service.unitPrice,
                pricingUnitSnapshot: service.pricingUnit,
                serviceNameSnapshot: service.name,
                serviceModeSnapshot: service.mode,
                waitingMinutesSnapshot: service.waitingMinutes,
                partnerSubtotal,
                hotelServiceFeeAmount,
                customerTotalAmount,
                currency: service.currency,
                guestNote: body.guestNote,
              },
            },
            events: {
              create: {
                actorType: MarketplaceOrderActorType.GUEST,
                toStatus: MarketplaceOrderStatus.PENDING,
              },
            },
          },
          include: { items: true, events: true },
        });

        // Clear cart items for this service if a cart exists for this session
        if (scope.sessionId) {
          const cart = await tx.guestCart.findUnique({
            where: { sessionId: scope.sessionId },
          });
          if (cart) {
            await tx.guestCartItem.deleteMany({
              where: { cartId: cart.id, serviceId: service.id },
            });
          }
        }

        return order;
      });

      const orderWithDetails = await this.prisma.marketplaceOrder.findUnique({
        where: { id: created.id },
        include: {
          items: true,
          stay: {
            select: {
              guestDisplayName: true,
              room: { select: { id: true, roomNumber: true } },
              guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
            },
          },
          serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
        },
      });

      if (orderWithDetails) {
        RequestRealtimeEmitter.emitExternalServiceOrderCreated({
          orderId: orderWithDetails.id,
          orderNumber: orderWithDetails.orderNumber,
          hotelId: orderWithDetails.hotelId,
          stayId: orderWithDetails.stayId,
          sessionId: scope.sessionId ?? orderWithDetails.stay?.guestSessions?.[0]?.id,
          roomId: orderWithDetails.stay?.room?.id,
          roomNumber: orderWithDetails.stay?.room?.roomNumber,
          guestDisplayName: orderWithDetails.stay?.guestDisplayName,
          serviceTenantId: orderWithDetails.serviceTenantId,
          serviceTenantName: orderWithDetails.serviceTenant?.serviceProfile?.displayName,
          serviceId: orderWithDetails.serviceId,
          serviceName: orderWithDetails.serviceNameSnapshot,
          status: orderWithDetails.status,
          quantity: orderWithDetails.quantity,
          pricingUnit: orderWithDetails.pricingUnitSnapshot,
          unitPrice: orderWithDetails.unitPriceSnapshot.toString(),
          partnerSubtotal: (orderWithDetails.partnerSubtotal ?? orderWithDetails.totalAmount).toString(),
          hotelServiceFeeAmount: (orderWithDetails.hotelServiceFeeAmount ?? new Prisma.Decimal(0)).toString(),
          customerTotalAmount: (orderWithDetails.customerTotalAmount ?? orderWithDetails.totalAmount).toString(),
          totalAmount: orderWithDetails.totalAmount.toString(),
          currency: orderWithDetails.currency,
          guestNote: orderWithDetails.guestNote,
          serviceMode: orderWithDetails.serviceModeSnapshot,
          createdAt: orderWithDetails.createdAt.toISOString(),
          version: orderWithDetails.version,
          items: orderWithDetails.items?.map((it) => ({
            serviceId: it.serviceId,
            serviceName: it.serviceNameSnapshot,
            quantity: it.quantity,
            unitPrice: it.unitPriceSnapshot.toString(),
            partnerSubtotal: it.partnerSubtotal.toString(),
            hotelServiceFeeAmount: it.hotelServiceFeeAmount.toString(),
            customerTotalAmount: it.customerTotalAmount.toString(),
          })),
        });
      }

      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.prisma.marketplaceOrder.findUnique({
          where: {
            stayId_idempotencyKey: { stayId: scope.stayId, idempotencyKey: body.idempotencyKey },
          },
          include: { items: true, events: true },
        });
        if (duplicate) return duplicate;
      }
      throw error;
    }
  }

  async checkoutGuestCart(
    scope: { hotelId: string; stayId: string; sessionId: string },
    body: CheckoutCart,
  ) {
    const existingOrders = await this.prisma.marketplaceOrder.findMany({
      where: {
        stayId: scope.stayId,
        OR: [
          { idempotencyKey: body.idempotencyKey },
          { idempotencyKey: { startsWith: `${body.idempotencyKey}-` } },
        ],
      },
      include: {
        items: true,
        events: { orderBy: { createdAt: "asc" } },
        voucher: true,
      },
      orderBy: { createdAt: "asc" },
    });
    if (existingOrders.length > 0) {
      return existingOrders.length === 1 ? existingOrders[0] : { orders: existingOrders };
    }

    try {
      const createdOrders = await this.prisma.$transaction(async (tx) => {
        const pricingConfig = await tx.marketplacePricingConfig?.findUnique({
          where: { id: "default" },
          select: { deliveryServiceFeeRate: true },
        });
        const cart = await tx.guestCart.findUnique({
          where: { sessionId: scope.sessionId },
          include: {
            items: {
              include: {
                service: {
                  include: {
                    serviceTenant: {
                      include: {
                        serviceProfile: {
                          include: { category: true },
                        },
                        hotelServiceLinks: {
                          where: { hotelId: scope.hotelId, status: "ACTIVE" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!cart || cart.items.length === 0) {
          throw new ConflictException("Giỏ hàng đang trống");
        }

        // Validate each item in the cart
        for (const item of cart.items) {
          const service = item.service;
          if (
            service.status !== MarketplaceRecordStatus.ACTIVE ||
            service.serviceTenant.type !== "SERVICE" ||
            service.serviceTenant.serviceProfile?.status !== MarketplaceRecordStatus.ACTIVE ||
            !service.serviceTenant.serviceProfile?.category?.isActive ||
            service.serviceTenant.hotelServiceLinks.length === 0
          ) {
            throw new NotFoundException(`Dịch vụ ${service.name} không còn khả dụng`);
          }

          // Atomic capacity reservation
          if (service.capacityAvailable != null) {
            const reserved = await tx.marketplaceService.updateMany({
              where: {
                id: service.id,
                serviceTenantId: service.serviceTenantId,
                status: MarketplaceRecordStatus.ACTIVE,
                capacityAvailable: { gte: item.quantity },
              },
              data: {
                capacityAvailable: { decrement: item.quantity },
                version: { increment: 1 },
              },
            });
            if (reserved.count !== 1) {
              throw new ConflictException(`Dịch vụ ${service.name} đã hết khả năng phục vụ`);
            }
          }
        }

        // Group cart items by serviceTenantId
        const itemsByTenant = new Map<string, typeof cart.items>();
        for (const item of cart.items) {
          const tenantId = item.service.serviceTenantId;
          const list = itemsByTenant.get(tenantId) ?? [];
          list.push(item);
          itemsByTenant.set(tenantId, list);
        }

        const orders: any[] = [];
        let orderIndex = 0;

        for (const [tenantId, tenantItems] of itemsByTenant) {
          const primaryItem = tenantItems[0];
          const tenantIdempotencyKey =
            itemsByTenant.size === 1
              ? body.idempotencyKey
              : `${body.idempotencyKey}-${orderIndex}`;
          orderIndex++;

          let partnerSubtotal = new Prisma.Decimal(0);
          let hotelServiceFeeAmount = new Prisma.Decimal(0);
          let totalQuantity = 0;
          let hasReservedCapacity = false;

          const orderItemCreateData = tenantItems.map((ci) => {
            const itemSubtotal = ci.service.unitPrice.mul(ci.quantity);
            const itemFee = calculateOnSiteServiceFee(
              itemSubtotal,
              ci.service.mode,
              ci.service.serviceTenant.serviceProfile?.deliveryServiceFeeRate ??
                pricingConfig?.deliveryServiceFeeRate,
            );
            const itemTotal = itemSubtotal.add(itemFee);
            partnerSubtotal = partnerSubtotal.add(itemSubtotal);
            hotelServiceFeeAmount = hotelServiceFeeAmount.add(itemFee);
            totalQuantity += ci.quantity;
            if (ci.service.capacityAvailable != null) {
              hasReservedCapacity = true;
            }

            return {
              serviceId: ci.service.id,
              quantity: ci.quantity,
              unitPriceSnapshot: ci.service.unitPrice,
              pricingUnitSnapshot: ci.service.pricingUnit,
              serviceNameSnapshot: ci.service.name,
              serviceModeSnapshot: ci.service.mode,
              waitingMinutesSnapshot: ci.service.waitingMinutes,
              partnerSubtotal: itemSubtotal,
              hotelServiceFeeAmount: itemFee,
              customerTotalAmount: itemTotal,
              currency: ci.service.currency,
              guestNote: ci.guestNote ?? body.guestNote,
            };
          });

          const customerTotalAmount = partnerSubtotal.add(hotelServiceFeeAmount);
          const totalAmount = customerTotalAmount;

          const order = await tx.marketplaceOrder.create({
            data: {
              orderNumber: `MP${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`,
              idempotencyKey: tenantIdempotencyKey,
              hotelId: scope.hotelId,
              stayId: scope.stayId,
              serviceTenantId: tenantId,
              serviceId: primaryItem.service.id,
              quantity: totalQuantity,
              unitPriceSnapshot: primaryItem.service.unitPrice,
              pricingUnitSnapshot: primaryItem.service.pricingUnit,
              partnerSubtotal,
              hotelServiceFeeAmount,
              customerTotalAmount,
              totalAmount,
              currency: primaryItem.service.currency,
              serviceNameSnapshot:
                tenantItems.length === 1
                  ? primaryItem.service.name
                  : `${primaryItem.service.name} (+${tenantItems.length - 1} khác)`,
              serviceModeSnapshot: primaryItem.service.mode,
              waitingMinutesSnapshot: primaryItem.service.waitingMinutes,
              guestNote: body.guestNote ?? primaryItem.guestNote,
              capacityReservationStatus: hasReservedCapacity
                ? CapacityReservationStatus.RESERVED
                : CapacityReservationStatus.NOT_REQUIRED,
              items: {
                create: orderItemCreateData,
              },
              events: {
                create: {
                  actorType: MarketplaceOrderActorType.GUEST,
                  toStatus: MarketplaceOrderStatus.PENDING,
                },
              },
            },
            include: { items: true, events: true },
          });

          orders.push(order);
        }

        // Clear cart items inside transaction (commits only when transaction succeeds)
        await tx.guestCartItem.deleteMany({
          where: { cartId: cart.id },
        });

        return orders;
      });

      // Post-commit realtime emissions
      for (const order of createdOrders) {
        const orderWithDetails = await this.prisma.marketplaceOrder.findUnique({
          where: { id: order.id },
          include: {
            items: true,
            stay: {
              select: {
                guestDisplayName: true,
                room: { select: { id: true, roomNumber: true } },
                guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
              },
            },
            serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
          },
        });

        if (orderWithDetails) {
          RequestRealtimeEmitter.emitExternalServiceOrderCreated({
            orderId: orderWithDetails.id,
            orderNumber: orderWithDetails.orderNumber,
            hotelId: orderWithDetails.hotelId,
            stayId: orderWithDetails.stayId,
            sessionId: scope.sessionId,
            roomId: orderWithDetails.stay?.room?.id,
            roomNumber: orderWithDetails.stay?.room?.roomNumber,
            guestDisplayName: orderWithDetails.stay?.guestDisplayName,
            serviceTenantId: orderWithDetails.serviceTenantId,
            serviceTenantName: orderWithDetails.serviceTenant?.serviceProfile?.displayName,
            serviceId: orderWithDetails.serviceId,
            serviceName: orderWithDetails.serviceNameSnapshot,
            status: orderWithDetails.status,
            quantity: orderWithDetails.quantity,
            pricingUnit: orderWithDetails.pricingUnitSnapshot,
            unitPrice: orderWithDetails.unitPriceSnapshot.toString(),
            partnerSubtotal: (orderWithDetails.partnerSubtotal ?? orderWithDetails.totalAmount).toString(),
            hotelServiceFeeAmount: (orderWithDetails.hotelServiceFeeAmount ?? new Prisma.Decimal(0)).toString(),
            customerTotalAmount: (orderWithDetails.customerTotalAmount ?? orderWithDetails.totalAmount).toString(),
            totalAmount: orderWithDetails.totalAmount.toString(),
            currency: orderWithDetails.currency,
            guestNote: orderWithDetails.guestNote,
            serviceMode: orderWithDetails.serviceModeSnapshot,
            createdAt: orderWithDetails.createdAt.toISOString(),
            version: orderWithDetails.version,
            items: orderWithDetails.items?.map((it) => ({
              serviceId: it.serviceId,
              serviceName: it.serviceNameSnapshot,
              quantity: it.quantity,
              unitPrice: it.unitPriceSnapshot.toString(),
              partnerSubtotal: it.partnerSubtotal.toString(),
              hotelServiceFeeAmount: it.hotelServiceFeeAmount.toString(),
              customerTotalAmount: it.customerTotalAmount.toString(),
            })),
          });
        }
      }

      return createdOrders.length === 1 ? createdOrders[0] : { orders: createdOrders };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicateOrders = await this.prisma.marketplaceOrder.findMany({
          where: {
            stayId: scope.stayId,
            OR: [
              { idempotencyKey: body.idempotencyKey },
              { idempotencyKey: { startsWith: `${body.idempotencyKey}-` } },
            ],
          },
          include: { items: true, events: true, voucher: true },
          orderBy: { createdAt: "asc" },
        });
        if (duplicateOrders.length > 0) {
          return duplicateOrders.length === 1 ? duplicateOrders[0] : { orders: duplicateOrders };
        }
      }
      throw error;
    }
  }

  async listGuestOrders(stayId: string, locale: SupportedLocale = "vi-VN") {
    const orders = await this.prisma.marketplaceOrder.findMany({
      where: { stayId },
      include: {
        items: true,
        voucher: true,
        service: { include: { translations: true } },
        serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const shortLocale = locale === "vi-VN" ? "vi" : locale;
    return orders.map((order) => {
      const translation = order.service.translations.find(
        (item) => item.locale === locale || item.locale === shortLocale,
      );
      if (!translation) return order;
      const { service: _service, ...publicOrder } = order;
      return { ...publicOrder, serviceNameSnapshot: translation.name };
    });
  }

  async guestOrder(stayId: string, orderId: string) {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: orderId, stayId },
      include: {
        items: true,
        voucher: true,
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new NotFoundException("Không tìm thấy đơn Marketplace");
    return order;
  }

  async listServiceOrders(userId: string) {
    return this.prisma.marketplaceOrder.findMany({
      where: { serviceTenantId: await this.portal.tenantId(userId) },
      include: {
        items: true,
        voucher: true,
        settlement: true,
        stay: { select: { guestDisplayName: true, room: { select: { roomNumber: true } } } },
        hotel: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async serviceOrder(userId: string, orderId: string) {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: orderId, serviceTenantId: await this.portal.tenantId(userId) },
      include: {
        items: true,
        voucher: true,
        settlement: true,
        events: { orderBy: { createdAt: "asc" } },
        stay: { select: { guestDisplayName: true, room: { select: { roomNumber: true } } } },
        hotel: { select: { name: true } },
      },
    });
    if (!order) throw new NotFoundException("Không tìm thấy đơn Marketplace");
    return order;
  }

  listHotelOrders(hotelId: string) {
    return this.prisma.marketplaceOrder.findMany({
      where: { hotelId },
      include: {
        items: true,
        voucher: true,
        settlement: true,
        stay: { select: { guestDisplayName: true, room: { select: { roomNumber: true } } } },
        serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async hotelOrder(hotelId: string, orderId: string) {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: orderId, hotelId },
      include: {
        items: true,
        voucher: true,
        settlement: true,
        events: { orderBy: { createdAt: "asc" } },
        serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
      },
    });
    if (!order) throw new NotFoundException("Không tìm thấy đơn Marketplace");
    return order;
  }

  async cancelHotelOrder(_userId: string, hotelId: string, orderId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.marketplaceOrder.findFirst({
        where: { id: orderId, hotelId },
      });
      if (!order) throw new NotFoundException("Không tìm thấy đơn Marketplace");
      if (order.status === "COMPLETED" || order.status === "CANCELLED") {
        throw new ConflictException("Đơn hàng đã ở trạng thái kết thúc, không thể hủy");
      }
      if (order.status !== "PENDING") {
        throw new ConflictException(
          "Đối tác đã xác nhận hoặc đơn hàng đang xử lý, khách sạn không được phép hủy",
        );
      }
      const updated = await tx.marketplaceOrder.updateMany({
        where: { id: order.id, hotelId, status: order.status, version: order.version },
        data: {
          status: "CANCELLED",
          version: { increment: 1 },
          cancelledAt: new Date(),
          capacityReservationStatus:
            order.capacityReservationStatus === "RESERVED" ? "RELEASED" : undefined,
        },
      });
      if (updated.count !== 1) throw new ConflictException("Đơn đã được cập nhật bởi người khác");
      if (order.capacityReservationStatus === "RESERVED") {
        const orderItems = await tx.marketplaceOrderItem.findMany({ where: { orderId: order.id } });
        if (orderItems.length > 0) {
          for (const it of orderItems) {
            const svc = await tx.marketplaceService.findUnique({ where: { id: it.serviceId } });
            if (svc && svc.capacityAvailable != null) {
              await tx.marketplaceService.update({
                where: { id: it.serviceId },
                data: { capacityAvailable: { increment: it.quantity }, version: { increment: 1 } },
              });
            }
          }
        } else {
          await tx.marketplaceService.update({
            where: { id: order.serviceId },
            data: { capacityAvailable: { increment: order.quantity }, version: { increment: 1 } },
          });
        }
      }

      await tx.marketplaceOrderEvent.create({
        data: {
          orderId: order.id,
          actorType: MarketplaceOrderActorType.HOTEL_STAFF,
          actorId: _userId,
          fromStatus: order.status,
          toStatus: MarketplaceOrderStatus.CANCELLED,
          note: "Đơn dịch vụ ngoài đã bị hủy bởi lễ tân khách sạn",
        },
      });

      return tx.marketplaceOrder.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          events: { orderBy: { createdAt: "asc" } },
          revenue: true,
          settlement: true,
          voucher: true,
          stay: {
            select: {
              guestDisplayName: true,
              room: { select: { id: true, roomNumber: true } },
              guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
            },
          },
          serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
        },
      });
    });

    RequestRealtimeEmitter.emitExternalServiceOrderStatusChanged({
      orderId: result.id,
      orderNumber: result.orderNumber,
      hotelId: result.hotelId,
      stayId: result.stayId,
      sessionId: result.stay?.guestSessions?.[0]?.id,
      roomId: result.stay?.room?.id,
      roomNumber: result.stay?.room?.roomNumber,
      guestDisplayName: result.stay?.guestDisplayName,
      serviceTenantId: result.serviceTenantId,
      serviceTenantName: result.serviceTenant?.serviceProfile?.displayName,
      serviceId: result.serviceId,
      serviceName: result.serviceNameSnapshot,
      quantity: result.quantity,
      pricingUnit: result.pricingUnitSnapshot,
      unitPrice: result.unitPriceSnapshot.toString(),
      partnerSubtotal: result.partnerSubtotal
        ? result.partnerSubtotal.toString()
        : result.totalAmount.toString(),
      hotelServiceFeeAmount: result.hotelServiceFeeAmount
        ? result.hotelServiceFeeAmount.toString()
        : "0",
      customerTotalAmount: result.customerTotalAmount
        ? result.customerTotalAmount.toString()
        : result.totalAmount.toString(),
      totalAmount: result.totalAmount.toString(),
      currency: result.currency,
      guestNote: result.guestNote,
      serviceMode: result.serviceModeSnapshot,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      version: result.version,
      status: "CANCELLED",
      items: result.items?.map((it) => ({
        serviceId: it.serviceId,
        serviceName: it.serviceNameSnapshot,
        quantity: it.quantity,
        unitPrice: it.unitPriceSnapshot.toString(),
        partnerSubtotal: it.partnerSubtotal.toString(),
        hotelServiceFeeAmount: it.hotelServiceFeeAmount.toString(),
        customerTotalAmount: it.customerTotalAmount.toString(),
      })),
    });

    return result;
  }

  async acknowledgeHotelOrder(_userId: string, hotelId: string, orderId: string) {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: orderId, hotelId },
      include: {
        voucher: true,
        stay: {
          select: {
            guestDisplayName: true,
            room: { select: { id: true, roomNumber: true } },
            guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
          },
        },
        serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
      },
    });
    if (!order) throw new NotFoundException("Không tìm thấy đơn Marketplace");

    if (order.status === "COMPLETED") {
      throw new ConflictException("Đơn hàng đã hoàn thành, không thể thực hiện tiếp nhận");
    }
    if ((order.status as string) === "CANCELLED" || (order.status as string) === "REJECTED") {
      throw new ConflictException("Đơn hàng đã bị hủy, không thể thực hiện tiếp nhận");
    }

    const voucherNumber =
      order.voucher?.voucherNumber ??
      `VS-${randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
    const verificationCode =
      order.voucher?.verificationCode ??
      randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const qrTokenHash = order.voucher?.qrTokenHash ?? `VSQ_${randomUUID().replaceAll("-", "")}`;

    const voucher = await this.prisma.serviceVoucher.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        hotelId: order.hotelId,
        serviceTenantId: order.serviceTenantId,
        serviceId: order.serviceId,
        voucherNumber,
        verificationCode,
        qrTokenHash,
        status: "ISSUED",
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      update: {
        status: "ISSUED",
      },
    });

    const updated = await this.prisma.marketplaceOrder.update({
      where: { id: order.id },
      data: { hotelCoordinationStatus: "VOUCHER_ISSUED" },
      include: {
        items: true,
        voucher: true,
        stay: {
          select: {
            guestDisplayName: true,
            room: { select: { id: true, roomNumber: true } },
            guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
          },
        },
        serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
      },
    });

    const partnerSubtotal = updated.partnerSubtotal
      ? updated.partnerSubtotal.toString()
      : updated.totalAmount.toString();
    const hotelServiceFeeAmount = updated.hotelServiceFeeAmount
      ? updated.hotelServiceFeeAmount.toString()
      : "0";
    const customerTotalAmount = updated.customerTotalAmount
      ? updated.customerTotalAmount.toString()
      : updated.totalAmount.toString();

    const itemsPayload = updated.items?.map((it) => ({
      serviceId: it.serviceId,
      serviceName: it.serviceNameSnapshot,
      quantity: it.quantity,
      unitPrice: it.unitPriceSnapshot.toString(),
      partnerSubtotal: it.partnerSubtotal.toString(),
      hotelServiceFeeAmount: it.hotelServiceFeeAmount.toString(),
      customerTotalAmount: it.customerTotalAmount.toString(),
    }));

    RequestRealtimeEmitter.emitExternalServiceOrderHotelAcknowledged({
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      hotelId: updated.hotelId,
      stayId: updated.stayId,
      sessionId: updated.stay?.guestSessions?.[0]?.id,
      roomId: updated.stay?.room?.id,
      roomNumber: updated.stay?.room?.roomNumber,
      guestDisplayName: updated.stay?.guestDisplayName,
      serviceTenantId: updated.serviceTenantId,
      serviceTenantName: updated.serviceTenant?.serviceProfile?.displayName,
      serviceId: updated.serviceId,
      serviceName: updated.serviceNameSnapshot,
      status: updated.status,
      hotelStatus: updated.hotelCoordinationStatus,
      voucherNumber: voucher.voucherNumber,
      quantity: updated.quantity,
      pricingUnit: updated.pricingUnitSnapshot,
      unitPrice: updated.unitPriceSnapshot.toString(),
      partnerSubtotal,
      hotelServiceFeeAmount,
      customerTotalAmount,
      totalAmount: updated.totalAmount.toString(),
      currency: updated.currency,
      guestNote: updated.guestNote,
      serviceMode: updated.serviceModeSnapshot,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      version: updated.version,
      items: itemsPayload,
    });

    RequestRealtimeEmitter.emitExternalServiceOrderVoucherIssued({
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      hotelId: updated.hotelId,
      stayId: updated.stayId,
      sessionId: updated.stay?.guestSessions?.[0]?.id,
      roomId: updated.stay?.room?.id,
      roomNumber: updated.stay?.room?.roomNumber,
      guestDisplayName: updated.stay?.guestDisplayName,
      serviceTenantId: updated.serviceTenantId,
      serviceTenantName: updated.serviceTenant?.serviceProfile?.displayName,
      serviceId: updated.serviceId,
      serviceName: updated.serviceNameSnapshot,
      status: updated.status,
      hotelStatus: updated.hotelCoordinationStatus,
      voucherNumber: voucher.voucherNumber,
      quantity: updated.quantity,
      pricingUnit: updated.pricingUnitSnapshot,
      unitPrice: updated.unitPriceSnapshot.toString(),
      partnerSubtotal,
      hotelServiceFeeAmount,
      customerTotalAmount,
      totalAmount: updated.totalAmount.toString(),
      currency: updated.currency,
      guestNote: updated.guestNote,
      serviceMode: updated.serviceModeSnapshot,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      version: updated.version,
      items: itemsPayload,
    });

    return updated;
  }

  async issueServiceVoucher(userId: string, hotelId: string, orderId: string) {
    return this.acknowledgeHotelOrder(userId, hotelId, orderId);
  }

  async completeHotelOrder(userId: string, hotelId: string, orderId: string) {
    const existingOrder = await this.prisma.marketplaceOrder.findFirst({
      where: { id: orderId, hotelId },
      include: { settlement: true, items: true },
    });
    if (!existingOrder) throw new NotFoundException("Không tìm thấy đơn Marketplace");

    if (existingOrder.status === "CANCELLED") {
      throw new ConflictException("Đơn hàng đã bị hủy, không thể thực hiện hoàn thành");
    }

    if (existingOrder.status === "COMPLETED") {
      return this.prisma.marketplaceOrder.findUniqueOrThrow({
        where: { id: existingOrder.id },
        include: {
          items: true,
          events: { orderBy: { createdAt: "asc" } },
          revenue: true,
          settlement: true,
          voucher: true,
          stay: { select: { guestDisplayName: true, room: { select: { roomNumber: true } } } },
          hotel: { select: { name: true } },
        },
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.marketplaceOrder.findUniqueOrThrow({
        where: { id: existingOrder.id },
      });

      if (order.status === "COMPLETED") {
        return { order };
      }

      await tx.marketplaceOrder.update({
        where: { id: order.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          version: { increment: 1 },
          capacityReservationStatus:
            order.capacityReservationStatus === "RESERVED" ? "CONSUMED" : undefined,
        },
      });

      const voucher = await tx.serviceVoucher.findUnique({
        where: { orderId: order.id },
      });

      if (voucher && voucher.status === "ISSUED") {
        await tx.serviceVoucher.update({
          where: { id: voucher.id },
          data: {
            status: "REDEEMED",
            redeemedAt: new Date(),
            redeemedByUserId: userId,
          },
        });
      }

      const partnerSubtotal =
        order.partnerSubtotal && !order.partnerSubtotal.isZero()
          ? order.partnerSubtotal
          : order.totalAmount;

      const hotelRevenue = order.hotelServiceFeeAmount ?? new Prisma.Decimal(0);

      await tx.marketplaceRevenueEntry.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          hotelId: order.hotelId,
          serviceTenantId: order.serviceTenantId,
          grossAmount: hotelRevenue,
          currency: order.currency,
          recognizedAt: new Date(),
        },
        update: {
          grossAmount: hotelRevenue,
          currency: order.currency,
        },
      });

      const commission = new Prisma.Decimal(0);
      const net = partnerSubtotal;

      const settlement = await tx.marketplaceSettlement.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          hotelId: order.hotelId,
          serviceTenantId: order.serviceTenantId,
          grossAmount: partnerSubtotal,
          commissionAmount: commission,
          netAmount: net,
          currency: order.currency,
          status: "UNSETTLED",
        },
        update: {
          grossAmount: partnerSubtotal,
          commissionAmount: commission,
          netAmount: net,
          currency: order.currency,
        },
      });

      await this.postToStayFolio(tx, order);

      await tx.marketplaceOrderEvent.create({
        data: {
          orderId: order.id,
          actorType: MarketplaceOrderActorType.HOTEL_STAFF,
          actorId: userId,
          fromStatus: order.status,
          toStatus: "COMPLETED",
          note: "Marketplace order marked as completed by hotel reception",
        },
      });

      return { settlement, order };
    });

    if (result.settlement) {
      RequestRealtimeEmitter.emitPartnerSettlementCreated({
        settlement: result.settlement,
        hotelId: existingOrder.hotelId,
        serviceTenantId: existingOrder.serviceTenantId,
      });
    }

    const orderWithDetails = await this.prisma.marketplaceOrder.findUnique({
      where: { id: existingOrder.id },
      include: {
        items: true,
        events: { orderBy: { createdAt: "asc" } },
        revenue: true,
        settlement: true,
        voucher: true,
        stay: {
          select: {
            guestDisplayName: true,
            room: { select: { id: true, roomNumber: true } },
            guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
          },
        },
        serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
      },
    });

    if (orderWithDetails) {
      RequestRealtimeEmitter.emitExternalServiceOrderStatusChanged({
        orderId: orderWithDetails.id,
        orderNumber: orderWithDetails.orderNumber,
        hotelId: orderWithDetails.hotelId,
        stayId: orderWithDetails.stayId,
        sessionId: orderWithDetails.stay?.guestSessions?.[0]?.id,
        roomId: orderWithDetails.stay?.room?.id,
        roomNumber: orderWithDetails.stay?.room?.roomNumber,
        guestDisplayName: orderWithDetails.stay?.guestDisplayName,
        serviceTenantId: orderWithDetails.serviceTenantId,
        serviceTenantName: orderWithDetails.serviceTenant?.serviceProfile?.displayName,
        serviceId: orderWithDetails.serviceId,
        serviceName: orderWithDetails.serviceNameSnapshot,
        status: orderWithDetails.status,
        hotelStatus: orderWithDetails.hotelCoordinationStatus,
        quantity: orderWithDetails.quantity,
        pricingUnit: orderWithDetails.pricingUnitSnapshot,
        unitPrice: orderWithDetails.unitPriceSnapshot.toString(),
        partnerSubtotal: (orderWithDetails.partnerSubtotal ?? orderWithDetails.totalAmount).toString(),
        hotelServiceFeeAmount: (orderWithDetails.hotelServiceFeeAmount ?? new Prisma.Decimal(0)).toString(),
        customerTotalAmount: (orderWithDetails.customerTotalAmount ?? orderWithDetails.totalAmount).toString(),
        totalAmount: orderWithDetails.totalAmount.toString(),
        currency: orderWithDetails.currency,
        guestNote: orderWithDetails.guestNote,
        serviceMode: orderWithDetails.serviceModeSnapshot,
        createdAt: orderWithDetails.createdAt.toISOString(),
        updatedAt: orderWithDetails.updatedAt.toISOString(),
        version: orderWithDetails.version,
      });
    }

    return orderWithDetails;
  }

  async verifyVoucher(userId: string, code: string) {
    const serviceTenantId = await this.portal.tenantId(userId);
    const cleaned = code.trim().toUpperCase();
    const withVs = cleaned.startsWith("VS-") ? cleaned : `VS-${cleaned}`;
    const rawWithoutVs = cleaned.replace(/^VS-/, "");
    const codeVariants = Array.from(new Set([cleaned, withVs, rawWithoutVs]));

    const voucher = await this.prisma.serviceVoucher.findFirst({
      where: {
        OR: [
          ...codeVariants.map((c) => ({ voucherNumber: c })),
          ...codeVariants.map((c) => ({ verificationCode: c })),
          { qrTokenHash: code.trim() },
        ],
        serviceTenantId,
      },
      include: {
        order: {
          include: {
            items: true,
            stay: { select: { guestDisplayName: true, room: { select: { roomNumber: true } } } },
            hotel: { select: { name: true } },
            voucher: true,
          },
        },
      },
    });

    let order = voucher?.order ?? null;

    if (!order) {
      const foundOrder = await this.prisma.marketplaceOrder.findFirst({
        where: {
          OR: [
            ...codeVariants.map((c) => ({ orderNumber: c })),
            ...codeVariants.map((c) => ({ id: c })),
          ],
          serviceTenantId,
        },
        include: {
          items: true,
          stay: { select: { guestDisplayName: true, room: { select: { roomNumber: true } } } },
          hotel: { select: { name: true } },
          voucher: true,
        },
      });
      if (foundOrder) {
        order = foundOrder;
      }
    }

    if (!order) {
      throw new NotFoundException("Mã dịch vụ không tồn tại hoặc không thuộc quyền quản lý");
    }

    if (order.status === "CANCELLED") {
      throw new ConflictException("Đơn dịch vụ đã bị hủy");
    }

    if (order.voucher?.status === "REDEEMED") {
      throw new ConflictException("Phiếu dịch vụ đã được sử dụng trước đó");
    }

    if (order.voucher?.status === "CANCELLED" || order.voucher?.status === "EXPIRED") {
      throw new ConflictException("Phiếu dịch vụ đã hết hạn hoặc bị hủy");
    }

    return {
      valid: true,
      status: order.status,
      voucherNumber: order.voucher?.voucherNumber ?? codeVariants[0],
      issuedAt: order.voucher?.issuedAt,
      expiresAt: order.voucher?.expiresAt,
      redeemedAt: order.voucher?.redeemedAt,
      order,
    };
  }

  async redeemVoucher(userId: string, code: string) {
    const serviceTenantId = await this.portal.tenantId(userId);
    const verification = await this.verifyVoucher(userId, code);

    if (!verification.valid) {
      throw new ConflictException("Phiếu dịch vụ không hợp lệ hoặc đã được sử dụng/hết hạn");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedCount = (
        await tx.serviceVoucher.updateMany({
          where: {
            voucherNumber: verification.voucherNumber,
            serviceTenantId,
            status: "ISSUED",
          },
          data: {
            status: "REDEEMED",
            redeemedAt: new Date(),
            redeemedByUserId: userId,
          },
        })
      ).count;

      if (updatedCount !== 1) {
        throw new ConflictException("Phiếu dịch vụ đã được sử dụng bởi giao dịch khác");
      }

      const order = await tx.marketplaceOrder.findUniqueOrThrow({
        where: { id: verification.order.id },
      });

      let settlementResult: any = null;

      if (order.status !== "COMPLETED") {
        await tx.marketplaceOrder.update({
          where: { id: order.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            version: { increment: 1 },
            capacityReservationStatus:
              order.capacityReservationStatus === "RESERVED" ? "CONSUMED" : undefined,
          },
        });

        const gross =
          order.partnerSubtotal && !order.partnerSubtotal.isZero()
            ? order.partnerSubtotal
            : order.totalAmount;

        await tx.marketplaceRevenueEntry.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            hotelId: order.hotelId,
            serviceTenantId,
            grossAmount: gross,
            currency: order.currency,
            recognizedAt: new Date(),
          },
          update: {
            grossAmount: gross,
            currency: order.currency,
          },
        });

        const commission = new Prisma.Decimal(0);
        const net = gross;

        const settlement = await tx.marketplaceSettlement.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            hotelId: order.hotelId,
            serviceTenantId,
            grossAmount: gross,
            commissionAmount: commission,
            netAmount: net,
            currency: order.currency,
            status: "UNSETTLED",
          },
          update: {
            grossAmount: gross,
            commissionAmount: commission,
            netAmount: net,
            currency: order.currency,
          },
        });

        await this.postToStayFolio(tx, order);

        await tx.marketplaceOrderEvent.create({
          data: {
            orderId: order.id,
            actorType: MarketplaceOrderActorType.SERVICE_STAFF,
            actorId: userId,
            fromStatus: order.status,
            toStatus: "COMPLETED",
            note: "Fulfillment completed via voucher redemption",
          },
        });

        settlementResult = settlement;
      }

      const voucher = await tx.serviceVoucher.findUniqueOrThrow({
        where: { voucherNumber: verification.voucherNumber },
        include: {
          order: {
            include: {
              items: true,
              stay: { select: { guestDisplayName: true, room: { select: { roomNumber: true } } } },
              hotel: { select: { name: true } },
            },
          },
        },
      });

      return { voucher, settlement: settlementResult, order };
    });

    if (result.settlement) {
      RequestRealtimeEmitter.emitPartnerSettlementCreated({
        settlement: result.settlement,
        hotelId: result.order.hotelId,
        serviceTenantId,
      });

      const orderWithDetails = await this.prisma.marketplaceOrder.findUnique({
        where: { id: result.order.id },
        include: {
          items: true,
          stay: {
            select: {
              guestDisplayName: true,
              room: { select: { id: true, roomNumber: true } },
              guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
            },
          },
          serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
        },
      });

      if (orderWithDetails) {
        RequestRealtimeEmitter.emitExternalServiceOrderStatusChanged({
          orderId: orderWithDetails.id,
          orderNumber: orderWithDetails.orderNumber,
          hotelId: orderWithDetails.hotelId,
          stayId: orderWithDetails.stayId,
          sessionId: orderWithDetails.stay?.guestSessions?.[0]?.id,
          roomId: orderWithDetails.stay?.room?.id,
          roomNumber: orderWithDetails.stay?.room?.roomNumber,
          guestDisplayName: orderWithDetails.stay?.guestDisplayName,
          serviceTenantId: orderWithDetails.serviceTenantId,
          serviceTenantName: orderWithDetails.serviceTenant?.serviceProfile?.displayName,
          serviceId: orderWithDetails.serviceId,
          serviceName: orderWithDetails.serviceNameSnapshot,
          status: orderWithDetails.status,
          quantity: orderWithDetails.quantity,
          pricingUnit: orderWithDetails.pricingUnitSnapshot,
          unitPrice: orderWithDetails.unitPriceSnapshot.toString(),
          partnerSubtotal: (orderWithDetails.partnerSubtotal ?? orderWithDetails.totalAmount).toString(),
          hotelServiceFeeAmount: (orderWithDetails.hotelServiceFeeAmount ?? new Prisma.Decimal(0)).toString(),
          customerTotalAmount: (orderWithDetails.customerTotalAmount ?? orderWithDetails.totalAmount).toString(),
          totalAmount: orderWithDetails.totalAmount.toString(),
          currency: orderWithDetails.currency,
          guestNote: orderWithDetails.guestNote,
          serviceMode: orderWithDetails.serviceModeSnapshot,
          createdAt: orderWithDetails.createdAt.toISOString(),
          updatedAt: orderWithDetails.updatedAt.toISOString(),
          version: orderWithDetails.version,
        });
      }
    }

    return result.voucher;
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
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.marketplaceOrder.findFirst({
        where: { id: orderId, serviceTenantId },
      });
      if (!order) throw new NotFoundException("Không tìm thấy đơn Marketplace");

      if (order.status === "COMPLETED" || order.status === "CANCELLED") {
        if (order.status === body.toStatus) {
          return tx.marketplaceOrder.findUniqueOrThrow({
            where: { id: order.id },
            include: {
              items: true,
              events: { orderBy: { createdAt: "asc" } },
              revenue: true,
              settlement: true,
            },
          });
        }
        throw new ConflictException("Đơn hàng đã ở trạng thái kết thúc, không thể thay đổi");
      }

      if (!canTransitionMarketplaceOrder(order.status, body.toStatus))
        throw new ConflictException("Trạng thái đơn không hợp lệ");

      let capacityReservationStatus: CapacityReservationStatus | undefined = undefined;
      if (body.toStatus === "COMPLETED" && order.capacityReservationStatus === "RESERVED") {
        capacityReservationStatus = "CONSUMED";
      } else if (body.toStatus === "CANCELLED" && order.capacityReservationStatus === "RESERVED") {
        capacityReservationStatus = "RELEASED";
      }

      const updated = await tx.marketplaceOrder.updateMany({
        where: { id: order.id, serviceTenantId, status: order.status, version: order.version },
        data: {
          status: body.toStatus,
          version: { increment: 1 },
          completedAt: body.toStatus === "COMPLETED" ? new Date() : undefined,
          cancelledAt: body.toStatus === "CANCELLED" ? new Date() : undefined,
          capacityReservationStatus,
        },
      });
      if (updated.count !== 1) throw new ConflictException("Đơn đã được cập nhật bởi người khác");
      if (body.toStatus === "CANCELLED" && order.capacityReservationStatus === "RESERVED") {
        const orderItems = await tx.marketplaceOrderItem.findMany({ where: { orderId: order.id } });
        if (orderItems.length > 0) {
          for (const it of orderItems) {
            const svc = await tx.marketplaceService.findUnique({ where: { id: it.serviceId } });
            if (svc && svc.capacityAvailable != null) {
              await tx.marketplaceService.update({
                where: { id: it.serviceId },
                data: { capacityAvailable: { increment: it.quantity }, version: { increment: 1 } },
              });
            }
          }
        } else {
          await tx.marketplaceService.update({
            where: { id: order.serviceId },
            data: { capacityAvailable: { increment: order.quantity }, version: { increment: 1 } },
          });
        }
      }
      if (body.toStatus === "COMPLETED") {
        const partnerSubtotal =
          order.partnerSubtotal && !order.partnerSubtotal.isZero()
            ? order.partnerSubtotal
            : order.totalAmount;
        const hotelRevenue = order.hotelServiceFeeAmount ?? new Prisma.Decimal(0);

        await tx.marketplaceRevenueEntry.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            hotelId: order.hotelId,
            serviceTenantId,
            grossAmount: hotelRevenue,
            currency: order.currency,
            recognizedAt: new Date(),
          },
          update: {
            grossAmount: hotelRevenue,
            currency: order.currency,
          },
        });
        const commission = new Prisma.Decimal(0);
        const settlement = await tx.marketplaceSettlement.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            hotelId: order.hotelId,
            serviceTenantId,
            grossAmount: partnerSubtotal,
            commissionAmount: commission,
            netAmount: partnerSubtotal,
            currency: order.currency,
            status: "UNSETTLED",
          },
          update: {
            grossAmount: partnerSubtotal,
            commissionAmount: commission,
            netAmount: partnerSubtotal,
            currency: order.currency,
          },
        });
        await this.postToStayFolio(tx, order);
        RequestRealtimeEmitter.emitPartnerSettlementCreated({
          settlement,
          hotelId: order.hotelId,
          serviceTenantId,
        });
      }
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
        include: {
          items: true,
          events: { orderBy: { createdAt: "asc" } },
          revenue: true,
          settlement: true,
        },
      });
    });

    const orderWithDetails = await this.prisma.marketplaceOrder.findUnique({
      where: { id: result.id },
      include: {
        items: true,
        stay: {
          select: {
            guestDisplayName: true,
            room: { select: { id: true, roomNumber: true } },
            guestSessions: { select: { id: true }, take: 1, orderBy: { createdAt: "desc" } },
          },
        },
        serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
      },
    });

    if (orderWithDetails) {
      RequestRealtimeEmitter.emitExternalServiceOrderStatusChanged({
        orderId: orderWithDetails.id,
        orderNumber: orderWithDetails.orderNumber,
        hotelId: orderWithDetails.hotelId,
        stayId: orderWithDetails.stayId,
        sessionId: orderWithDetails.stay?.guestSessions?.[0]?.id,
        roomId: orderWithDetails.stay?.room?.id,
        roomNumber: orderWithDetails.stay?.room?.roomNumber,
        guestDisplayName: orderWithDetails.stay?.guestDisplayName,
        serviceTenantId: orderWithDetails.serviceTenantId,
        serviceTenantName: orderWithDetails.serviceTenant?.serviceProfile?.displayName,
        serviceId: orderWithDetails.serviceId,
        serviceName: orderWithDetails.serviceNameSnapshot,
        status: orderWithDetails.status,
        quantity: orderWithDetails.quantity,
        pricingUnit: orderWithDetails.pricingUnitSnapshot,
        unitPrice: orderWithDetails.unitPriceSnapshot.toString(),
        partnerSubtotal: (orderWithDetails.partnerSubtotal ?? orderWithDetails.totalAmount).toString(),
        hotelServiceFeeAmount: (orderWithDetails.hotelServiceFeeAmount ?? new Prisma.Decimal(0)).toString(),
        customerTotalAmount: (orderWithDetails.customerTotalAmount ?? orderWithDetails.totalAmount).toString(),
        totalAmount: orderWithDetails.totalAmount.toString(),
        currency: orderWithDetails.currency,
        guestNote: orderWithDetails.guestNote,
        serviceMode: orderWithDetails.serviceModeSnapshot,
        createdAt: orderWithDetails.createdAt.toISOString(),
        updatedAt: orderWithDetails.updatedAt.toISOString(),
        version: orderWithDetails.version,
      });
    }

    return result;
  }

  private async postToStayFolio(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      hotelId: string;
      stayId: string;
      quantity: number;
      unitPriceSnapshot: Prisma.Decimal;
      partnerSubtotal?: Prisma.Decimal;
      hotelServiceFeeAmount?: Prisma.Decimal;
      customerTotalAmount?: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      currency: string;
      serviceNameSnapshot: string;
      serviceModeSnapshot: MarketplaceServiceMode;
      serviceTenantId: string;
    },
  ) {
    const folio = await tx.folio.findFirst({
      where: { hotelId: order.hotelId, stayId: order.stayId, status: FolioStatus.OPEN },
      orderBy: { openedAt: "desc" },
    });
    if (!folio) throw new ConflictException("Không có folio mở cho khách lưu trú");
    if (folio.currency !== order.currency)
      throw new ConflictException("Đơn vị tiền tệ không khớp folio");

    const partnerProfile = await tx.serviceTenantProfile?.findUnique({
      where: { tenantId: order.serviceTenantId },
      select: { displayName: true },
    });
    const partnerName = partnerProfile?.displayName ?? "Đối tác dịch vụ";

    const partnerSubtotal =
      order.partnerSubtotal && !order.partnerSubtotal.isZero()
        ? order.partnerSubtotal
        : order.unitPriceSnapshot.mul(order.quantity);

    const hotelServiceFeeAmount =
      order.hotelServiceFeeAmount ??
      calculateOnSiteServiceFee(partnerSubtotal, order.serviceModeSnapshot);

    const customerTotalAmount =
      order.customerTotalAmount && !order.customerTotalAmount.isZero()
        ? order.customerTotalAmount
        : partnerSubtotal.add(hotelServiceFeeAmount);

    // 1. Partner service subtotal item
    const existingServiceItem = await tx.folioItem.findFirst({
      where: { folioId: folio.id, sourceType: FolioItemSourceType.SYSTEM, sourceId: order.id },
    });
    if (!existingServiceItem) {
      await tx.folioItem.create({
        data: {
          hotelId: order.hotelId,
          folioId: folio.id,
          stayId: order.stayId,
          roomId: folio.roomId,
          itemType: FolioItemType.SERVICE,
          sourceType: FolioItemSourceType.SYSTEM,
          sourceId: order.id,
          nameSnapshot: order.serviceNameSnapshot,
          quantity: order.quantity,
          unitPriceSnapshot: order.unitPriceSnapshot,
          subtotalSnapshot: partnerSubtotal,
          totalSnapshot: partnerSubtotal,
          currency: order.currency,
          serviceCompletedAt: new Date(),
          billingSourceSnapshot: {
            marketplaceOrderId: order.id,
            serviceTenantId: order.serviceTenantId,
            serviceSource: "MARKETPLACE",
            isExternal: true,
            partnerName,
            partnerSubtotal: partnerSubtotal.toString(),
            hotelServiceFeeAmount: hotelServiceFeeAmount.toString(),
            customerTotalAmount: customerTotalAmount.toString(),
          },
        },
      });
    }

    const hotelServiceFeeRate = calculateFeePercentage(partnerSubtotal, hotelServiceFeeAmount);

    // 2. Separate hotel service fee item
    if (hotelServiceFeeAmount.gt(0)) {
      const feeSourceId = `${order.id}:hotel_fee`;
      const existingFeeItem = await tx.folioItem.findFirst({
        where: { folioId: folio.id, sourceType: FolioItemSourceType.SYSTEM, sourceId: feeSourceId },
      });
      if (!existingFeeItem) {
        await tx.folioItem.create({
          data: {
            hotelId: order.hotelId,
            folioId: folio.id,
            stayId: order.stayId,
            roomId: folio.roomId,
            itemType: FolioItemType.SERVICE,
            sourceType: FolioItemSourceType.SYSTEM,
            sourceId: feeSourceId,
            nameSnapshot: `Phí dịch vụ khách sạn (${hotelServiceFeeRate.toFixed(2)}%) - ${order.serviceNameSnapshot}`,
            quantity: 1,
            unitPriceSnapshot: hotelServiceFeeAmount,
            subtotalSnapshot: hotelServiceFeeAmount,
            totalSnapshot: hotelServiceFeeAmount,
            currency: order.currency,
            serviceCompletedAt: new Date(),
            billingSourceSnapshot: {
              marketplaceOrderId: order.id,
              serviceTenantId: order.serviceTenantId,
              serviceSource: "MARKETPLACE",
              isExternal: false,
              feeType: "HOTEL_SERVICE_FEE",
              feeRate: `${hotelServiceFeeRate.toFixed(2)}%`,
              partnerSubtotal: partnerSubtotal.toString(),
              hotelServiceFeeAmount: hotelServiceFeeAmount.toString(),
            },
          },
        });
      }
    }

    const items = await tx.folioItem.findMany({ where: { folioId: folio.id, voidedAt: null } });
    const zero = new Prisma.Decimal(0);
    const totals = items.reduce(
      (sum, item) => ({
        subtotal: sum.subtotal.add(item.subtotalSnapshot),
        tax: sum.tax.add(item.taxAmountSnapshot),
        discount: sum.discount.add(item.discountAmountSnapshot),
        total: sum.total.add(item.totalSnapshot),
      }),
      { subtotal: zero, tax: zero, discount: zero, total: zero },
    );
    await tx.folio.update({
      where: { id: folio.id },
      data: {
        subtotalAmount: totals.subtotal,
        taxAmount: totals.tax,
        discountAmount: totals.discount,
        totalAmount: totals.total,
      },
    });
  }

  async getPartnerFinancialSummary(userId: string) {
    const serviceTenantId = await this.portal.tenantId(userId);

    const [orders, settlements] = await Promise.all([
      this.prisma.marketplaceOrder.findMany({
        where: { serviceTenantId },
        select: {
          id: true,
          status: true,
          partnerSubtotal: true,
          totalAmount: true,
          createdAt: true,
          completedAt: true,
          cancelledAt: true,
        },
      }),
      this.prisma.marketplaceSettlement.findMany({
        where: { serviceTenantId },
        select: {
          id: true,
          grossAmount: true,
          commissionAmount: true,
          netAmount: true,
          status: true,
          settledAt: true,
        },
      }),
    ]);

    const completedOrders = orders.filter((o) => o.status === "COMPLETED");
    const cancelledOrders = orders.filter((o) => o.status === "CANCELLED");

    const grossSalesAmount = completedOrders.reduce(
      (acc, o) =>
        acc.add(o.partnerSubtotal && !o.partnerSubtotal.isZero() ? o.partnerSubtotal : o.totalAmount),
      new Prisma.Decimal(0),
    );

    const settledAmount = settlements
      .filter((s) => s.status === "SETTLED")
      .reduce((acc, s) => acc.add(s.netAmount), new Prisma.Decimal(0));

    const outstandingAmount = settlements
      .filter((s) => s.status !== "SETTLED")
      .reduce((acc, s) => acc.add(s.netAmount), new Prisma.Decimal(0));

    const totalNetPayable = settlements.reduce(
      (acc, s) => acc.add(s.netAmount),
      new Prisma.Decimal(0),
    );

    return {
      totalOrdersCount: orders.length,
      completedOrdersCount: completedOrders.length,
      cancelledOrdersCount: cancelledOrders.length,
      grossSalesAmount: Number(grossSalesAmount),
      hotelCollectedAmount: Number(grossSalesAmount),
      totalNetPayable: Number(totalNetPayable),
      settledAmount: Number(settledAmount),
      outstandingAmount: Number(outstandingAmount),
    };
  }

  async listPartnerSettlements(userId: string, status?: string) {
    const serviceTenantId = await this.portal.tenantId(userId);
    return this.prisma.marketplaceSettlement.findMany({
      where: {
        serviceTenantId,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            serviceNameSnapshot: true,
            quantity: true,
            status: true,
            createdAt: true,
            completedAt: true,
            hotel: { select: { id: true, name: true } },
            stay: { select: { guestDisplayName: true, room: { select: { roomNumber: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async listHotelPartnerSettlements(
    hotelId: string,
    filter?: { status?: string; serviceTenantId?: string },
  ) {
    return this.prisma.marketplaceSettlement.findMany({
      where: {
        hotelId,
        ...(filter?.status ? { status: filter.status as any } : {}),
        ...(filter?.serviceTenantId ? { serviceTenantId: filter.serviceTenantId } : {}),
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            serviceNameSnapshot: true,
            quantity: true,
            status: true,
            createdAt: true,
            completedAt: true,
            serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
            stay: { select: { guestDisplayName: true, room: { select: { roomNumber: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async settlePartnerOrder(userId: string, hotelId: string, settlementId: string) {
    const settlement = await this.prisma.marketplaceSettlement.findFirst({
      where: { id: settlementId, hotelId },
    });
    if (!settlement) {
      throw new NotFoundException("Không tìm thấy thông tin quyết toán đối tác");
    }
    if (settlement.status === "SETTLED") {
      throw new ConflictException("Đơn dịch vụ đã được quyết toán trước đó");
    }

    const updated = await this.prisma.marketplaceSettlement.update({
      where: { id: settlement.id },
      data: {
        status: "SETTLED",
        settledAt: new Date(),
        settledBy: userId,
        settledAmount: settlement.netAmount,
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            serviceNameSnapshot: true,
            hotel: { select: { name: true } },
            serviceTenant: { select: { serviceProfile: { select: { displayName: true } } } },
          },
        },
      },
    });

    RequestRealtimeEmitter.emitPartnerSettlementUpdated({
      settlement: updated,
      hotelId: updated.hotelId,
      serviceTenantId: updated.serviceTenantId,
    });

    return updated;
  }

  async settlePartnerOrdersBatch(userId: string, hotelId: string, settlementIds: string[]) {
    const settlements = await this.prisma.marketplaceSettlement.findMany({
      where: { id: { in: settlementIds }, hotelId, status: { not: "SETTLED" } },
    });

    if (settlements.length === 0) {
      throw new NotFoundException("Không tìm thấy khoản quyết toán nào hợp lệ để xử lý");
    }

    const now = new Date();
    await this.prisma.$transaction(
      settlements.map((s) =>
        this.prisma.marketplaceSettlement.update({
          where: { id: s.id },
          data: {
            status: "SETTLED",
            settledAt: now,
            settledBy: userId,
            settledAmount: s.netAmount,
          },
        }),
      ),
    );

    for (const s of settlements) {
      RequestRealtimeEmitter.emitPartnerSettlementUpdated({
        settlement: {
          ...s,
          status: "SETTLED",
          settledAt: now,
          settledBy: userId,
          settledAmount: s.netAmount,
        },
        hotelId: s.hotelId,
        serviceTenantId: s.serviceTenantId,
      });
    }

    return {
      settledCount: settlements.length,
      settlementIds: settlements.map((s) => s.id),
    };
  }
}
