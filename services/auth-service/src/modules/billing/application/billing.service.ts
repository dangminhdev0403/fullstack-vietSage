import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  FolioItemSourceType,
  FolioItemType,
  FolioStatus,
  GuestRequestActorType,
  GuestRequestBillingPostStatus,
  GuestRequestStatus,
  GuestSessionStatus,
  GuestStayStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RoomStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { AppLogger } from "../../../common/logging/app-logger.service";
import {
  GUEST_REQUEST_EVENT_PUBLISHER,
  NOOP_GUEST_REQUEST_EVENT_PUBLISHER,
  type GuestRequestEventPublisher,
} from "../../../shared/events";
import { CodesService } from "../../codes/codes-public";
import { HotelAccessService } from "../../property/property-public";
import { closePlatformUsageAtCheckout } from "../../platform-billing/application/platform-billing.service";
import { activeGuestRequestStatuses } from "../../guest-operations/guest-operations-public";
import { BillingRepository } from "../infrastructure/repositories/billing.repository";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toPagination(page?: number, limit?: number) {
  const safePage = Math.max(page ?? DEFAULT_PAGE, 1);
  const safeLimit = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
  };
}

function parseSnapshot(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, any>;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as Record<string, any>;
  return {};
}

function resolveServiceSource(item: {
  itemType: string;
  sourceType: string;
  nameSnapshot?: string;
  descriptionSnapshot?: string | null;
  billingSourceSnapshot?: unknown;
}): { isExternal: boolean; partnerName?: string } {
  if (item.itemType === "ROOM_CHARGE") {
    return { isExternal: false };
  }

  const snapshot = parseSnapshot(item.billingSourceSnapshot);
  const isExternal =
    snapshot.serviceSource === "EXTERNAL" ||
    snapshot.serviceSource === "MARKETPLACE" ||
    snapshot.isExternal === true ||
    !!snapshot.marketplaceOrderId ||
    !!snapshot.partnerName ||
    (item.sourceType === "SYSTEM" && !!snapshot.serviceTenantId) ||
    /đối tác|bên ngoài|marketplace|external|massage|spa/i.test(item.nameSnapshot ?? "") ||
    /đối tác|bên ngoài|marketplace|external|massage|spa/i.test(item.descriptionSnapshot ?? "") ||
    /đối tác|bên ngoài|marketplace|external|massage|spa/i.test(snapshot.categoryName ?? "") ||
    /đối tác|bên ngoài|marketplace|external|massage|spa/i.test(snapshot.serviceName ?? "");

  const partnerName = isExternal
    ? (snapshot.partnerName ?? snapshot.serviceTenantName ?? "Đối tác dịch vụ")
    : undefined;

  return { isExternal, partnerName };
}

