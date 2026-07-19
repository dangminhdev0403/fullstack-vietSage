import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  FolioItemSourceType,
  FolioItemType,
  FolioStatus,
  GuestSessionStatus,
  GuestStayStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RoomQRCodeStatus,
  RoomStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { CodesService } from "../../codes/codes.service";
import { HotelAccessService } from "../../property/property-public";
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

// Checkout/invoice generation must use FolioItem rows as financial source of truth;
// Folio cached totals are a read model only and must not be trusted for snapshots.
@Injectable()
export class BillingService {
  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly hotelAccessService: HotelAccessService,
    private readonly prisma: PrismaService,
    private readonly codesService: CodesService,
    private readonly logger: AppLogger,
  ) {}

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

    return {
      page: pagination.page,
      limit: pagination.limit,
      total: result.total,
      items: result.rows,
    };
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
      items: detail.items.map((item) => ({
        id: item.id,
        type: item.itemType,
        name: item.nameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPriceSnapshot,
        subtotal: item.subtotalSnapshot,
        taxAmount: item.taxAmountSnapshot,
        discountAmount: item.discountAmountSnapshot,
        total: item.totalSnapshot,
        postedAt: item.postedAt,
      })),
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
      latestItemPostedAt,
      updatedAt: result.folio.updatedAt,
    };
  }

  async issueInvoice(actorUserId: string, activeRoleId: string, hotelId: string, folioId: string) {
    await this.hotelAccessService.assertHotelAccess(actorUserId, activeRoleId, hotelId);
    this.logger.log({
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
      this.logger.warn({
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
          }
          this.logger.warn({
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
          this.logger.warn({
            event: "CHECKOUT_ISSUE_INVOICE_BLOCKED_INVALID_FOLIO_STATUS",
            hotelId,
            stayId: folio.stayId,
            folioId,
            folioStatus: folio.status,
            timestamp: new Date().toISOString(),
          });
          throw new ConflictException("FOLIO_NOT_OPEN_FOR_CHECKOUT");
        }

        const invoiceNumber = await this.codesService.generateEntityCode("INVOICE");

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
            invoiceSnapshotJson: snapshot,
            issuedByUserId: actorUserId,
          },
        });

        await tx.folio.update({
          where: { id: folioId },
          data: { status: FolioStatus.CHECKOUT_PENDING, checkoutStartedAt: new Date() },
        });

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
      return await this.prisma.$transaction(
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
            },
          });
          await tx.folio.update({
            where: { id: lockedPayment.folioId },
            data: { status: FolioStatus.CLOSED, closedAt: new Date() },
          });
          await tx.guestStay.update({
            where: { id: lockedPayment.stayId },
            data: {
              status: GuestStayStatus.CHECKED_OUT,
              checkedOutAt: new Date(),
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
          await tx.room.update({
            where: { id: lockedPayment.invoice.stay.roomId },
            data: { status: RoomStatus.PROCESSING },
          });
          await tx.roomQRCode.updateMany({
            where: { roomId: lockedPayment.invoice.stay.roomId, status: RoomQRCodeStatus.ACTIVE },
            data: { status: RoomQRCodeStatus.INACTIVE, deactivatedAt: new Date() },
          });

          return { received: true, idempotent: false, matched: true, paid: true, transaction };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
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
    const existing = await tx.folioItem.findFirst({
      where: {
        folioId: folio.id,
        itemType: FolioItemType.ROOM_CHARGE,
        sourceType: FolioItemSourceType.STAY,
        sourceId: folio.stayId,
        voidedAt: null,
      },
    });
    if (existing) {
      return existing;
    }

    const unitPrice = folio.room.price ?? new Prisma.Decimal(0);
    const nights = Math.max(
      1,
      Math.ceil(
        (folio.stay.plannedCheckOutAt.getTime() - folio.stay.plannedCheckInAt.getTime()) / 86400000,
      ),
    );
    const subtotal = unitPrice.mul(nights);

    return tx.folioItem.create({
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
        quantity: nights,
        unitPriceSnapshot: unitPrice,
        subtotalSnapshot: subtotal,
        totalSnapshot: subtotal,
        currency: folio.currency,
        billingSourceSnapshot: {
          stayId: folio.stayId,
          roomId: folio.roomId,
          roomNumber: folio.room.roomNumber,
          nightlyRate: unitPrice,
          nights,
        },
        postedByUserId: actorUserId,
      },
    });
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
