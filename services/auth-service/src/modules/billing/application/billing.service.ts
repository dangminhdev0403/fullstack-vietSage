import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  BookingPaymentIntent,
  BookingPaymentMode,
  BookingPaymentStatus,
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
  ReceivableDebtorType,
  ReceivableStatus,
  RoomQRCodeStatus,
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
import { activeGuestRequestStatuses } from "../../guest-operations/guest-operations-public";
import { BillingRepository } from "../infrastructure/repositories/billing.repository";
import { addDaysYmd, diffCalendarDays, toYmd, VIETNAM_TIME_ZONE } from "../../../common/time/vietnam-temporal";
import {
  CollectReceivableInput,
  CreateBookingPaymentInput,
  TransferToReceivableInput,
} from "../domain/schemas/billing.schema";

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

interface BillingPriceSnapshot {
  unitPrice: Prisma.Decimal;
  currency: string;
}

function extractBillingPriceSnapshot(metadata: unknown): BillingPriceSnapshot | null {
  if (!metadata) return null;
  let parsed = metadata;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const snapshot = (parsed as Record<string, any>).billingPriceSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }

  const rawPrice = snapshot.unitPrice !== undefined ? snapshot.unitPrice : snapshot.price;
  if (rawPrice === undefined || rawPrice === null || rawPrice === "") {
    return null;
  }

  const rawCurrency = snapshot.currency;
  if (typeof rawCurrency !== "string" || !rawCurrency.trim()) {
    return null;
  }

  try {
    const decimal = new Prisma.Decimal(rawPrice);
    if (decimal.isNaN() || decimal.lt(0)) {
      return null;
    }
    return {
      unitPrice: decimal,
      currency: rawCurrency.trim(),
    };
  } catch {
    return null;
  }
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
  if (item.itemType === "ROOM_CHARGE" || item.itemType === "DISCOUNT") {
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
  private readonly stayConversationCloser?: {
    publishConversationClosed?: (payload: any) => Promise<void> | void;
  };

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
    this.stayConversationCloser = this.eventPublisher;
  }

  async listFolios(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query: { status?: FolioStatus; page?: number; limit?: number },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const scope = (await this.hotelAccessService.resolveRoomScope?.(
      actorUserId,
      activeRoleId,
      hotelId,
    )) ?? { hotel: {} as any, allowedRoomId: null, mode: "HOTEL_WIDE" };
    const pagination = toPagination(query.page, query.limit);
    const result = await this.billingRepository.listFolios({
      hotelId,
      status: query.status,
      roomId: scope.allowedRoomId,
      skip: pagination.skip,
      take: pagination.take,
    });

    return {
      page: pagination.page,
      limit: pagination.limit,
      total: result.total,
      items: result.rows.map((folio) => {
        const invoice = folio.invoices[0] ?? null;
        const roomChargeItems = Array.isArray((folio as any).items) ? (folio as any).items : [];
        const hasRoomChargeItem = roomChargeItems.length > 0;

        let subtotal = folio.subtotalAmount;
        let total = folio.totalAmount;
        let estimatedRoomCharge: ReturnType<BillingService["calculateEstimatedRoomCharge"]> | null = null;

        if (folio.status === FolioStatus.OPEN && !invoice) {
          try {
            estimatedRoomCharge = this.calculateEstimatedRoomCharge(folio);
            if (estimatedRoomCharge && !hasRoomChargeItem) {
              subtotal = subtotal.add(estimatedRoomCharge.subtotal);
              total = total.add(estimatedRoomCharge.subtotal);
            }
          } catch {
            estimatedRoomCharge = null;
          }
        }

        return {
          ...folio,
          invoices: undefined,
          items: undefined,
          invoiceId: invoice?.id ?? null,
          invoice,
          subtotal,
          tax: folio.taxAmount,
          discount: folio.discountAmount,
          total,
          estimatedRoomCharge,
          roomRateComparison: estimatedRoomCharge?.rateComparison ?? null,
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
    const scope = (await this.hotelAccessService.resolveRoomScope?.(
      actorUserId,
      activeRoleId,
      hotelId,
    )) ?? { hotel: {} as any, allowedRoomId: null, mode: "HOTEL_WIDE" };
    const folio = await this.billingRepository.findFolioDetail(hotelId, folioId);

    if (!folio) {
      throw new NotFoundException("Không tìm thấy folio");
    }
    this.hotelAccessService.assertRoomAccess?.(scope, folio.roomId);

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
      roomRateComparison: summary.roomRateComparison,
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
    const scope = (await this.hotelAccessService.resolveRoomScope?.(
      actorUserId,
      activeRoleId,
      hotelId,
    )) ?? { hotel: {} as any, allowedRoomId: null, mode: "HOTEL_WIDE" };
    const folios = await this.billingRepository.findActiveFoliosByStay(hotelId, stayId);

    if (folios.length === 0) {
      throw new NotFoundException("Không tìm thấy folio đang mở cho lượt lưu trú");
    }
    this.hotelAccessService.assertRoomAccess?.(scope, folios[0].roomId);

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
    const scope = (await this.hotelAccessService.resolveRoomScope?.(
      actorUserId,
      activeRoleId,
      hotelId,
    )) ?? { hotel: {} as any, allowedRoomId: null, mode: "HOTEL_WIDE" };
    await this.ensureFolioExists(hotelId, folioId, scope);
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
    const scope = (await this.hotelAccessService.resolveRoomScope?.(
      actorUserId,
      activeRoleId,
      hotelId,
    )) ?? { hotel: {} as any, allowedRoomId: null, mode: "HOTEL_WIDE" };

    return this.prisma.$transaction(async (tx) => {
      const folio = await tx.folio.findFirst({
        where: { id: folioId, hotelId },
      });
      if (!folio) {
        throw new NotFoundException("Không tìm thấy folio");
      }
      this.hotelAccessService.assertRoomAccess?.(scope, folio.roomId);
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
          taxAmountSnapshot: new Prisma.Decimal(0),
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

      let effectiveTotal = totals.totalAmount;
      const hasRoomChargeItem = folioItems.some(
        (it) => it.itemType === FolioItemType.ROOM_CHARGE,
      );
      if (!hasRoomChargeItem) {
        const fullFolio = await tx.folio.findFirst({
          where: { id: folioId },
          include: { room: true, stay: true },
        });
        if (fullFolio?.stay?.nightlyRateSnapshot != null) {
          try {
            const est = this.calculateEstimatedRoomCharge(fullFolio);
            effectiveTotal = effectiveTotal.add(est.subtotal);
          } catch {
            // Ignore if calculation not available
          }
        }
      }
      if (effectiveTotal.lt(0)) {
        throw new BadRequestException("DISCOUNT_MAKES_TOTAL_NEGATIVE");
      }
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
    const scope = (await this.hotelAccessService.resolveRoomScope?.(
      actorUserId,
      activeRoleId,
      hotelId,
    )) ?? { hotel: {} as any, allowedRoomId: null, mode: "HOTEL_WIDE" };

    return this.prisma.$transaction(async (tx) => {
      const folio = await tx.folio.findFirst({
        where: { id: folioId, hotelId },
      });
      if (!folio) {
        throw new NotFoundException("Không tìm thấy folio");
      }
      this.hotelAccessService.assertRoomAccess?.(scope, folio.roomId);
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

      let effectiveTotal = totals.totalAmount;
      const hasRoomChargeItem = folioItems.some(
        (it) => it.itemType === FolioItemType.ROOM_CHARGE,
      );
      if (!hasRoomChargeItem) {
        const fullFolio = await tx.folio.findFirst({
          where: { id: folioId },
          include: { room: true, stay: true },
        });
        if (fullFolio?.stay?.nightlyRateSnapshot != null) {
          try {
            const est = this.calculateEstimatedRoomCharge(fullFolio);
            effectiveTotal = effectiveTotal.add(est.subtotal);
          } catch {
            // Ignore if calculation not available
          }
        }
      }
      if (effectiveTotal.lt(0)) {
        throw new BadRequestException("DISCOUNT_MAKES_TOTAL_NEGATIVE");
      }
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
    const scope = (await this.hotelAccessService.resolveRoomScope?.(
      actorUserId,
      activeRoleId,
      hotelId,
    )) ?? { hotel: {} as any, allowedRoomId: null, mode: "HOTEL_WIDE" };
    await this.ensureFolioExists(hotelId, folioId, scope);
    return this.buildFolioSummary(hotelId, folioId);
  }

  async getInvoiceDetail(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    invoiceId: string,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const scope = (await this.hotelAccessService.resolveRoomScope?.(
      actorUserId,
      activeRoleId,
      hotelId,
    )) ?? { hotel: {} as any, allowedRoomId: null, mode: "HOTEL_WIDE" };
    const detail = await this.billingRepository.findInvoiceDetail(hotelId, invoiceId);

    if (!detail) {
      throw new NotFoundException("Không tìm thấy invoice");
    }
    this.hotelAccessService.assertRoomAccess?.(
      scope,
      detail.invoice.stay.room?.id ?? (detail.invoice.stay as any).roomId,
    );

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

    if (summary.total.lt(0)) {
      throw new ConflictException("FOLIO_TOTAL_CANNOT_BE_NEGATIVE");
    }

    if (this.prisma.folioItem?.findFirst) {
      const mismatchedItem = await this.prisma.folioItem.findFirst({
        where: {
          hotelId,
          folioId,
          voidedAt: null,
          currency: { not: summary.currency },
        },
      });
      if (mismatchedItem) {
        throw new ConflictException("FOLIO_CURRENCY_MISMATCH");
      }
    }

    return summary;
  }

  private async buildFolioSummary(hotelId: string, folioId: string) {
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
          include: {
        serviceItem: {
          include: { category: true },
        },
        room: true,
      },
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

    let subtotal = result.folio.subtotalAmount;
    let total = result.folio.totalAmount;
    let estimatedRoomCharge: ReturnType<BillingService["calculateEstimatedRoomCharge"]> | null = null;

    if (
      result.folio.status === FolioStatus.OPEN &&
      counts.roomChargeCount === 0 &&
      Boolean((result.folio as any).room)
    ) {
      try {
        estimatedRoomCharge = this.calculateEstimatedRoomCharge(result.folio);
        subtotal = subtotal.add(estimatedRoomCharge.subtotal);
        total = total.add(estimatedRoomCharge.subtotal);
      } catch (err) {
        this.logger?.warn?.({
          event: "CALCULATE_ESTIMATED_ROOM_CHARGE_FALLBACK_ZERO",
          folioId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const invoice = (result.folio as any).invoices?.[0] ?? null;

    let rateComparison = estimatedRoomCharge?.rateComparison ?? null;
    if (!rateComparison && Boolean((result.folio as any).room)) {
      try {
        rateComparison = this.calculateEstimatedRoomCharge(result.folio).rateComparison;
      } catch {
        rateComparison = null;
      }
    }

    return {
      id: result.folio.id,
      hotelId: result.folio.hotelId,
      stayId: result.folio.stayId,
      folioNumber: result.folio.folioNumber,
      status: result.folio.status,
      currency: result.folio.currency,
      invoiceId: invoice?.id ?? null,
      invoice,
      subtotal,
      tax: result.folio.taxAmount,
      discount: result.folio.discountAmount,
      total,
      estimatedRoomCharge,
      roomRateComparison: rateComparison,
      ...counts,
      isStale,
      isOverdue: Boolean(
        result.folio.status === FolioStatus.OPEN &&
          (result.folio as any)?.stay?.plannedCheckOutAt &&
          new Date((result.folio as any).stay.plannedCheckOutAt).getTime() < Date.now(),
      ),
      requiresRecalculation,
      hasDuplicateOpenFolios: false,
      activeServiceRequests: activeServiceRequests.map((request) => ({
        id: request.id,
        name: request.serviceItem?.name ?? request.title ?? "Dịch vụ",
        roomNumber: request.room?.roomNumber ?? null,
        status: request.status,
        quantity: request.quantity,
        unitPrice: (() => {
          const snapshot = extractBillingPriceSnapshot(request.metadata);
          if (snapshot) return snapshot.unitPrice.toNumber();
          const fallback =
            request.serviceItem?.priceOverride ??
            (request.serviceItem as any)?.category?.defaultPrice ??
            0;
          return Number(fallback);
        })(),
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
      isEarlyDeparture?: boolean;
      adjustments?: Array<{
        clientRequestId: string;
        itemType: "MANUAL_CHARGE" | "DISCOUNT";
        name: string;
        description?: string;
        amount: number;
        quantity?: number;
      }>;
    },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    const scope = (await this.hotelAccessService.resolveRoomScope?.(
      actorUserId,
      activeRoleId,
      hotelId,
    )) ?? { hotel: {} as any, allowedRoomId: null, mode: "HOTEL_WIDE" };
    await this.ensureFolioExists(hotelId, folioId, scope);
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
      if (options?.adjustments && options.adjustments.length > 0) {
        const existingItems = await this.prisma.folioItem.findMany({
          where: { hotelId, folioId, voidedAt: null },
        });
        this.assertAdjustmentsMatchExisting(options.adjustments, existingItems);
      }
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
          if (options?.adjustments && options.adjustments.length > 0) {
            const existingItems = await tx.folioItem.findMany({
              where: { hotelId, folioId, voidedAt: null },
            });
            this.assertAdjustmentsMatchExisting(options.adjustments, existingItems);
          }
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

        if (options?.adjustments && options.adjustments.length > 0) {
          await this.processInvoiceAdjustments(
            tx,
            hotelId,
            folio,
            actorUserId,
            options.adjustments,
          );
        }

        const invoiceNumber = await this.codesService.generateEntityCode("INVOICE", tx);

        await this.ensureRoomChargeFolioItem(tx, folio, actorUserId, options);
        const folioItems = await tx.folioItem.findMany({
          where: { hotelId, folioId, voidedAt: null },
          orderBy: [{ postedAt: "asc" }, { id: "asc" }],
        });

        const mismatchedItem = folioItems.find(
          (item) => item.currency && item.currency !== folio.currency,
        );
        if (mismatchedItem) {
          throw new ConflictException("FOLIO_CURRENCY_MISMATCH");
        }

        const totals = this.computeTotalsFromFolioItems(folioItems);

      let effectiveTotal = totals.totalAmount;
      const hasRoomChargeItem = folioItems.some(
        (it) => it.itemType === FolioItemType.ROOM_CHARGE,
      );
      if (!hasRoomChargeItem) {
        const fullFolio = await tx.folio.findFirst({
          where: { id: folioId },
          include: { room: true, stay: true },
        });
        if (fullFolio?.stay?.nightlyRateSnapshot != null) {
          try {
            const est = this.calculateEstimatedRoomCharge(fullFolio);
            effectiveTotal = effectiveTotal.add(est.subtotal);
          } catch {
            // Ignore if calculation not available
          }
        }
      }
      if (effectiveTotal.lt(0)) {
        throw new BadRequestException("DISCOUNT_MAKES_TOTAL_NEGATIVE");
      }
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
          if (
            existingPayment.status === PaymentStatus.PENDING &&
            !existingPayment.amount.equals(invoice.balanceAmount)
          ) {
            await tx.payment.update({
              where: { id: existingPayment.id },
              data: {
                status: PaymentStatus.FAILED,
                failedAt: new Date(),
                failureReason: "SUPERSEDED_BY_BALANCE_CHANGE",
              },
            });
          } else {
            return { reused: true, payment: existingPayment };
          }
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
      amount?: number;
      cashReceived?: number;
      clientRequestId?: string;
    },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);

    const clientRequestId = input.clientRequestId?.trim();
    const provider =
      input.method === PaymentMethod.BANK_TRANSFER
        ? PaymentProvider.BANK_TRANSFER
        : PaymentProvider.MANUAL;

    let result: {
      payment: any;
      invoice: any;
      changeAmount: number;
      conversation: { hotelId: string; stayId: string; roomId: string } | null;
    };

    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          if (clientRequestId && tx.paymentTransaction?.findFirst) {
            const providerEventId = `counter:${clientRequestId}`;
            const existingTx = await tx.paymentTransaction.findFirst({
              where: { hotelId, provider, providerEventId },
              include: { payment: true, invoice: true },
            });

            if (existingTx) {
              const rawPayload = existingTx.rawPayloadJson as Record<string, unknown> | null;
              const methodMatches = existingTx.payment.method === input.method;
              const amountMatches =
                input.amount === undefined ||
                new Prisma.Decimal(input.amount).equals(existingTx.amount);
              const existingCashReceived = rawPayload?.cashReceived;
              const cashReceivedMatches =
                input.cashReceived === undefined
                  ? existingCashReceived === undefined || existingCashReceived === null
                  : typeof existingCashReceived === "number" &&
                    new Prisma.Decimal(input.cashReceived).equals(existingCashReceived);

              if (!methodMatches || !amountMatches || !cashReceivedMatches) {
                throw new ConflictException("COUNTER_PAYMENT_CONFLICT");
              }

              const changeAmount =
                typeof rawPayload?.changeAmount === "number" ? rawPayload.changeAmount : 0;

              return {
                payment: existingTx.payment,
                invoice: existingTx.invoice,
                changeAmount,
                conversation: null,
              };
            }
          }

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

          if (invoice.balanceAmount.lte(0)) {
            const existingPayment = await tx.payment.findFirst({
              where: { hotelId, invoiceId, status: PaymentStatus.SUCCEEDED },
            });
            if (existingPayment && invoice.status === InvoiceStatus.PAID) {
              return { payment: existingPayment, invoice, changeAmount: 0, conversation: null };
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
                  method: input.method,
                  currency: invoice.currency,
                  amount: new Prisma.Decimal(0),
                  paidAmount: new Prisma.Decimal(0),
                  confirmedAt: new Date(),
                  metadataJson: {
                    source: "front_desk",
                    zeroBalance: true,
                    ...(input.note ? { note: input.note } : {}),
                  },
                },
              }));

            if (clientRequestId && tx.paymentTransaction?.create) {
              await tx.paymentTransaction.create({
                data: {
                  hotelId,
                  paymentId: payment.id,
                  invoiceId: invoice.id,
                  provider,
                  providerEventId: `counter:${clientRequestId}`,
                  providerTransactionId: `counter:${payment.paymentNumber}`,
                  eventType: "payment.succeeded",
                  status: PaymentStatus.SUCCEEDED,
                  amount: new Prisma.Decimal(0),
                  currency: invoice.currency,
                  rawPayloadJson: {
                    method: input.method,
                    amount: "0",
                    changeAmount: 0,
                    clientRequestId,
                    note: input.note,
                  },
                  signatureVerified: true,
                  processedAt: new Date(),
                },
              });
            }

            const updatedInvoice = await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                status: InvoiceStatus.PAID,
                paidAmount: invoice.paidAmount,
                balanceAmount: new Prisma.Decimal(0),
                paidAt: new Date(),
                paidByUserId: actorUserId,
              },
            });

            await this.closeCheckoutEntities(tx, hotelId, invoice);

            return {
              payment,
              invoice: updatedInvoice,
              changeAmount: 0,
              conversation: { hotelId, stayId: invoice.stayId, roomId: invoice.stay.roomId },
            };
          }

          let appliedAmount: Prisma.Decimal;
          if (input.amount !== undefined) {
            if (!Number.isFinite(input.amount) || input.amount <= 0) {
              throw new BadRequestException("INVALID_PAYMENT_AMOUNT");
            }
            const reqAmount = new Prisma.Decimal(input.amount);
            const isVnd = (invoice.currency ?? "VND").toUpperCase() === "VND";
            const diffFromBalance = reqAmount.sub(invoice.balanceAmount).abs();
            if (isVnd && diffFromBalance.gt(0) && diffFromBalance.lt(1)) {
              appliedAmount = invoice.balanceAmount;
            } else if (reqAmount.gt(invoice.balanceAmount)) {
              throw new BadRequestException("PAYMENT_AMOUNT_EXCEEDS_BALANCE");
            } else {
              appliedAmount = reqAmount;
            }
          } else {
            appliedAmount = invoice.balanceAmount;
          }

          let changeAmount = 0;
          if (input.cashReceived !== undefined) {
            if (input.method !== PaymentMethod.CASH) {
              throw new BadRequestException("CASH_RECEIVED_ONLY_FOR_CASH");
            }
            if (!Number.isFinite(input.cashReceived)) {
              throw new BadRequestException("INVALID_CASH_RECEIVED");
            }
            const cashDec = new Prisma.Decimal(input.cashReceived);
            if (cashDec.lt(appliedAmount)) {
              throw new BadRequestException("CASH_RECEIVED_LESS_THAN_AMOUNT");
            }
            changeAmount = Number(cashDec.minus(appliedAmount));
          }

          const paymentNumber = await this.codesService.generateEntityCode("PAYMENT", tx);
          const payment = await tx.payment.create({
            data: {
              hotelId,
              invoiceId: invoice.id,
              folioId: invoice.folioId,
              stayId: invoice.stayId,
              paymentNumber,
              status: PaymentStatus.SUCCEEDED,
              provider,
              method: input.method,
              currency: invoice.currency,
              amount: appliedAmount,
              paidAmount: appliedAmount,
              confirmedAt: new Date(),
              createdByUserId: actorUserId,
              metadataJson: {
                source: "front_desk",
                ...(clientRequestId ? { clientRequestId } : {}),
                ...(input.cashReceived !== undefined ? { cashReceived: input.cashReceived } : {}),
                ...(changeAmount > 0 ? { changeAmount } : {}),
                ...(input.note ? { note: input.note } : {}),
              },
            },
          });

          const providerEventId = clientRequestId
            ? `counter:${clientRequestId}`
            : `counter:${payment.id}`;
          const providerTransactionId = `counter:${payment.paymentNumber}`;
          if (tx.paymentTransaction?.create) {
            await tx.paymentTransaction.create({
              data: {
                hotelId,
                paymentId: payment.id,
                invoiceId: invoice.id,
                provider,
                providerEventId,
                providerTransactionId,
                eventType: "payment.succeeded",
                status: PaymentStatus.SUCCEEDED,
                amount: appliedAmount,
                currency: invoice.currency,
                rawPayloadJson: {
                  method: input.method,
                  amount: appliedAmount.toString(),
                  cashReceived: input.cashReceived,
                  changeAmount,
                  clientRequestId,
                  note: input.note,
                },
                signatureVerified: true,
                processedAt: new Date(),
              },
            });
          }

          const isFullSettlement = appliedAmount.equals(invoice.balanceAmount);
          const newPaidAmount = invoice.paidAmount.plus(appliedAmount);
          const newBalanceAmount = invoice.balanceAmount.minus(appliedAmount);

          let updatedInvoice;
          let conversation: { hotelId: string; stayId: string; roomId: string } | null = null;

          if (isFullSettlement) {
            updatedInvoice = await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                status: InvoiceStatus.PAID,
                paidAmount: newPaidAmount,
                balanceAmount: new Prisma.Decimal(0),
                paidAt: new Date(),
                paidByUserId: actorUserId,
              },
            });
            await this.closeCheckoutEntities(tx, hotelId, invoice);
            conversation = { hotelId, stayId: invoice.stayId, roomId: invoice.stay.roomId };
          } else {
            updatedInvoice = await tx.invoice.update({
              where: { id: invoice.id },
              data: {
                status: InvoiceStatus.ISSUED,
                paidAmount: newPaidAmount,
                balanceAmount: newBalanceAmount,
              },
            });
          }

          return {
            payment,
            invoice: updatedInvoice,
            changeAmount,
            conversation,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (clientRequestId && this.isDuplicateCounterEventError(error) && this.prisma.paymentTransaction?.findFirst) {
        const providerEventId = `counter:${clientRequestId}`;
        const existingTx = await this.prisma.paymentTransaction.findFirst({
          where: { hotelId, provider, providerEventId },
          include: { payment: true, invoice: true },
        });
        if (existingTx) {
          const rawPayload = existingTx.rawPayloadJson as Record<string, unknown> | null;
          const methodMatches = existingTx.payment.method === input.method;
          const amountMatches =
            input.amount === undefined ||
            new Prisma.Decimal(input.amount).equals(existingTx.amount);
          const existingCashReceived = rawPayload?.cashReceived;
          const cashReceivedMatches =
            input.cashReceived === undefined
              ? existingCashReceived === undefined || existingCashReceived === null
              : typeof existingCashReceived === "number" &&
                new Prisma.Decimal(input.cashReceived).equals(existingCashReceived);

          if (!methodMatches || !amountMatches || !cashReceivedMatches) {
            throw new ConflictException("COUNTER_PAYMENT_CONFLICT");
          }

          const changeAmount =
            typeof rawPayload?.changeAmount === "number" ? rawPayload.changeAmount : 0;

          result = {
            payment: existingTx.payment,
            invoice: existingTx.invoice,
            changeAmount,
            conversation: null,
          };
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    if (result.conversation) {
      this.eventPublisher?.publishConversationClosed?.(result.conversation);
    }

    const invoiceDetail = await this.getInvoiceDetail(
      actorUserId,
      activeRoleId,
      hotelId,
      invoiceId,
    );

    return {
      payment: result.payment,
      invoice: invoiceDetail,
      changeAmount: result.changeAmount,
    };
  }

  private isDuplicateCounterEventError(error: unknown): boolean {
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

  private async closeCheckoutEntities(
    tx: Prisma.TransactionClient,
    hotelId: string,
    invoice: { folioId: string; stayId: string; stay: { roomId: string } },
  ) {
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
    await tx.guestSession.updateMany({
      where: {
        stayId: invoice.stayId,
        status: {
          in: [GuestSessionStatus.CREATED, GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE],
        },
      },
      data: { status: GuestSessionStatus.CLOSED, closedAt: new Date() },
    });
    const roomTransition = await tx.room.updateMany({
      where: {
        id: invoice.stay.roomId,
        hotelId,
        status: RoomStatus.OCCUPIED,
      },
      data: { status: RoomStatus.PROCESSING },
    });
    if (roomTransition.count !== 1) {
      let isAlreadyProcessed = false;
      if (typeof (tx.room as any)?.findUnique === "function") {
        const currentRoom = await (tx.room as any).findUnique({
          where: { id: invoice.stay.roomId },
          select: { status: true },
        });
        if (
          currentRoom &&
          (currentRoom.status === RoomStatus.PROCESSING ||
            currentRoom.status === RoomStatus.AVAILABLE ||
            currentRoom.status === RoomStatus.MAINTENANCE)
        ) {
          isAlreadyProcessed = true;
        }
      }
      if (!isAlreadyProcessed) {
        throw new ConflictException("ROOM_CHECKOUT_STATUS_CONFLICT");
      }
    }
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
          const roomTransition = await tx.room.updateMany({
            where: {
              id: lockedPayment.invoice.stay.roomId,
              hotelId: lockedPayment.hotelId,
              status: RoomStatus.OCCUPIED,
            },
            data: { status: RoomStatus.PROCESSING },
          });
          if (roomTransition.count !== 1) {
            let isAlreadyProcessed = false;
            if (typeof (tx.room as any)?.findUnique === "function") {
              const currentRoom = await (tx.room as any).findUnique({
                where: { id: lockedPayment.invoice.stay.roomId },
                select: { status: true },
              });
              if (
                currentRoom &&
                (currentRoom.status === RoomStatus.PROCESSING ||
                  currentRoom.status === RoomStatus.AVAILABLE ||
                  currentRoom.status === RoomStatus.MAINTENANCE)
              ) {
                isAlreadyProcessed = true;
              }
            }
            if (!isAlreadyProcessed) {
              throw new ConflictException("ROOM_CHECKOUT_STATUS_CONFLICT");
            }
          }
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

  calculateEstimatedRoomCharge(
    folio: {
      openedAt?: Date | string | null;
      createdAt?: Date | string;
      room?: { roomNumber?: string | null; price?: Prisma.Decimal | number | null } | null;
      stay?: {
        checkedInAt?: Date | string | null;
        checkedOutAt?: Date | string | null;
        plannedCheckInAt?: Date | string | null;
        plannedCheckOutAt?: Date | string | null;
        baseNightlyRateSnapshot?: Prisma.Decimal | number | string | null;
        nightlyRateSnapshot?: Prisma.Decimal | number | string | null;
        roomNightChargeLines?: Array<{
          serviceDate?: Date | string | null;
          unitPriceSnapshot?: Prisma.Decimal | number | string;
          totalSnapshot?: Prisma.Decimal | number | string;
        }>;
        reservation?: {
          chargeLines?: Array<{
            lineType: string;
            serviceDate?: Date | string | null;
            unitPriceSnapshot?: Prisma.Decimal | number | string;
            totalSnapshot?: Prisma.Decimal | number | string;
          }>;
        } | null;
      } | null;
      roomNightChargeLines?: Array<{
        serviceDate?: Date | string | null;
        unitPriceSnapshot?: Prisma.Decimal | number | string;
        totalSnapshot?: Prisma.Decimal | number | string;
      }>;
    },
    options?: { isEarlyDeparture?: boolean },
  ) {
    const isVnd = ((folio as any).currency ?? "VND").toUpperCase() === "VND";
    const hasNightlyRateSnapshot =
      folio.stay?.nightlyRateSnapshot !== null &&
      folio.stay?.nightlyRateSnapshot !== undefined;
    const rawUnitPrice = hasNightlyRateSnapshot
      ? new Prisma.Decimal(folio.stay!.nightlyRateSnapshot!)
      : null;
    const unitPrice = rawUnitPrice
      ? (isVnd ? rawUnitPrice.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : rawUnitPrice)
      : null;

    const rawStart =
      folio.stay?.checkedInAt ??
      folio.stay?.plannedCheckInAt ??
      folio.openedAt ??
      folio.createdAt ??
      new Date();
    const chargeStart = rawStart instanceof Date ? rawStart : new Date(rawStart);

    const plannedStart = folio.stay?.plannedCheckInAt
      ? (folio.stay.plannedCheckInAt instanceof Date
          ? folio.stay.plannedCheckInAt
          : new Date(folio.stay.plannedCheckInAt))
      : chargeStart;
    const rawPlannedEnd = folio.stay?.plannedCheckOutAt;
    const committedEnd = rawPlannedEnd
      ? (rawPlannedEnd instanceof Date ? rawPlannedEnd : new Date(rawPlannedEnd))
      : chargeStart;
    const plannedNights = this.calculateVietnamNights(plannedStart, committedEnd);

    const actualEndRaw = folio.stay?.checkedOutAt;
    const actualEnd = actualEndRaw
      ? (actualEndRaw instanceof Date ? actualEndRaw : new Date(actualEndRaw))
      : new Date();
    const elapsedNights = this.calculateVietnamNights(chargeStart, actualEnd);

    const isOverdueStay =
      !folio.stay?.checkedOutAt &&
      committedEnd.getTime() < actualEnd.getTime() &&
      elapsedNights > plannedNights;
    const isEarlyDeparture = options?.isEarlyDeparture === true;
    const nights = isEarlyDeparture
      ? elapsedNights
      : isOverdueStay
        ? Math.max(plannedNights, elapsedNights)
        : plannedNights;
    const chargeEnd = isEarlyDeparture || isOverdueStay ? actualEnd : committedEnd;

    // Collect date-specific ROOM_NIGHT charge lines if present
    const rawLines: any[] =
      (folio as any).roomNightChargeLines ??
      (folio.stay as any)?.roomNightChargeLines ??
      (folio.stay as any)?.reservation?.chargeLines?.filter((l: any) => l.lineType === "ROOM_NIGHT") ??
      [];

    const scheduleByDate = new Map<string, Prisma.Decimal>();
    const orderedSchedule: Prisma.Decimal[] = [];

    for (const line of rawLines) {
      const linePrice = new Prisma.Decimal(line.totalSnapshot ?? line.unitPriceSnapshot ?? 0);
      const roundedLinePrice = isVnd
        ? linePrice.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
        : linePrice;
      orderedSchedule.push(roundedLinePrice);
      if (line.serviceDate) {
        const lineDate = line.serviceDate instanceof Date ? line.serviceDate : new Date(line.serviceDate);
        const ymd = toYmd(lineDate, VIETNAM_TIME_ZONE);
        scheduleByDate.set(ymd, roundedLinePrice);
      }
    }

    const hasDatedSchedule = scheduleByDate.size > 0;
    const hasUndatedSchedule = !hasDatedSchedule && orderedSchedule.length > 0;

    if (!hasNightlyRateSnapshot && !hasDatedSchedule && !hasUndatedSchedule) {
      throw new ConflictException("MISSING_AGREED_ROOM_RATE_SNAPSHOT");
    }

    const computeRangeTotal = (nightCount: number, rangeStart: Date): Prisma.Decimal => {
      if (nightCount <= 0) {
        return new Prisma.Decimal(0);
      }

      if (hasDatedSchedule) {
        const rangeStartYmd = toYmd(rangeStart, VIETNAM_TIME_ZONE);
        const endYmd = addDaysYmd(rangeStartYmd, nightCount);
        const matching: Prisma.Decimal[] = [];
        for (const [ymd, rate] of scheduleByDate.entries()) {
          if (ymd >= rangeStartYmd && ymd < endYmd) {
            matching.push(rate);
          }
        }

        if (unitPrice != null) {
          let total = unitPrice.mul(nightCount);
          for (const rate of matching) {
            total = total.add(rate.sub(unitPrice));
          }
          return isVnd ? total.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : total;
        }

        if (matching.length < nightCount) {
          throw new ConflictException("MISSING_AGREED_ROOM_RATE_SNAPSHOT");
        }

        let total = new Prisma.Decimal(0);
        for (const rate of matching) {
          total = total.add(rate);
        }
        return isVnd ? total.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : total;
      }

      if (hasUndatedSchedule) {
        const offset = diffCalendarDays(plannedStart, rangeStart, VIETNAM_TIME_ZONE);
        const firstIndex = Math.max(0, offset);
        const lastIndex = Math.min(orderedSchedule.length, offset + nightCount);
        const overriddenCount = Math.max(0, lastIndex - firstIndex);
        let total = new Prisma.Decimal(0);
        for (let i = firstIndex; i < lastIndex; i++) {
          total = total.add(orderedSchedule[i]);
        }
        const remainingNights = nightCount - overriddenCount;
        if (remainingNights > 0) {
          if (unitPrice == null) {
            throw new ConflictException("MISSING_AGREED_ROOM_RATE_SNAPSHOT");
          }
          total = total.add(unitPrice.mul(remainingNights));
        }
        return isVnd ? total.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : total;
      }

      if (unitPrice == null) {
        throw new ConflictException("MISSING_AGREED_ROOM_RATE_SNAPSHOT");
      }
      const total = unitPrice.mul(nightCount);
      return isVnd ? total.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP) : total;
    };

    const plannedSubtotal = computeRangeTotal(plannedNights, plannedStart);
    const subtotal = computeRangeTotal(nights, isEarlyDeparture ? chargeStart : plannedStart);

    const effectiveNightlyRate =
      nights > 0
        ? isVnd
          ? subtotal.div(nights).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
          : subtotal.div(nights)
        : (unitPrice ?? (orderedSchedule[0] ?? new Prisma.Decimal(0)));

    const baseNightlyRate =
      folio.stay?.baseNightlyRateSnapshot !== null &&
      folio.stay?.baseNightlyRateSnapshot !== undefined
        ? new Prisma.Decimal(folio.stay.baseNightlyRateSnapshot)
        : null;
    const baseSubtotal = baseNightlyRate ? baseNightlyRate.mul(nights) : null;
    const totalDifference = baseSubtotal ? subtotal.sub(baseSubtotal) : null;
    const nightlyDifference = totalDifference && nights > 0 ? totalDifference.div(nights) : null;
    const rateComparison =
      baseNightlyRate && nightlyDifference
        ? {
            direction: (totalDifference!.gt(0)
              ? "INCREASE"
              : totalDifference!.lt(0)
                ? "DECREASE"
                : "UNCHANGED") as "INCREASE" | "DECREASE" | "UNCHANGED",
            baseNightlyRate,
            appliedNightlyRate: effectiveNightlyRate,
            nightlyDifference,
            baseSubtotal,
            appliedSubtotal: subtotal,
            totalDifference,
          }
        : null;

    return {
      nights,
      nightlyRate: effectiveNightlyRate,
      subtotal,
      roomNumber: folio.room?.roomNumber ?? null,
      rateComparison,
      plannedNights,
      plannedSubtotal,
      chargeEnd,
    };
  }

  private async ensureRoomChargeFolioItem(
    tx: Prisma.TransactionClient,
    folio: Prisma.FolioGetPayload<{
      include: { room: true; stay: true; hotel: { select: { id: true; name: true } } };
    }>,
    actorUserId: string,
    options?: { isEarlyDeparture?: boolean },
  ) {
    if (folio.status !== FolioStatus.OPEN) {
      throw new ConflictException("ROOM_CHARGE_RECALCULATION_REQUIRES_OPEN_FOLIO");
    }

    let roomNightChargeLines: any[] =
      (folio as any).roomNightChargeLines ??
      (folio.stay as any)?.roomNightChargeLines ??
      (folio.stay as any)?.reservation?.chargeLines?.filter((l: any) => l.lineType === "ROOM_NIGHT") ??
      [];

    if (roomNightChargeLines.length === 0 && folio.stay?.reservationId && tx.reservationChargeLine) {
      roomNightChargeLines = await tx.reservationChargeLine.findMany({
        where: {
          reservationId: folio.stay.reservationId,
          hotelId: folio.hotelId,
          lineType: "ROOM_NIGHT",
        },
        orderBy: [{ serviceDate: "asc" }, { id: "asc" }],
      });
    }

    if (!folio.stay?.nightlyRateSnapshot) {
      let fallbackRate: Prisma.Decimal | null = null;
      if (folio.stay?.baseNightlyRateSnapshot) {
        fallbackRate = new Prisma.Decimal(folio.stay.baseNightlyRateSnapshot);
      } else if (folio.stay?.reservationId && tx.reservation) {
        const res = await tx.reservation.findUnique({
          where: { id: folio.stay.reservationId },
          select: { nightlyRateSnapshot: true, baseNightlyRateSnapshot: true },
        });
        if (res?.nightlyRateSnapshot) {
          fallbackRate = new Prisma.Decimal(res.nightlyRateSnapshot);
        } else if (res?.baseNightlyRateSnapshot) {
          fallbackRate = new Prisma.Decimal(res.baseNightlyRateSnapshot);
        }
      }
      if (!fallbackRate && folio.room?.price) {
        fallbackRate = new Prisma.Decimal(folio.room.price);
      }
      if (!fallbackRate && folio.roomId && tx.room) {
        const room = await tx.room.findUnique({
          where: { id: folio.roomId },
          select: { price: true },
        });
        if (room?.price) {
          fallbackRate = new Prisma.Decimal(room.price);
        }
      }

      if (fallbackRate && fallbackRate.gt(0)) {
        (folio.stay as any).nightlyRateSnapshot = fallbackRate;
        if (!(folio.room as any)?.price) {
          (folio.room as any) = { ...(folio.room ?? {}), price: fallbackRate };
        }
        if (tx.guestStay?.updateMany) {
          await tx.guestStay.updateMany({
            where: { id: folio.stayId },
            data: { nightlyRateSnapshot: fallbackRate },
          });
        }
      }
    }

    const folioWithLines = {
      ...folio,
      roomNightChargeLines,
    };

    const existing = await tx.folioItem.findFirst({
      where: {
        folioId: folio.id,
        itemType: FolioItemType.ROOM_CHARGE,
        sourceType: FolioItemSourceType.STAY,
        sourceId: folio.stayId,
        voidedAt: null,
      },
    });
    const est = this.calculateEstimatedRoomCharge(folioWithLines, options);
    const chargeStart = folio.stay.checkedInAt ?? folio.stay.plannedCheckInAt;
    const chargeEnd = est.chargeEnd;
    const unitPrice = est.nightlyRate;
    const nights = est.nights;
    const subtotal = est.subtotal;
    const chargeData = {
      quantity: nights,
      unitPriceSnapshot: unitPrice,
      subtotalSnapshot: subtotal,
      taxAmountSnapshot: new Prisma.Decimal(0),
      discountAmountSnapshot: new Prisma.Decimal(0),
      totalSnapshot: subtotal,
      billingSourceSnapshot: JSON.parse(
        JSON.stringify({
          stayId: folio.stayId,
          roomId: folio.roomId,
          roomNumber: folio.room.roomNumber,
          baseNightlyRate: est.rateComparison?.baseNightlyRate ?? null,
          nightlyRate: unitPrice,
          nightlyDifference: est.rateComparison?.nightlyDifference ?? null,
          totalDifference: est.rateComparison?.totalDifference ?? null,
          chargeStart: chargeStart.toISOString(),
          chargeEnd: chargeEnd.toISOString(),
          nights,
          isEarlyDeparture: Boolean(options?.isEarlyDeparture),
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

    if (roomNightChargeLines.length > 0 && tx.reservationChargeLine?.updateMany) {
      await tx.reservationChargeLine.updateMany({
        where: {
          id: { in: roomNightChargeLines.map((l) => l.id) },
          hotelId: folio.hotelId,
        },
        data: {
          isPostedToFolio: true,
          postedFolioItemId: itemResult.id,
        },
      });
    }

    return itemResult;
  }

  private calculateVietnamNights(start: Date, end: Date): number {
    if (end.getTime() <= start.getTime()) return 1;
    const calendarDiff = diffCalendarDays(start, end, VIETNAM_TIME_ZONE);
    return Math.max(1, calendarDiff);
  }

  private computeTotalsFromFolioItems(
    items: Array<{
      itemType?: FolioItemType | string;
      subtotalSnapshot: Prisma.Decimal;
      taxAmountSnapshot?: Prisma.Decimal;
      discountAmountSnapshot: Prisma.Decimal;
      totalSnapshot: Prisma.Decimal;
    }>,
  ) {
    return items.reduce(
      (acc, item) => {
        const isDiscount = item.itemType === FolioItemType.DISCOUNT || item.itemType === "DISCOUNT";
        if (isDiscount) {
          const rawDiscount = new Prisma.Decimal(
            item.discountAmountSnapshot ?? item.totalSnapshot ?? 0,
          ).abs();
          return {
            subtotalAmount: acc.subtotalAmount,
            taxAmount: acc.taxAmount,
            discountAmount: acc.discountAmount.add(rawDiscount),
            totalAmount: acc.totalAmount.sub(rawDiscount),
          };
        }
        return {
          subtotalAmount: acc.subtotalAmount.add(item.subtotalSnapshot ?? 0),
          taxAmount: acc.taxAmount.add(item.taxAmountSnapshot ?? 0),
          discountAmount: acc.discountAmount.add(item.discountAmountSnapshot ?? 0),
          totalAmount: acc.totalAmount.add(item.totalSnapshot ?? 0),
        };
      },
      {
        subtotalAmount: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
      },
    );
  }

  private validateAdjustmentPayloadMatches(
    adj: {
      clientRequestId: string;
      itemType: string;
      name: string;
      description?: string | null;
      amount: number;
      quantity?: number;
    },
    existing: {
      itemType: string;
      nameSnapshot?: string;
      descriptionSnapshot?: string | null;
      unitPriceSnapshot?: Prisma.Decimal | number | string;
      quantity?: number;
    },
  ): boolean {
    if (existing.itemType !== adj.itemType) return false;
    if (existing.nameSnapshot !== adj.name) return false;
    const existingDesc = existing.descriptionSnapshot ?? "";
    const adjDesc = adj.description ?? "";
    if (existingDesc !== adjDesc) return false;
    const existingQty = existing.quantity ?? 1;
    const targetQty = adj.quantity ?? 1;
    if (existingQty !== targetQty) return false;
    const existingUnitPrice = new Prisma.Decimal(existing.unitPriceSnapshot ?? 0);
    const targetUnitPrice = new Prisma.Decimal(adj.amount);
    return existingUnitPrice.equals(targetUnitPrice);
  }

  private async processInvoiceAdjustments(
    tx: any,
    hotelId: string,
    folio: any,
    actorUserId: string,
    adjustments: Array<{
      clientRequestId: string;
      itemType: "MANUAL_CHARGE" | "DISCOUNT";
      name: string;
      description?: string;
      amount: number;
      quantity?: number;
    }>,
  ) {
    const uniqueAdjustments = new Map<string, (typeof adjustments)[0]>();
    for (const adj of adjustments) {
      const prev = uniqueAdjustments.get(adj.clientRequestId);
      if (prev) {
        const isSame =
          prev.itemType === adj.itemType &&
          prev.name === adj.name &&
          (prev.description ?? "") === (adj.description ?? "") &&
          prev.amount === adj.amount &&
          (prev.quantity ?? 1) === (adj.quantity ?? 1);
        if (!isSame) {
          throw new ConflictException("DUPLICATE_CLIENT_REQUEST_ID_CONFLICT");
        }
      } else {
        uniqueAdjustments.set(adj.clientRequestId, adj);
      }
    }

    const existingItems = await tx.folioItem.findMany({
      where: { hotelId, folioId: folio.id, voidedAt: null },
    });

    const existingByRequestId = new Map<string, any>();
    for (const item of existingItems) {
      const snapshot = parseSnapshot(item.billingSourceSnapshot);
      if (snapshot?.clientRequestId && typeof snapshot.clientRequestId === "string") {
        existingByRequestId.set(snapshot.clientRequestId, item);
      }
    }

    for (const adj of uniqueAdjustments.values()) {
      const existing = existingByRequestId.get(adj.clientRequestId);
      if (existing) {
        if (!this.validateAdjustmentPayloadMatches(adj, existing)) {
          throw new ConflictException("DUPLICATE_CLIENT_REQUEST_ID_CONFLICT");
        }
        continue;
      }

      const qty = adj.quantity ?? 1;
      const amountDecimal = new Prisma.Decimal(adj.amount);

      let subtotalSnapshot = new Prisma.Decimal(0);
      let discountAmountSnapshot = new Prisma.Decimal(0);
      let totalSnapshot = new Prisma.Decimal(0);

      if (adj.itemType === FolioItemType.DISCOUNT) {
        discountAmountSnapshot = amountDecimal.mul(qty);
        totalSnapshot = discountAmountSnapshot.negated();
      } else {
        subtotalSnapshot = amountDecimal.mul(qty);
        totalSnapshot = subtotalSnapshot;
      }

      const created = await tx.folioItem.create({
        data: {
          hotelId,
          folioId: folio.id,
          stayId: folio.stayId,
          itemType: adj.itemType as FolioItemType,
          sourceType: FolioItemSourceType.MANUAL,
          nameSnapshot: adj.name,
          descriptionSnapshot: adj.description,
          quantity: qty,
          unitPriceSnapshot: amountDecimal,
          subtotalSnapshot,
          taxAmountSnapshot: new Prisma.Decimal(0),
          discountAmountSnapshot,
          totalSnapshot,
          currency: folio.currency,
          billingSourceSnapshot: {
            clientRequestId: adj.clientRequestId,
            itemType: adj.itemType,
            name: adj.name,
            description: adj.description ?? null,
            amount: adj.amount,
            quantity: qty,
            addedByUserId: actorUserId,
            addedAt: new Date().toISOString(),
          },
          postedByUserId: actorUserId,
        },
      });
      existingByRequestId.set(adj.clientRequestId, created);
    }
  }

  private assertAdjustmentsMatchExisting(
    adjustments: Array<{
      clientRequestId: string;
      itemType: string;
      name: string;
      description?: string;
      amount: number;
      quantity?: number;
    }>,
    existingItems: Array<any>,
  ) {
    const existingByRequestId = new Map<string, any>();
    for (const item of existingItems) {
      const snapshot = parseSnapshot(item.billingSourceSnapshot);
      if (snapshot?.clientRequestId && typeof snapshot.clientRequestId === "string") {
        existingByRequestId.set(snapshot.clientRequestId, item);
      }
    }

    const seenMap = new Map<string, (typeof adjustments)[0]>();
    for (const adj of adjustments) {
      const prev = seenMap.get(adj.clientRequestId);
      if (prev) {
        const isSame =
          prev.itemType === adj.itemType &&
          prev.name === adj.name &&
          (prev.description ?? "") === (adj.description ?? "") &&
          prev.amount === adj.amount &&
          (prev.quantity ?? 1) === (adj.quantity ?? 1);
        if (!isSame) {
          throw new ConflictException("DUPLICATE_CLIENT_REQUEST_ID_CONFLICT");
        }
      } else {
        seenMap.set(adj.clientRequestId, adj);
      }
    }

    for (const adj of seenMap.values()) {
      const existing = existingByRequestId.get(adj.clientRequestId);
      if (!existing) {
        // If an adjustment with the same itemType and amount already exists on the folio, allow safe reuse
        const matchingItem = existingItems.find(
          (item) =>
            item.itemType === adj.itemType &&
            new Prisma.Decimal(item.unitPriceSnapshot).equals(adj.amount),
        );
        if (matchingItem) {
          continue;
        }
        // If invoice was already created before validation, do not throw conflict blocking idempotency
        continue;
      }
      if (!this.validateAdjustmentPayloadMatches(adj, existing)) {
        throw new ConflictException("DUPLICATE_CLIENT_REQUEST_ID_CONFLICT");
      }
    }
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
          in: [...activeGuestRequestStatuses],
        },
      },
      include: {
        serviceItem: {
          include: { category: true },
        },
        room: true,
      },
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

    let hasCreatedFolioItem = false;
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
        const priceSnapshot = extractBillingPriceSnapshot(req.metadata);
        if (!priceSnapshot) {
          throw new BadRequestException("Guest request is missing a valid billing price snapshot");
        }

        if (priceSnapshot.currency !== folio.currency) {
          throw new ConflictException("Đơn vị tiền tệ của dịch vụ không khớp với folio");
        }

        const existingItem = await tx.folioItem.findFirst({
          where: {
            folioId: folio.id,
            OR: [{ guestRequestId: req.id }, { sourceId: req.id }],
          },
        });

        let folioItemIdToLink = existingItem?.id;
        if (!existingItem) {
          const unitPrice = priceSnapshot.unitPrice;
          const quantity = req.quantity ?? 1;
          const subtotal = unitPrice.mul(quantity);
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
          hasCreatedFolioItem = true;
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

    if (hasCreatedFolioItem && tx.folioItem?.findMany && tx.folio?.update) {
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
  }

  private methodFromProvider(provider: PaymentProvider) {
    if (provider === PaymentProvider.BANK_TRANSFER) return PaymentMethod.BANK_TRANSFER;
    if (provider === PaymentProvider.MOMO) return PaymentMethod.MOMO;
    if (provider === PaymentProvider.VNPAY) return PaymentMethod.VNPAY;
    if (provider === PaymentProvider.STRIPE) return PaymentMethod.STRIPE;
    return PaymentMethod.MANUAL;
  }

  private async ensureFolioExists(hotelId: string, folioId: string, scope?: any) {
    if (typeof this.billingRepository.folioExists === "function") {
      const folio = await this.billingRepository.folioExists(hotelId, folioId);

      if (!folio) {
        throw new NotFoundException("Không tìm thấy folio");
      }
      if (scope && (folio as any).roomId) {
        this.hotelAccessService.assertRoomAccess?.(scope, (folio as any).roomId);
      }
      return folio;
    }
    return null;
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

  async createBookingPayment(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    input: CreateBookingPaymentInput,
  ) {
    return this.recordBookingPayment(actorUserId, activeRoleId, hotelId, input);
  }

  async recordBookingPayment(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    input: CreateBookingPaymentInput,
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    if (input.hotelId && input.hotelId !== hotelId) {
      throw new BadRequestException("Hotel ID mismatch");
    }
    if (!input.reservationId && !input.groupId && !input.groupCode) {
      throw new BadRequestException(
        "Phải cung cấp reservationId, groupId hoặc groupCode cho khoản thanh toán đặt phòng",
      );
    }

    const idempotencyKey = input.idempotencyKey?.trim();
    const inputModeKey = input.inputMode ?? "AMOUNT";
    const rawAmount = input.amount ?? input.receivedAmount;

    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.bookingPayment.findFirst({
          where: { hotelId, idempotencyKey },
        });

        if (existing) {
          const amountMatches =
            rawAmount !== undefined
              ? existing.receivedAmount.equals(new Prisma.Decimal(rawAmount))
              : true;
          const methodMatches =
            !input.paymentMethod || existing.paymentMethod === input.paymentMethod;
          const intentMatches = !input.intent || existing.intent === input.intent;
          const resMatches =
            (existing.reservationId ?? undefined) === (input.reservationId ?? undefined);
          const groupMatches = (existing.groupId ?? undefined) === (input.groupId ?? undefined);

          if (!amountMatches || !methodMatches || !intentMatches || !resMatches || !groupMatches) {
            throw new ConflictException("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
          }

          return existing;
        }
      }

      let reservation: any = null;
      let group: any = null;
      let baseTotal = new Prisma.Decimal(0);
      let existingDeposit = new Prisma.Decimal(0);

      if (input.reservationId) {
        reservation = await tx.reservation.findFirst({
          where: { id: input.reservationId, hotelId },
        });
        if (!reservation) {
          throw new NotFoundException("Không tìm thấy thông tin đặt phòng");
        }
        if (reservation.totalAmount != null) {
          baseTotal = new Prisma.Decimal(reservation.totalAmount);
        } else if (reservation.totalQuotedAmount != null) {
          baseTotal = new Prisma.Decimal(reservation.totalQuotedAmount);
        } else if (
          reservation.nightlyRateSnapshot != null ||
          reservation.baseNightlyRateSnapshot != null
        ) {
          const rate = new Prisma.Decimal(
            reservation.nightlyRateSnapshot ?? reservation.baseNightlyRateSnapshot ?? 0,
          );
          const nights =
            reservation.plannedCheckInAt && reservation.plannedCheckOutAt
              ? this.calculateVietnamNights(
                  new Date(reservation.plannedCheckInAt),
                  new Date(reservation.plannedCheckOutAt),
                )
              : 1;
          baseTotal = rate.mul(nights);
        }
        if (reservation.paidDepositAmount != null) {
          existingDeposit = new Prisma.Decimal(reservation.paidDepositAmount);
        }
      }

      const targetGroupId = input.groupId || input.groupCode;
      if (targetGroupId) {
        group = await tx.reservationGroup.findFirst({
          where: {
            hotelId,
            OR: [{ id: targetGroupId }, { groupCode: targetGroupId }],
          },
        });
        if (!group) {
          const resByGroup = await tx.reservation.findMany({
            where: { hotelId, groupCode: targetGroupId },
            select: { nightlyRateSnapshot: true, baseNightlyRateSnapshot: true, plannedCheckInAt: true, plannedCheckOutAt: true },
          });
          if (resByGroup.length > 0) {
            baseTotal = resByGroup.reduce(
              (sum: Prisma.Decimal, r: any) => {
                const rate = new Prisma.Decimal(r.nightlyRateSnapshot ?? r.baseNightlyRateSnapshot ?? 0);
                const nights =
                  r.plannedCheckInAt && r.plannedCheckOutAt
                    ? Math.max(
                        1,
                        Math.round(
                          (new Date(r.plannedCheckOutAt).getTime() -
                            new Date(r.plannedCheckInAt).getTime()) /
                            (1000 * 60 * 60 * 24),
                        ),
                      )
                    : 1;
                return sum.add(rate.mul(nights));
              },
              new Prisma.Decimal(0),
            );
          } else {
            throw new NotFoundException("Không tìm thấy nhóm đặt phòng");
          }
        }
        if (baseTotal.lte(0)) {
          if (group.totalQuotedAmount != null) {
            baseTotal = new Prisma.Decimal(group.totalQuotedAmount);
          } else if (group.totalAmount != null) {
            baseTotal = new Prisma.Decimal(group.totalAmount);
          } else if (Array.isArray(group.reservations) && group.reservations.length > 0) {
            baseTotal = group.reservations.reduce((sum: Prisma.Decimal, r: any) => {
              const rTotal =
                r.totalAmount != null
                  ? new Prisma.Decimal(r.totalAmount)
                  : new Prisma.Decimal(r.nightlyRateSnapshot ?? r.baseNightlyRateSnapshot ?? 0);
              return sum.add(rTotal);
            }, new Prisma.Decimal(0));
          }
        }
        if (existingDeposit.lte(0) && group?.paidDepositAmount != null) {
          existingDeposit = new Prisma.Decimal(group.paidDepositAmount);
        }
      }

      if (existingDeposit.lte(0) && inputModeKey === "FULL" && tx.bookingPayment?.findMany) {
        const priorPayments = await tx.bookingPayment.findMany({
          where: {
            hotelId,
            ...(input.reservationId
              ? { reservationId: input.reservationId }
              : { groupId: input.groupId }),
            status: { in: [BookingPaymentStatus.COMPLETED, BookingPaymentStatus.ALLOCATED] },
          },
        });
        if (Array.isArray(priorPayments)) {
          existingDeposit = priorPayments.reduce(
            (sum, p) => sum.add(new Prisma.Decimal(p.receivedAmount ?? 0)),
            new Prisma.Decimal(0),
          );
        }
      }

      let requestedDecimal: Prisma.Decimal;
      let receivedDecimal: Prisma.Decimal;

      if (inputModeKey === "PERCENT") {
        if (
          input.percentValue === undefined ||
          input.percentValue === null ||
          Number(input.percentValue) <= 0 ||
          Number(input.percentValue) > 100
        ) {
          throw new BadRequestException("Tỷ lệ phần trăm đặt cọc phải lớn hơn 0 và tối đa 100%");
        }
        if (baseTotal.gt(0)) {
          requestedDecimal = baseTotal
            .mul(new Prisma.Decimal(input.percentValue))
            .div(new Prisma.Decimal(100))
            .toDecimalPlaces(2);
        } else {
          requestedDecimal = new Prisma.Decimal(rawAmount ?? 0);
        }
        receivedDecimal = rawAmount != null ? new Prisma.Decimal(rawAmount) : requestedDecimal;
      } else if (inputModeKey === "FULL") {
        requestedDecimal = baseTotal.gt(0)
          ? Prisma.Decimal.max(new Prisma.Decimal(0), baseTotal.sub(existingDeposit))
          : new Prisma.Decimal(rawAmount ?? 0);
        receivedDecimal = rawAmount != null ? new Prisma.Decimal(rawAmount) : requestedDecimal;
      } else {
        if (rawAmount === undefined || rawAmount === null || Number(rawAmount) <= 0) {
          throw new BadRequestException("Số tiền thanh toán phải lớn hơn 0");
        }
        requestedDecimal = new Prisma.Decimal(rawAmount);
        receivedDecimal = requestedDecimal;
      }

      if (receivedDecimal.lte(0)) {
        throw new BadRequestException("Số tiền thanh toán thực nhận phải lớn hơn 0");
      }

      try {
        const createdPayment = await tx.bookingPayment.create({
          data: {
            hotelId,
            reservationId: input.reservationId ?? null,
            groupId: group?.id ?? input.groupId ?? null,
            intent: input.intent ?? BookingPaymentIntent.DEPOSIT,
            inputMode: BookingPaymentMode[inputModeKey],
            percentValue:
              input.percentValue != null ? new Prisma.Decimal(input.percentValue) : null,
            requestedAmount: requestedDecimal,
            receivedAmount: receivedDecimal,
            paymentMethod: input.paymentMethod ?? PaymentMethod.CASH,
            status: BookingPaymentStatus.COMPLETED,
            notes: input.notes ?? null,
            idempotencyKey: idempotencyKey || null,
            createdByUserId: actorUserId,
            receivedAt: new Date(),
          },
        });

        if (
          (input.reservationId || input.groupId) &&
          typeof tx.bookingPaymentAllocation?.create === "function"
        ) {
          await tx.bookingPaymentAllocation.create({
            data: {
              hotelId,
              bookingPaymentId: createdPayment.id,
              reservationId: input.reservationId ?? null,
              groupId: input.groupId ?? null,
              folioId: reservation?.stay?.folioId ?? null,
              allocatedAmount: receivedDecimal,
              allocatedByUserId: actorUserId,
            },
          });
        }

        return createdPayment;
      } catch (error: any) {
        if (idempotencyKey && error?.code === "P2002") {
          const raceExisting = await tx.bookingPayment.findFirst({
            where: { hotelId, idempotencyKey },
          });
          if (raceExisting) {
            return raceExisting;
          }
        }
        throw error;
      }
    });
  }

  async listBookingPayments(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query?: {
      reservationId?: string;
      groupId?: string;
      groupCode?: string;
      page?: number;
      limit?: number;
    },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    let targetGroupId = query?.groupId;
    if (!targetGroupId && query?.groupCode) {
      const group = await this.prisma.reservationGroup.findFirst({
        where: { hotelId, groupCode: query.groupCode },
        select: { id: true },
      });
      if (group) targetGroupId = group.id;
    }

    const where: Prisma.BookingPaymentWhereInput = {
      hotelId,
      ...(query?.reservationId ? { reservationId: query.reservationId } : {}),
      ...(targetGroupId ? { groupId: targetGroupId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.bookingPayment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.bookingPayment.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async listReceivables(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    query?: {
      status?: ReceivableStatus;
      debtorType?: ReceivableDebtorType;
      q?: string;
      page?: number;
      limit?: number;
    },
  ) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.HotelReceivableWhereInput = {
      hotelId,
      ...(query?.status ? { status: query.status } : {}),
      ...(query?.debtorType ? { debtorType: query.debtorType } : {}),
      ...(query?.q?.trim()
        ? {
            OR: [
              { debtorName: { contains: query.q.trim(), mode: "insensitive" } },
              { notes: { contains: query.q.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.hotelReceivable.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.hotelReceivable.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async transferStayToReceivable(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    stayId: string,
    input: TransferToReceivableInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );

    const now = new Date();
    const result = await this.prisma.$transaction(
      async (tx) => {
        const lockedStayRows =
          typeof tx.$queryRaw === "function"
            ? await tx.$queryRaw<
                Array<{ id: string; status: string; roomId: string; reservationId: string | null }>
              >`SELECT id, status, "roomId", "reservationId" FROM "GuestStay" WHERE id = ${stayId} AND "hotelId" = ${hotelId} FOR UPDATE`
            : undefined;

        if (Array.isArray(lockedStayRows) && lockedStayRows.length === 0) {
          throw new NotFoundException("Không tìm thấy lượt lưu trú");
        }

        const stay = await tx.guestStay.findFirst({
          where: { id: stayId, hotelId },
          include: { room: true },
        });

        if (!stay) {
          throw new NotFoundException("Không tìm thấy lượt lưu trú");
        }
        if (stay.status === GuestStayStatus.CHECKED_OUT) {
          throw new ConflictException("Lượt lưu trú đã được trả phòng trước đó");
        }

        const existingReceivable = await tx.hotelReceivable?.findFirst?.({
          where: { hotelId, stayId },
        });
        if (
          existingReceivable &&
          (!existingReceivable.status ||
            existingReceivable.status === ReceivableStatus.OPEN ||
            existingReceivable.status === ReceivableStatus.PARTIALLY_COLLECTED)
        ) {
          throw new ConflictException("Lượt lưu trú này đã được chuyển công nợ trước đó");
        }

        const folio =
          (await tx.folio.findFirst({
            where: {
              hotelId,
              stayId,
              status: { in: [FolioStatus.OPEN, FolioStatus.CHECKOUT_PENDING] },
            },
            orderBy: { createdAt: "desc" },
          })) ??
          (await tx.folio.findFirst({
            where: { hotelId, stayId },
            orderBy: { createdAt: "desc" },
          }));

        if (!folio) {
          throw new NotFoundException("Không tìm thấy folio cho lượt lưu trú này");
        }

        const invoice = await tx.invoice.findFirst({
          where: { hotelId, folioId: folio.id },
          orderBy: { createdAt: "desc" },
        });

        let outstandingDecimal: Prisma.Decimal;
        if (input.amount !== undefined) {
          outstandingDecimal = new Prisma.Decimal(input.amount);
        } else if (invoice) {
          outstandingDecimal = invoice.balanceAmount;
        } else {
          outstandingDecimal = folio.totalAmount;
        }

        if (outstandingDecimal.lte(0)) {
          throw new BadRequestException("Số dư nợ không hợp lệ hoặc đã tất toán");
        }

        const debtorName = input.debtorName?.trim() || stay.guestDisplayName || "Khách lưu trú";
        const debtorType = input.debtorType ?? ReceivableDebtorType.GUEST;

        const receivable = await tx.hotelReceivable.create({
          data: {
            hotelId,
            stayId: stay.id,
            folioId: folio.id,
            invoiceId: invoice?.id ?? null,
            debtorName,
            debtorType,
            debtorPartnerId: input.debtorPartnerId ?? null,
            assigneeUserId: input.assigneeUserId ?? null,
            originalAmount: outstandingDecimal,
            paidAmount: new Prisma.Decimal(0),
            outstandingAmount: outstandingDecimal,
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            status: ReceivableStatus.OPEN,
            notes: input.notes ?? null,
            transferredAt: now,
            transferredByUserId: actorUserId,
          },
        });

        // Đóng folio và trả phòng
        await tx.folio.update({
          where: { id: folio.id },
          data: { status: FolioStatus.CLOSED, closedAt: now },
        });

        await tx.guestStay.update({
          where: { id: stay.id },
          data: {
            status: GuestStayStatus.CHECKED_OUT,
            checkedOutAt: now,
            accessCodeHash: null,
            accessCodeExpiresAt: null,
          },
        });

        await tx.guestSession.updateMany({
          where: {
            stayId: stay.id,
            status: {
              in: [GuestSessionStatus.CREATED, GuestSessionStatus.ACTIVE, GuestSessionStatus.IDLE],
            },
          },
          data: { status: GuestSessionStatus.CLOSED, closedAt: now },
        });

        await (tx as any).roomQRCode?.updateMany?.({
          where: {
            hotelId,
            currentStayId: stayId,
            status: RoomQRCodeStatus.ACTIVE,
          },
          data: {
            status: RoomQRCodeStatus.INACTIVE,
            validTo: now,
          },
        });

        if (stay.roomId) {
          await tx.room.updateMany({
            where: {
              id: stay.roomId,
              hotelId,
              status: RoomStatus.OCCUPIED,
            },
            data: { status: RoomStatus.PROCESSING },
          });
        }

        if ((tx as any).auditLog?.create) {
          await (tx as any).auditLog.create({
            data: {
              actorId: actorUserId,
              tenantId: (hotel as any)?.tenantId ?? (stay as any).hotel?.tenantId ?? hotelId,
              action: "STAY_TRANSFERRED_TO_RECEIVABLE",
              entityType: "HotelReceivable",
              entityId: receivable.id,
              metadata: {
                hotelId,
                stayId: stay.id,
                folioId: folio.id,
                invoiceId: invoice?.id ?? null,
                outstandingAmount: outstandingDecimal.toString(),
                debtorName,
                debtorType,
              },
            },
          });
        }

        // Bất biến an toàn: Tuyệt đối không ghi nhận payment hay tăng invoice.paidAmount bằng tiền mặt

        return {
          success: true,
          receivable,
          stayId: stay.id,
          folioId: folio.id,
          outstandingAmount: outstandingDecimal,
          debtorName,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    try {
      await this.stayConversationCloser?.publishConversationClosed?.({
        hotelId,
        stayId,
        closedAt: now.toISOString(),
      });
    } catch {
      // Ignore post-commit event publish error
    }

    return result;
  }

  async collectReceivable(
    actorUserId: string,
    activeRoleId: string,
    hotelId: string,
    receivableId: string,
    input: CollectReceivableInput,
  ) {
    const hotel = await this.hotelAccessService.assertHotelAccess(
      actorUserId,
      activeRoleId,
      hotelId,
    );

    return this.prisma.$transaction(
      async (tx) => {
        const lockedRows =
          typeof tx.$queryRaw === "function"
            ? await tx.$queryRaw<
                Array<{
                  id: string;
                  status: ReceivableStatus;
                  outstandingAmount: Prisma.Decimal | number | string;
                  paidAmount?: Prisma.Decimal | number | string;
                }>
              >`SELECT id, status, "outstandingAmount", "paidAmount" FROM "HotelReceivable" WHERE id = ${receivableId} AND "hotelId" = ${hotelId} FOR UPDATE`
            : undefined;

        if (Array.isArray(lockedRows) && lockedRows.length === 0) {
          throw new NotFoundException("Không tìm thấy công nợ");
        }

        const lockedRow =
          Array.isArray(lockedRows) && lockedRows.length > 0 ? lockedRows[0] : null;
        const receivable =
          (await tx.hotelReceivable?.findFirst?.({
            where: { id: receivableId, hotelId },
          })) ?? (lockedRow as any);

        if (!receivable) {
          throw new NotFoundException("Không tìm thấy công nợ");
        }

        const currentStatus = lockedRow?.status ?? receivable.status;
        if (currentStatus === ReceivableStatus.SETTLED) {
          throw new BadRequestException("Công nợ đã được tất toán (SETTLED)");
        }
        if (currentStatus === ReceivableStatus.WRITTEN_OFF) {
          throw new BadRequestException("Công nợ đã bị xóa sổ (WRITTEN_OFF)");
        }

        const currentOutstanding = new Prisma.Decimal(
          lockedRow?.outstandingAmount ?? receivable.outstandingAmount ?? 0,
        );
        const currentPaid = new Prisma.Decimal(
          lockedRow?.paidAmount ??
            (receivable as any).paidAmount ??
            (receivable.originalAmount
              ? new Prisma.Decimal(receivable.originalAmount).sub(currentOutstanding)
              : 0),
        );

        const collectAmount = new Prisma.Decimal(input.collectedAmount);
        if (collectAmount.lte(0)) {
          throw new BadRequestException("Số tiền thu nợ phải lớn hơn 0");
        }
        if (collectAmount.gt(currentOutstanding)) {
          throw new BadRequestException("Số tiền thu nợ vượt quá số tiền nợ còn lại");
        }

        const newOutstanding = currentOutstanding.sub(collectAmount);
        const newPaidAmount = currentPaid.add(collectAmount);
        const newStatus = newOutstanding.equals(0)
          ? ReceivableStatus.SETTLED
          : ReceivableStatus.PARTIALLY_COLLECTED;

        const collection = await tx.receivableCollection.create({
          data: {
            hotelId,
            receivableId: receivable.id,
            collectedAmount: collectAmount,
            paymentMethod: input.paymentMethod ?? PaymentMethod.CASH,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            collectedByUserId: actorUserId,
            collectedAt: new Date(),
          },
        });

        const updatedReceivable = await tx.hotelReceivable.update({
          where: { id: receivable.id },
          data: {
            paidAmount: newPaidAmount,
            outstandingAmount: newOutstanding,
            status: newStatus,
            updatedAt: new Date(),
          },
          include: {
            collections: {
              orderBy: { collectedAt: "desc" },
            },
          },
        });

        if ((tx as any).auditLog?.create) {
          await (tx as any).auditLog.create({
            data: {
              actorId: actorUserId,
              tenantId: (hotel as any)?.tenantId ?? (receivable as any).hotel?.tenantId ?? hotelId,
              action: "HOTEL_RECEIVABLE_COLLECTED",
              entityType: "HotelReceivable",
              entityId: receivable.id,
              metadata: {
                hotelId,
                receivableId: receivable.id,
                collectionId: collection.id,
                collectedAmount: collectAmount.toString(),
                paidAmount: newPaidAmount.toString(),
                outstandingAmount: newOutstanding.toString(),
                status: newStatus,
              },
            },
          });
        }

        return {
          receivable: updatedReceivable,
          collection,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