// Checkout/invoice generation must use FolioItem rows as financial source of truth;
// Folio cached totals are a read model only and must not be trusted for snapshots.
@Injectable()
export class BillingService {
  private readonly eventPublisher: GuestRequestEventPublisher;

  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly hotelAccessService: HotelAccessService,
    private readonly prisma: PrismaService,
    private readonly codesService: CodesService,
    private readonly logger: AppLogger,
    @Optional()
    @Inject(GUEST_REQUEST_EVENT_PUBLISHER)
    eventPublisher?: GuestRequestEventPublisher,
  ) {
    this.eventPublisher = eventPublisher ?? NOOP_GUEST_REQUEST_EVENT_PUBLISHER;
  }

  async listFolios(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query: { status?: FolioStatus; page?: number; limit?: number },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const pagination = toPagination(query.page, query.limit);
    const result = await this.billingRepository.listFolios({
      hotelId,
      status: query.status,
      skip: pagination.skip,
      take: pagination.take,
    });

    return {
      page: pagination.page,
      limit: pagination.limit,
      total: result.total,
      items: result.rows.map((folio) => {
        const invoice = folio.invoices[0] ?? null;

        return {
          ...folio,
          invoices: undefined,
          invoiceId: invoice?.id ?? null,
          invoice,
          subtotal: folio.subtotalAmount,
          tax: folio.taxAmount,
          discount: folio.discountAmount,
          total: folio.totalAmount,
        };
      }),
    };
  }

  async getFolioDetail(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    folioId: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const folio = await this.billingRepository.findFolioDetail(hotelId, folioId);

    if (!folio) {
      throw new NotFoundException("Không tìm thấy folio");
    }

    const summary = await this.buildFolioSummary(hotelId, folioId);

    return {
      ...folio,
      subtotal: summary.subtotal,
      tax: summary.tax,
      discount: summary.discount,
      total: summary.total,
      itemCount: summary.itemCount,
      serviceCount: summary.serviceCount,
      roomChargeCount: summary.roomChargeCount,
      isStale: summary.isStale,
      requiresRecalculation: summary.requiresRecalculation,
      hasDuplicateOpenFolios: summary.hasDuplicateOpenFolios,
    };
  }

  async getActiveFolioByStay(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    stayId: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const folios = await this.billingRepository.findActiveFoliosByStay(hotelId, stayId);

    if (folios.length === 0) {
      throw new NotFoundException("Không tìm thấy folio đang mở cho lượt lưu trú");
    }

    if (folios.length > 1) {
      this.logger.warn({
        event: "DUPLICATE_OPEN_FOLIO_DETECTED",
        hotelId,
        stayId,
        folioId: folios[0].id,
        duplicateCount: folios.length,
        timestamp: new Date().toISOString(),
      });
    }

    return { ...folios[0], hasDuplicateOpenFolios: folios.length > 1 };
  }

  async listFolioItems(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    folioId: string,
    query: { page?: number; limit?: number },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    await this.ensureFolioExists(hotelId, folioId);
    const pagination = toPagination(query.page, query.limit);
    const result = await this.billingRepository.listFolioItems({
      hotelId,
      folioId,
      skip: pagination.skip,
      take: pagination.take,
    });

    const items = result.rows.map((item) => {
      const { isExternal, partnerName } = resolveServiceSource({
        itemType: item.itemType,
        sourceType: item.sourceType,
        nameSnapshot: item.nameSnapshot,
        descriptionSnapshot: item.descriptionSnapshot,
        billingSourceSnapshot: item.billingSourceSnapshot,
      });
      return {
        ...item,
        serviceSource: isExternal ? "EXTERNAL" : "HOTEL",
        partnerName,
      };
    });

    return {
      page: pagination.page,
      limit: pagination.limit,
      total: result.total,
      items,
    };
  }

  async addFolioItem(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    folioId: string,
    input: {
      itemType: FolioItemType;
      name: string;
      description?: string;
      amount: number;
      quantity?: number;
    },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);

    return this.prisma.$transaction(async (tx) => {
      const folio = await tx.folio.findFirst({
        where: { id: folioId, hotelId },
      });
      if (!folio) {
        throw new NotFoundException("Không tìm thấy folio");
      }
      if (folio.status !== FolioStatus.OPEN) {
        throw new BadRequestException("Folio không ở trạng thái Mở để thêm mục");
      }

      const qty = input.quantity ?? 1;
      const amountDecimal = new Prisma.Decimal(input.amount);

      let subtotalSnapshot = new Prisma.Decimal(0);
      let discountAmountSnapshot = new Prisma.Decimal(0);
      let totalSnapshot = new Prisma.Decimal(0);

      if (input.itemType === FolioItemType.DISCOUNT) {
        discountAmountSnapshot = amountDecimal.mul(qty);
        totalSnapshot = discountAmountSnapshot.negated();
      } else {
        subtotalSnapshot = amountDecimal.mul(qty);
        totalSnapshot = subtotalSnapshot;
      }

      const item = await tx.folioItem.create({
        data: {
          hotelId,
          folioId,
          stayId: folio.stayId,
          itemType: input.itemType,
          sourceType: FolioItemSourceType.MANUAL,
          nameSnapshot: input.name,
          descriptionSnapshot: input.description,
          quantity: qty,
          unitPriceSnapshot: amountDecimal,
          subtotalSnapshot,
          discountAmountSnapshot,
          totalSnapshot,
          currency: folio.currency,
          billingSourceSnapshot: {
            addedByUserId: actorUserId,
            addedAt: new Date().toISOString(),
          },
          postedByUserId: actorUserId,
        },
      });

      const folioItems = await tx.folioItem.findMany({
        where: { hotelId, folioId, voidedAt: null },
      });
      const totals = this.computeTotalsFromFolioItems(folioItems);
      await tx.folio.update({
        where: { id: folioId },
        data: {
          subtotalAmount: totals.subtotalAmount,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
        },
      });

      return item;
    });
  }

  async voidFolioItem(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    folioId: string,
    itemId: string,
    reason?: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);

    return this.prisma.$transaction(async (tx) => {
      const folio = await tx.folio.findFirst({
        where: { id: folioId, hotelId },
      });
      if (!folio) {
        throw new NotFoundException("Không tìm thấy folio");
      }
      if (folio.status !== FolioStatus.OPEN) {
        throw new BadRequestException("Folio không ở trạng thái Mở để hủy mục");
      }

      const item = await tx.folioItem.findFirst({
        where: { id: itemId, folioId, hotelId },
      });
      if (!item) {
        throw new NotFoundException("Không tìm thấy mục folio");
      }
      if (item.voidedAt) {
        throw new BadRequestException("Mục này đã bị hủy trước đó");
      }

      await tx.folioItem.update({
        where: { id: itemId },
        data: {
          voidedAt: new Date(),
          voidedByUserId: actorUserId,
          voidReason: reason ?? "Hủy bởi lễ tân",
        },
      });

      const folioItems = await tx.folioItem.findMany({
        where: { hotelId, folioId, voidedAt: null },
      });
      const totals = this.computeTotalsFromFolioItems(folioItems);
      await tx.folio.update({
        where: { id: folioId },
        data: {
          subtotalAmount: totals.subtotalAmount,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
        },
      });

      return { success: true };
    });
  }

  async getFolioSummary(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    folioId: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    return this.buildFolioSummary(hotelId, folioId);
  }

  async getInvoiceDetail(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    invoiceId: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const detail = await this.billingRepository.findInvoiceDetail(hotelId, invoiceId);

    if (!detail) {
      throw new NotFoundException("Không tìm thấy invoice");
    }

    return {
      invoice: {
        id: detail.invoice.id,
        invoiceNumber: detail.invoice.invoiceNumber,
        status: detail.invoice.status,
        currency: detail.invoice.currency,
        issuedAt: detail.invoice.issuedAt,
        subtotalAmount: detail.invoice.subtotalAmount,
        taxAmount: detail.invoice.taxAmount,
        discountAmount: detail.invoice.discountAmount,
        totalAmount: detail.invoice.totalAmount,
        paidAmount: detail.invoice.paidAmount,
        balanceAmount: detail.invoice.balanceAmount,
      },
      folio: {
        id: detail.invoice.folio.id,
        folioNumber: detail.invoice.folio.folioNumber,
        status: detail.invoice.folio.status,
      },
      stay: {
        id: detail.invoice.stay.id,
        guestName: detail.invoice.stay.guestDisplayName,
        roomNumber: detail.invoice.stay.room.roomNumber,
        checkInAt: detail.invoice.stay.checkedInAt ?? detail.invoice.stay.plannedCheckInAt,
        checkOutAt: detail.invoice.stay.checkedOutAt ?? detail.invoice.stay.plannedCheckOutAt,
      },
      items: detail.items.map((item) => {
        const { isExternal, partnerName } = resolveServiceSource({
          itemType: item.itemType,
          sourceType: item.sourceType,
          nameSnapshot: item.nameSnapshot,
          descriptionSnapshot: item.descriptionSnapshot,
          billingSourceSnapshot: item.billingSourceSnapshot,
        });
        return {
          id: item.id,
          type: item.itemType,
          name: item.nameSnapshot,
          description: item.descriptionSnapshot ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPriceSnapshot,
          subtotal: item.subtotalSnapshot,
          taxAmount: item.taxAmountSnapshot,
          discountAmount: item.discountAmountSnapshot,
          total: item.totalSnapshot,
          postedAt: item.postedAt,
          serviceSource: isExternal ? ("EXTERNAL" as const) : ("HOTEL" as const),
          partnerName,
        };
      }),
      payments: detail.payments.map((payment) => ({
        id: payment.id,
        hotelId: payment.hotelId,
        invoiceId: payment.invoiceId,
        folioId: payment.folioId,
        stayId: payment.stayId,
        paymentNumber: payment.paymentNumber,
        status: payment.status,
        provider: payment.provider,
        method: payment.method,
        currency: payment.currency,
        amount: payment.amount,
        paidAmount: payment.paidAmount,
        refundedAmount: payment.refundedAmount,
        providerSessionId: payment.providerSessionId,
        providerPaymentId: payment.providerPaymentId,
        paymentUrl: payment.paymentUrl,
        expiresAt: payment.expiresAt,
        confirmedAt: payment.confirmedAt,
        failedAt: payment.failedAt,
        failureReason: payment.failureReason,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      })),
    };
  }

  async validateFolioForCheckout(hotelId: string, folioId: string) {
    const summary = await this.buildFolioSummary(hotelId, folioId);

    if (summary.isStale) {
      this.logger.warn({
        event: "FOLIO_CHECKOUT_BLOCKED_DUE_TO_STALE",
        hotelId,
        stayId: summary.stayId,
        folioId,
        timestamp: new Date().toISOString(),
      });
      throw new ConflictException("FOLIO_STALE_MUST_RECALCULATE_BEFORE_CHECKOUT");
    }

    return summary;
  }

  private async buildFolioSummary(hotelId: string, folioId: string) {
    if (this.prisma?.folio?.findFirst) {
      const rawFolio = await this.prisma.folio.findFirst({
        where: { id: folioId, hotelId },
        include: {
          hotel: { select: { id: true, name: true } },
          room: true,
          stay: true,
        },
      });

      if (rawFolio && rawFolio.status === FolioStatus.OPEN && rawFolio.stay && rawFolio.room) {
        try {
          await this.ensureRoomChargeFolioItem(
            this.prisma,
            rawFolio,
            rawFolio.createdByUserId ?? "system",
          );
        } catch {
          // Silent catch for summary auto-ensure
        }
      }
    }

    const result = await this.billingRepository.getFolioSummary(hotelId, folioId);

    if (!result) {
      throw new NotFoundException("Không tìm thấy folio");
    }

    const counts = result.grouped.reduce(
      (acc, group) => {
        acc.itemCount += group._count._all;

        if (group.itemType === FolioItemType.SERVICE) {
          acc.serviceCount = group._count._all;
        }

        if (group.itemType === FolioItemType.ROOM_CHARGE) {
          acc.roomChargeCount = group._count._all;
        }

        return acc;
      },
      { itemCount: 0, serviceCount: 0, roomChargeCount: 0 },
    );
    const activeServiceRequests = this.prisma.guestRequest?.findMany
      ? await this.prisma.guestRequest.findMany({
          where: {
            hotelId,
            stayId: result.folio.stayId,
            status: { in: [...activeGuestRequestStatuses] },
          },
          include: { serviceItem: true, room: true },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const latestItemPostedAt = result.latestItemPostedAt;
    const isStale = Boolean(latestItemPostedAt && result.folio.updatedAt < latestItemPostedAt);
    const requiresRecalculation = isStale;

    if (isStale) {
      this.logger.warn({
        event: "FOLIO_STALE_DETECTED",
        hotelId,
        stayId: result.folio.stayId,
        folioId,
        folioUpdatedAt: result.folio.updatedAt.toISOString(),
        latestItemPostedAt: latestItemPostedAt?.toISOString(),
        timestamp: new Date().toISOString(),
      });
    }

    return {
      id: result.folio.id,
      hotelId: result.folio.hotelId,
      stayId: result.folio.stayId,
      folioNumber: result.folio.folioNumber,
      status: result.folio.status,
      currency: result.folio.currency,
      subtotal: result.folio.subtotalAmount,
      tax: result.folio.taxAmount,
      discount: result.folio.discountAmount,
      total: result.folio.totalAmount,
      ...counts,
      isStale,
      requiresRecalculation,
      hasDuplicateOpenFolios: false,
      activeServiceRequests: activeServiceRequests.map((request) => ({
        id: request.id,
        name: request.serviceItem?.name ?? request.title ?? "Dịch vụ",
        roomNumber: request.room?.roomNumber ?? null,
        status: request.status,
        quantity: request.quantity,
        unitPrice: request.serviceItem?.priceOverride ?? 0,
      })),
      latestItemPostedAt,
      updatedAt: result.folio.updatedAt,
    };
  }

  async issueInvoice(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    folioId: string,
    options?: {
      reconciliations?: Array<{
        requestId: string;
        action: "provided" | "cancelled";
        cancelReason?: string;
      }>;
    },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    this.logger?.log?.({
      event: "CHECKOUT_ISSUE_INVOICE_REQUESTED",
      hotelId,
      folioId,
      actorUserId,
      timestamp: new Date().toISOString(),
    });
    await this.validateFolioForCheckout(hotelId, folioId);

    const existingBeforeValidation = await this.prisma.invoice.findFirst({
      where: { hotelId, folioId },
    });
    if (existingBeforeValidation) {
      await this.prisma.folio.updateMany({
        where: { id: folioId, hotelId, status: FolioStatus.OPEN },
        data: { status: FolioStatus.CHECKOUT_PENDING, checkoutStartedAt: new Date() },
      });
      if (this.prisma.guestStay?.updateMany) {
        await this.prisma.guestStay.updateMany({
          where: {
            id: existingBeforeValidation.stayId,
            hotelId,
            status: { in: [GuestStayStatus.ACTIVE, GuestStayStatus.CHECKED_IN] },
          },
          data: { status: GuestStayStatus.CHECKOUT_PENDING },
        });
      }
      this.logger?.warn?.({
        event: "CHECKOUT_ISSUE_INVOICE_REUSED_EXISTING_BEFORE_VALIDATION",
        hotelId,
        folioId,
        invoiceId: existingBeforeValidation.id,
        invoiceStatus: existingBeforeValidation.status,
        timestamp: new Date().toISOString(),
      });
      return existingBeforeValidation;
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Folio" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          folioId,
          hotelId,
        );

        const folio = await tx.folio.findFirst({
          where: { id: folioId, hotelId },
          include: {
            hotel: { select: { id: true, name: true } },
            room: true,
            stay: true,
          },
        });

        if (!folio) {
          throw new NotFoundException("Không tìm thấy folio");
        }

        const existingInvoice = await tx.invoice.findFirst({ where: { hotelId, folioId } });
        if (existingInvoice) {
          if (folio.status === FolioStatus.OPEN) {
            await tx.folio.update({
              where: { id: folioId },
              data: { status: FolioStatus.CHECKOUT_PENDING, checkoutStartedAt: new Date() },
            });
            if (tx.guestStay?.updateMany) {
              await tx.guestStay.updateMany({
                where: {
                  id: folio.stayId,
                  hotelId,
                  status: { in: [GuestStayStatus.ACTIVE, GuestStayStatus.CHECKED_IN] },
                },
                data: { status: GuestStayStatus.CHECKOUT_PENDING },
              });
            }
          }
          this.logger?.warn?.({
            event: "CHECKOUT_ISSUE_INVOICE_REUSED_EXISTING",
            hotelId,
            stayId: folio.stayId,
            folioId,
            invoiceId: existingInvoice.id,
            folioStatus: folio.status,
            timestamp: new Date().toISOString(),
          });
          return existingInvoice;
        }

        if (folio.status !== FolioStatus.OPEN) {
          this.logger?.warn?.({
            event: "CHECKOUT_ISSUE_INVOICE_BLOCKED_INVALID_FOLIO_STATUS",
            hotelId,
            stayId: folio.stayId,
            folioId,
            folioStatus: folio.status,
            timestamp: new Date().toISOString(),
          });
          throw new ConflictException("FOLIO_NOT_OPEN_FOR_CHECKOUT");
        }

        await this.reconcileStayServiceRequests(
          tx,
          hotelId,
          folio,
          actorUserId,
          options?.reconciliations,
        );

        const invoiceNumber = await this.codesService.generateEntityCode("INVOICE", tx);

        await this.ensureRoomChargeFolioItem(tx, folio, actorUserId);
        const folioItems = await tx.folioItem.findMany({
          where: { hotelId, folioId, voidedAt: null },
          orderBy: [{ postedAt: "asc" }, { id: "asc" }],
        });
        const totals = this.computeTotalsFromFolioItems(folioItems);
        const snapshot = {
          issuedAt: new Date().toISOString(),
          hotel: folio.hotel,
          stay: folio.stay,
          room: folio.room,
          folio: {
            id: folio.id,
            folioNumber: folio.folioNumber,
            status: folio.status,
            openedAt: folio.openedAt,
          },
          items: folioItems,
          totals,
        };

        const invoice = await tx.invoice.create({
          data: {
            hotelId,
            folioId,
            stayId: folio.stayId,
            invoiceNumber,
            status: InvoiceStatus.ISSUED,
            currency: folio.currency,
            subtotalAmount: totals.subtotalAmount,
            taxAmount: totals.taxAmount,
            discountAmount: totals.discountAmount,
            totalAmount: totals.totalAmount,
            paidAmount: new Prisma.Decimal(0),
            balanceAmount: totals.totalAmount,
            invoiceSnapshotJson: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
            issuedByUserId: actorUserId,
          },
        });

        await tx.folio.update({
          where: { id: folioId },
          data: { status: FolioStatus.CHECKOUT_PENDING, checkoutStartedAt: new Date() },
        });
        if (tx.guestStay?.updateMany) {
          await tx.guestStay.updateMany({
            where: {
              id: folio.stayId,
              hotelId,
              status: { in: [GuestStayStatus.ACTIVE, GuestStayStatus.CHECKED_IN] },
            },
            data: { status: GuestStayStatus.CHECKOUT_PENDING },
          });
        }

        this.logger.log({
          event: "CHECKOUT_ISSUE_INVOICE_SUCCEEDED",
          hotelId,
          stayId: folio.stayId,
          folioId,
          invoiceId: invoice.id,
          totalAmount: invoice.totalAmount.toString(),
          timestamp: new Date().toISOString(),
        });

        return invoice;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createPaymentSession(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    invoiceId: string,
    input: {
      provider: PaymentProvider;
      providerSessionId?: string;
      providerPaymentId?: string;
      metadataReference?: string;
    },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Invoice" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          invoiceId,
          hotelId,
        );
        const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, hotelId } });

        if (!invoice) {
          throw new NotFoundException("Không tìm thấy invoice");
        }

        if (invoice.status !== InvoiceStatus.ISSUED) {
          throw new ConflictException("INVOICE_NOT_ISSUED_FOR_PAYMENT_SESSION");
        }

        if (invoice.balanceAmount.lte(0)) {
          throw new ConflictException("INVOICE_HAS_NO_BALANCE_TO_PAY");
        }

        const existingPayment = await tx.payment.findFirst({
          where: {
            invoiceId: invoice.id,
            provider: input.provider,
            status: {
              in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED],
            },
          },
        });

        if (existingPayment) {
          return { reused: true, payment: existingPayment };
        }

        const paymentNumber = await this.codesService.generateEntityCode("PAYMENT", tx);
        const payment = await tx.payment.create({
          data: {
            hotelId,
            invoiceId: invoice.id,
            folioId: invoice.folioId,
            stayId: invoice.stayId,
            paymentNumber,
            status: PaymentStatus.PENDING,
            provider: input.provider,
            method: this.methodFromProvider(input.provider),
            currency: invoice.currency,
            amount: invoice.balanceAmount,
            providerSessionId: input.providerSessionId,
            providerPaymentId: input.providerPaymentId,
            createdByUserId: actorUserId,
            metadataJson: input.metadataReference
              ? { metadataReference: input.metadataReference }
              : undefined,
          },
        });

        return { reused: false, payment };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async getPaymentStatus(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    paymentId: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, hotelId },
      select: {
        id: true,
        hotelId: true,
        invoiceId: true,
        folioId: true,
        stayId: true,
        paymentNumber: true,
        status: true,
        provider: true,
        method: true,
        currency: true,
        amount: true,
        paidAmount: true,
        refundedAmount: true,
        providerSessionId: true,
        providerPaymentId: true,
        paymentUrl: true,
        expiresAt: true,
        confirmedAt: true,
        failedAt: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException("Không tìm thấy payment");
    }

    return payment;
  }

  async confirmManualPayment(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    invoiceId: string,
    input: {
      method: PaymentMethod;
      note?: string;
    },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);

    const invoiceBeforePayment = this.prisma.invoice?.findFirst
      ? await this.prisma.invoice.findFirst({
          where: { id: invoiceId, hotelId },
        })
      : null;
    if (invoiceBeforePayment?.balanceAmount.lte(0)) {
      const settled = await this.settleZeroBalanceCheckout(
        actorUserId,
        hotelId,
        invoiceId,
        input.method,
        input.note,
      );
      if (settled.conversation) {
        this.eventPublisher.publishConversationClosed(settled.conversation);
      }
      const invoice = await this.getInvoiceDetail(actorUserId, activeRoleId, hotelId, invoiceId);
      return { payment: settled.payment, invoice };
    }

    const provider =
      input.method === PaymentMethod.BANK_TRANSFER
        ? PaymentProvider.BANK_TRANSFER
        : PaymentProvider.MANUAL;
    const session = await this.createPaymentSession(actorUserId, activeRoleId, hotelId, invoiceId, {
      provider,
      metadataReference: `counter:${invoiceId}`,
    });

    const payment = await this.prisma.payment.update({
      where: { id: session.payment.id },
      data: {
        method: input.method,
        metadataJson: {
          source: "front_desk",
          ...(input.note ? { note: input.note } : {}),
        },
      },
    });

    await this.processPaymentWebhook(provider, {
      signatureVerified: true,
      eventType: "payment.succeeded",
      providerEventId: `counter:${payment.id}`,
      providerTransactionId: `counter:${payment.paymentNumber}`,
      paymentId: payment.id,
      amount: payment.amount.toString(),
      actorUserId,
    });

    const [confirmedPayment, invoice] = await Promise.all([
      this.getPaymentStatus(actorUserId, activeRoleId, hotelId, payment.id),
      this.getInvoiceDetail(actorUserId, activeRoleId, hotelId, invoiceId),
    ]);

    return { payment: confirmedPayment, invoice };
  }

  private async settleZeroBalanceCheckout(
    actorUserId: string,
    hotelId: string,
    invoiceId: string,
    method: PaymentMethod,
    note?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Invoice" WHERE id = $1 AND "hotelId" = $2 FOR UPDATE',
          invoiceId,
          hotelId,
        );
        const invoice = await tx.invoice.findFirst({
          where: { id: invoiceId, hotelId },
          include: { stay: { select: { roomId: true, checkedInAt: true } } },
        });

        if (!invoice) {
          throw new NotFoundException("Không tìm thấy invoice");
        }
        if (invoice.balanceAmount.gt(0)) {
          throw new ConflictException("INVOICE_HAS_BALANCE_TO_PAY");
        }

        const existingPayment = await tx.payment.findFirst({
          where: { hotelId, invoiceId, status: PaymentStatus.SUCCEEDED },
        });
        if (existingPayment && invoice.status === InvoiceStatus.PAID) {
          return { payment: existingPayment, conversation: null };
        }

        const paymentNumber = await this.codesService.generateEntityCode("PAYMENT", tx);
        const payment =
          existingPayment ??
          (await tx.payment.create({
            data: {
              hotelId,
              invoiceId: invoice.id,
              folioId: invoice.folioId,
              stayId: invoice.stayId,
              paymentNumber,
              status: PaymentStatus.SUCCEEDED,
              provider: PaymentProvider.MANUAL,
              method,
              currency: invoice.currency,
              amount: new Prisma.Decimal(0),
              paidAmount: new Prisma.Decimal(0),
              confirmedAt: new Date(),
              metadataJson: {
                source: "front_desk",
                zeroBalance: true,
                ...(note ? { note } : {}),
              },
            },
          }));

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: InvoiceStatus.PAID,
            paidAmount: invoice.paidAmount,
            balanceAmount: new Prisma.Decimal(0),
            paidAt: new Date(),
            paidByUserId: actorUserId,
          },
        });
        await tx.folio.update({
          where: { id: invoice.folioId },
          data: { status: FolioStatus.CLOSED, closedAt: new Date() },
        });
        const checkedOutAt = new Date();
        await tx.guestStay.update({
          where: { id: invoice.stayId },
          data: {
            status: GuestStayStatus.CHECKED_OUT,
            checkedOutAt,
            accessCodeHash: null,
            accessCodeExpiresAt: null,
          },
        });
        await closePlatformUsageAtCheckout(tx, {
          hotelId: invoice.hotelId,
          roomId: invoice.stay.roomId,
          stayId: invoice.stayId,
          startedAt: invoice.stay.checkedInAt ?? checkedOutAt,
          endedAt: checkedOutAt,
        });
        await tx.guestSession.updateMany({
          where: {
            stayId: invoice.stayId,
            status: {
              in: [GuestSessionStatus.CREATED, GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE],
            },
          },
          data: { status: GuestSessionStatus.CLOSED, closedAt: new Date() },
        });
        await tx.room.update({
          where: { id: invoice.stay.roomId },
          data: { status: RoomStatus.PROCESSING },
        });
        return {
          payment,
          conversation: { hotelId, stayId: invoice.stayId, roomId: invoice.stay.roomId },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async processPaymentWebhook(provider: PaymentProvider, body: Record<string, unknown>) {
    if (body.signatureVerified !== true) {
      throw new ConflictException("PAYMENT_WEBHOOK_SIGNATURE_NOT_VERIFIED");
    }

    const eventType = this.webhookText(body.eventType).trim().toLowerCase();
    if (eventType !== "payment.succeeded" && eventType !== "payment.success") {
      throw new ConflictException("PAYMENT_WEBHOOK_EVENT_NOT_SUCCESSFUL");
    }

    const providerEventId = this.webhookText(body.providerEventId ?? body.eventId).trim();

    if (!providerEventId) {
      throw new ConflictException("PAYMENT_WEBHOOK_MISSING_PROVIDER_EVENT_ID");
    }

    const existing = await this.prisma.paymentTransaction.findFirst({
      where: { provider, providerEventId },
      include: { invoice: true, payment: true },
    });

    if (existing) {
      return { received: true, idempotent: true, matched: true, transaction: existing };
    }

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const payment = await this.findWebhookPayment(tx, provider, body);

          if (!payment) {
            this.logger.warn({
              event: "PAYMENT_WEBHOOK_UNMATCHED",
              provider,
              providerEventId,
              providerSessionId: body.providerSessionId,
              providerPaymentId: body.providerPaymentId,
              metadataReference: body.metadataReference,
              timestamp: new Date().toISOString(),
            });
            return { received: true, idempotent: false, matched: false };
          }

          await tx.$queryRawUnsafe('SELECT id FROM "Payment" WHERE id = $1 FOR UPDATE', payment.id);
          await tx.$queryRawUnsafe(
            'SELECT id FROM "Invoice" WHERE id = $1 FOR UPDATE',
            payment.invoiceId,
          );
          const lockedPayment = await tx.payment.findUnique({
            where: { id: payment.id },
            include: { invoice: { include: { stay: true } } },
          });

          if (!lockedPayment) {
            throw new NotFoundException("Không tìm thấy payment");
          }

          if (
            lockedPayment.status === PaymentStatus.SUCCEEDED ||
            lockedPayment.invoice.status === InvoiceStatus.PAID
          ) {
            return { received: true, idempotent: true, matched: true, payment: lockedPayment };
          }

          const webhookAmount =
            body.amount === undefined
              ? lockedPayment.amount
              : new Prisma.Decimal(this.webhookText(body.amount));

          if (
            !webhookAmount.equals(lockedPayment.amount) ||
            !webhookAmount.equals(lockedPayment.invoice.balanceAmount)
          ) {
            const failedTransaction = await tx.paymentTransaction.create({
              data: {
                hotelId: lockedPayment.hotelId,
                paymentId: lockedPayment.id,
                invoiceId: lockedPayment.invoiceId,
                provider,
                providerEventId,
                providerTransactionId:
                  typeof body.providerTransactionId === "string"
                    ? body.providerTransactionId
                    : undefined,
                eventType:
                  typeof body.eventType === "string" ? body.eventType : "payment.amount_mismatch",
                status: PaymentStatus.FAILED,
                amount: webhookAmount,
                currency: lockedPayment.currency,
                rawPayloadJson: body as Prisma.InputJsonObject,
                signatureVerified: Boolean(body.signatureVerified ?? false),
                processedAt: new Date(),
              },
            });
            this.logger.warn({
              event: "PAYMENT_WEBHOOK_AMOUNT_MISMATCH",
              provider,
              providerEventId,
              paymentId: lockedPayment.id,
              timestamp: new Date().toISOString(),
            });
            return { received: true, matched: true, paid: false, transaction: failedTransaction };
          }

          const transaction = await tx.paymentTransaction.create({
            data: {
              hotelId: lockedPayment.hotelId,
              paymentId: lockedPayment.id,
              invoiceId: lockedPayment.invoiceId,
              provider,
              providerEventId,
              providerTransactionId:
                typeof body.providerTransactionId === "string"
                  ? body.providerTransactionId
                  : undefined,
              eventType: typeof body.eventType === "string" ? body.eventType : "payment.succeeded",
              status: PaymentStatus.SUCCEEDED,
              amount: lockedPayment.amount,
              currency: lockedPayment.currency,
              rawPayloadJson: body as Prisma.InputJsonObject,
              signatureVerified: Boolean(body.signatureVerified ?? false),
              processedAt: new Date(),
            },
          });

          await tx.payment.update({
            where: { id: lockedPayment.id },
            data: {
              status: PaymentStatus.SUCCEEDED,
              paidAmount: lockedPayment.amount,
              confirmedAt: new Date(),
            },
          });
          await tx.invoice.update({
            where: { id: lockedPayment.invoiceId },
            data: {
              status: InvoiceStatus.PAID,
              paidAmount: lockedPayment.amount,
              balanceAmount: new Prisma.Decimal(0),
              paidAt: new Date(),
              paidByUserId: typeof body.actorUserId === "string" ? body.actorUserId : undefined,
            },
          });
          await tx.folio.update({
            where: { id: lockedPayment.folioId },
            data: { status: FolioStatus.CLOSED, closedAt: new Date() },
          });
          const checkedOutAt = new Date();
          await tx.guestStay.update({
            where: { id: lockedPayment.stayId },
            data: {
              status: GuestStayStatus.CHECKED_OUT,
              checkedOutAt,
              accessCodeHash: null,
              accessCodeExpiresAt: null,
            },
          });
          await closePlatformUsageAtCheckout(tx, {
            hotelId: lockedPayment.hotelId,
            roomId: lockedPayment.invoice.stay.roomId,
            stayId: lockedPayment.stayId,
            startedAt: lockedPayment.invoice.stay.checkedInAt ?? checkedOutAt,
            endedAt: checkedOutAt,
          });
          await tx.guestSession.updateMany({
            where: {
              stayId: lockedPayment.stayId,
              status: {
                in: [
                  GuestSessionStatus.CREATED,
                  GuestSessionStatus.ACTIVE,
                  GuestSessionStatus.IDLE,
                ],
              },
            },
            data: { status: GuestSessionStatus.CLOSED, closedAt: new Date() },
          });
          await tx.room.update({
            where: { id: lockedPayment.invoice.stay.roomId },
            data: { status: RoomStatus.PROCESSING },
          });
          return {
            received: true,
            idempotent: false,
            matched: true,
            paid: true,
            transaction,
            conversation: {
              hotelId: lockedPayment.hotelId,
              stayId: lockedPayment.stayId,
              roomId: lockedPayment.invoice.stay.roomId,
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if ("conversation" in result) {
        if (result.conversation) {
          this.eventPublisher.publishConversationClosed(result.conversation);
        }
        return {
          received: result.received,
          idempotent: result.idempotent,
          matched: result.matched,
          paid: result.paid,
          transaction: result.transaction,
        };
      }
      return result;
    } catch (error) {
      if (!this.isDuplicateWebhookEventError(error)) {
        throw error;
      }

      const winner = await this.prisma.paymentTransaction.findFirst({
        where: { provider, providerEventId },
        include: { invoice: true, payment: true },
      });
      if (!winner) {
        throw error;
      }

      return { received: true, idempotent: true, matched: true, transaction: winner };
    }
  }

  private isDuplicateWebhookEventError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      return false;
    }

    const target = error.meta?.target;
    const fields = Array.isArray(target)
      ? target.filter((field): field is string => typeof field === "string")
      : typeof target === "string"
        ? [target]
        : [];
    return fields.some((field) => field.includes("providerEventId"));
  }

  private async findWebhookPayment(
    tx: Prisma.TransactionClient,
    provider: PaymentProvider,
    body: Record<string, unknown>,
  ) {
    const paymentId = typeof body.paymentId === "string" ? body.paymentId : undefined;
    const providerPaymentId =
      typeof body.providerPaymentId === "string" ? body.providerPaymentId : undefined;
    const providerSessionId =
      typeof body.providerSessionId === "string" ? body.providerSessionId : undefined;
    const metadataReference =
      typeof body.metadataReference === "string" ? body.metadataReference : undefined;

    if (paymentId) {
      const byId = await tx.payment.findFirst({ where: { id: paymentId, provider } });
      if (byId) return byId;
    }

    if (providerPaymentId) {
      const byProviderPayment = await tx.payment.findFirst({
        where: { provider, providerPaymentId },
      });
      if (byProviderPayment) return byProviderPayment;
    }

    if (providerSessionId) {
      const bySession = await tx.payment.findFirst({ where: { provider, providerSessionId } });
      if (bySession) return bySession;
    }

    if (metadataReference) {
      return tx.payment.findFirst({
        where: {
          provider,
          metadataJson: { path: ["metadataReference"], equals: metadataReference },
        },
      });
    }

    return null;
  }

  private async ensureRoomChargeFolioItem(
    tx: Prisma.TransactionClient,
    folio: Prisma.FolioGetPayload<{
      include: { room: true; stay: true; hotel: { select: { id: true; name: true } } };
    }>,
    actorUserId: string,
  ) {
    if (folio.status !== FolioStatus.OPEN) {
      throw new ConflictException("ROOM_CHARGE_RECALCULATION_REQUIRES_OPEN_FOLIO");
    }

    const existing = await tx.folioItem.findFirst({
      where: {
        folioId: folio.id,
        itemType: FolioItemType.ROOM_CHARGE,
        sourceType: FolioItemSourceType.STAY,
        sourceId: folio.stayId,
        voidedAt: null,
      },
    });
    const chargeStart = folio.stay.checkedInAt ?? folio.stay.plannedCheckInAt;
    const chargeEnd = new Date(Math.min(Date.now(), folio.stay.plannedCheckOutAt.getTime()));
    const defaultPrice = new Prisma.Decimal(500000);
    const unitPrice =
      folio.room.price && !folio.room.price.isZero() ? folio.room.price : defaultPrice;
    const nights = Math.max(
      1,
      Math.ceil(Math.max(0, chargeEnd.getTime() - chargeStart.getTime()) / 86400000),
    );
    const subtotal = unitPrice.mul(nights);
    const chargeData = {
      quantity: nights,
      unitPriceSnapshot: unitPrice,
      subtotalSnapshot: subtotal,
      totalSnapshot: subtotal,
      billingSourceSnapshot: JSON.parse(
        JSON.stringify({
          stayId: folio.stayId,
          roomId: folio.roomId,
          roomNumber: folio.room.roomNumber,
          nightlyRate: unitPrice,
          chargeStart: chargeStart.toISOString(),
          chargeEnd: chargeEnd.toISOString(),
          nights,
        }),
      ) as Prisma.InputJsonValue,
    };

    const itemResult = existing
      ? await tx.folioItem.update({ where: { id: existing.id }, data: chargeData })
      : await tx.folioItem.create({
          data: {
            hotelId: folio.hotelId,
            folioId: folio.id,
            stayId: folio.stayId,
            itemType: FolioItemType.ROOM_CHARGE,
            sourceType: FolioItemSourceType.STAY,
            sourceId: folio.stayId,
            roomId: folio.roomId,
            codeSnapshot: folio.room.roomNumber,
            nameSnapshot: `Room charge - ${folio.room.roomNumber}`,
            currency: folio.currency,
            ...chargeData,
            postedByUserId: actorUserId,
          },
        });

    if (tx.folioItem?.findMany && tx.folio?.update) {
      const activeItems = await tx.folioItem.findMany({
        where: { folioId: folio.id, voidedAt: null },
      });
      const totals = this.computeTotalsFromFolioItems(activeItems);
      await tx.folio.update({
        where: { id: folio.id },
        data: {
          subtotalAmount: totals.subtotalAmount,
          taxAmount: totals.taxAmount,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
        },
      });
    }

    return itemResult;
  }

  private computeTotalsFromFolioItems(
    items: Array<{
      subtotalSnapshot: Prisma.Decimal;
      taxAmountSnapshot: Prisma.Decimal;
      discountAmountSnapshot: Prisma.Decimal;
      totalSnapshot: Prisma.Decimal;
    }>,
  ) {
    return items.reduce(
      (acc, item) => ({
        subtotalAmount: acc.subtotalAmount.add(item.subtotalSnapshot),
        taxAmount: acc.taxAmount.add(item.taxAmountSnapshot),
        discountAmount: acc.discountAmount.add(item.discountAmountSnapshot),
        totalAmount: acc.totalAmount.add(item.totalSnapshot),
      }),
      {
        subtotalAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
      },
    );
  }

  private async reconcileStayServiceRequests(
    tx: any,
    hotelId: string,
    folio: any,
    actorUserId: string,
    reconciliations?: Array<{
      requestId: string;
      action: "provided" | "cancelled";
      cancelReason?: string;
    }>,
  ) {
    if (!tx.guestRequest) return;
    const activeRequests = await tx.guestRequest.findMany({
      where: {
        stayId: folio.stayId,
        status: {
          in: [
            GuestRequestStatus.CREATED,
            GuestRequestStatus.NEW,
            GuestRequestStatus.ACKNOWLEDGED,
            GuestRequestStatus.CONFIRMED,
            GuestRequestStatus.ACCEPTED,
            GuestRequestStatus.IN_PROGRESS,
            GuestRequestStatus.PENDING,
            GuestRequestStatus.ON_THE_WAY,
          ],
        },
      },
      include: { serviceItem: true, room: true },
    });

    if (!activeRequests.length) return;

    const reconciliationsMap = new Map(
      (reconciliations ?? []).map((item) => [item.requestId, item]),
    );

    const unhandled = activeRequests.filter((req: any) => !reconciliationsMap.has(req.id));
    if (unhandled.length > 0) {
      const first = unhandled[0];
      const name = first.serviceItem?.name ?? first.title ?? "Yêu cầu dịch vụ";
      const room = first.room?.roomNumber ?? "chưa xác định";
      throw new BadRequestException(
        `Yêu cầu dịch vụ "${name}" phòng ${room} chưa được xử lý. Vui lòng xác nhận trạng thái phục vụ (Đã cung cấp hoặc Hủy) trước khi xuất hóa đơn.`,
      );
    }

    for (const req of activeRequests) {
      const rec = reconciliationsMap.get(req.id)!;
      if (rec.action === "cancelled") {
        const reason = rec.cancelReason?.trim() || "Hủy khi checkout";
        await tx.guestRequest.update({
          where: { id: req.id },
          data: {
            status: GuestRequestStatus.CANCELLED,
            cancelledAt: new Date(),
          },
        });
        if (tx.guestRequestEvent) {
          await tx.guestRequestEvent.create({
            data: {
              requestId: req.id,
              hotelId,
              actorType: GuestRequestActorType.STAFF,
              actorUserId,
              eventType: "REQUEST_UPDATED",
              fromStatus: req.status,
              toStatus: GuestRequestStatus.CANCELLED,
              note: reason,
              visibility: "GUEST",
            },
          });
        }
      } else if (rec.action === "provided") {
        const existingItem = await tx.folioItem.findFirst({
          where: {
            folioId: folio.id,
            OR: [{ guestRequestId: req.id }, { sourceId: req.id }],
          },
        });

        let folioItemIdToLink = existingItem?.id;
        if (!existingItem) {
          const unitPrice = req.serviceItem?.priceOverride ?? req.unitPrice ?? 0;
          const subtotal = new Prisma.Decimal(unitPrice).mul(req.quantity ?? 1);
          const isExt =
            Boolean(
              req.serviceItem?.category?.name &&
              /massage|spa|đối tác|bên ngoài|marketplace|external/i.test(
                req.serviceItem.category.name,
              ),
            ) ||
            Boolean(
              req.serviceItem?.name &&
              /massage|spa|đối tác|bên ngoài|marketplace|external/i.test(req.serviceItem.name),
            ) ||
            Boolean(
              req.title && /massage|spa|đối tác|bên ngoài|marketplace|external/i.test(req.title),
            );

          const newItem = await tx.folioItem.create({
            data: {
              hotelId,
              folioId: folio.id,
              stayId: folio.stayId,
              itemType: FolioItemType.SERVICE,
              sourceType: FolioItemSourceType.GUEST_REQUEST,
              sourceId: req.id,
              guestRequestId: req.id,
              serviceItemId: req.serviceItemId,
              nameSnapshot: req.serviceItem?.name ?? req.title ?? "Dịch vụ",
              quantity: req.quantity ?? 1,
              unitPriceSnapshot: new Prisma.Decimal(unitPrice),
              subtotalSnapshot: subtotal,
              totalSnapshot: subtotal,
              currency: folio.currency,
              billingSourceSnapshot: {
                requestId: req.id,
                reconciledAt: new Date().toISOString(),
                serviceSource: isExt ? "EXTERNAL" : "HOTEL",
                categoryName: req.serviceItem?.category?.name,
                partnerName: isExt ? "Đối tác dịch vụ" : undefined,
              },
              postedByUserId: actorUserId,
            },
          });
          folioItemIdToLink = newItem.id;
        }

        await tx.guestRequest.update({
          where: { id: req.id },
          data: {
            status: GuestRequestStatus.COMPLETED,
            completedAt: new Date(),
            billingPostStatus: GuestRequestBillingPostStatus.POSTED,
            billingPostedAt: new Date(),
            billingFolioItemId: folioItemIdToLink,
          },
        });

        if (tx.guestRequestEvent) {
          await tx.guestRequestEvent.create({
            data: {
              requestId: req.id,
              hotelId,
              actorType: GuestRequestActorType.STAFF,
              actorUserId,
              eventType: "REQUEST_UPDATED",
              fromStatus: req.status,
              toStatus: GuestRequestStatus.COMPLETED,
              note: "Đã cung cấp dịch vụ khi checkout",
              visibility: "GUEST",
            },
          });
        }
      }
    }
  }

  private methodFromProvider(provider: PaymentProvider) {
    if (provider === PaymentProvider.BANK_TRANSFER) return PaymentMethod.BANK_TRANSFER;
    if (provider === PaymentProvider.MOMO) return PaymentMethod.MOMO;
    if (provider === PaymentProvider.VNPAY) return PaymentMethod.VNPAY;
    if (provider === PaymentProvider.STRIPE) return PaymentMethod.STRIPE;
    return PaymentMethod.MANUAL;
  }

  private async ensureFolioExists(hotelId: string, folioId: string) {
    const folio = await this.billingRepository.folioExists(hotelId, folioId);

    if (!folio) {
      throw new NotFoundException("Không tìm thấy folio");
    }
  }

  private webhookText(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    return JSON.stringify(value);
  }
}
