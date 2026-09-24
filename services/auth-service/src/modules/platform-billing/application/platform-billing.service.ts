import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PlatformBillingContractStatus, Prisma } from "@prisma/client";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { HotelAccessService } from "../../property/application/hotel-access.service";

const DAY_MS = 86_400_000;
const MAX_RECONCILIATION_DAYS = 31;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function assertReconciliationRange(
  fromDate: string,
  toDateExclusive: string,
  maxDays = MAX_RECONCILIATION_DAYS,
): void {
  if (!DATE_ONLY.test(fromDate) || !DATE_ONLY.test(toDateExclusive)) {
    throw new Error("PLATFORM_BILLING_INVALID_RECONCILIATION_RANGE");
  }
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDateExclusive}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    throw new Error("PLATFORM_BILLING_INVALID_RECONCILIATION_RANGE");
  }
  if ((to - from) / DAY_MS > maxDays) {
    throw new Error("PLATFORM_BILLING_RECONCILIATION_RANGE_TOO_LARGE");
  }
}

export type PeriodPaymentState = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export type PeriodProjection = {
  settledAmount: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
  paymentState: PeriodPaymentState;
  isOverdue: boolean;
};

export function computePeriodProjection<
  T extends {
    total: Prisma.Decimal | number | string;
    dueAt?: Date | string | null;
    settlements?: Array<{ amount: Prisma.Decimal | number | string }>;
  },
>(period: T, now = new Date()): PeriodProjection {
  const totalDec = new Prisma.Decimal(period?.total ?? 0);
  const settledDec = (period?.settlements || []).reduce(
    (acc, s) => Prisma.Decimal.add(acc, new Prisma.Decimal(s.amount ?? 0)),
    new Prisma.Decimal(0),
  );
  const outstandingDec = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    Prisma.Decimal.sub(totalDec, settledDec),
  );

  let paymentState: PeriodPaymentState = "UNPAID";
  if (settledDec.equals(0)) {
    paymentState = "UNPAID";
  } else if (outstandingDec.equals(0)) {
    paymentState = "PAID";
  } else {
    paymentState = "PARTIALLY_PAID";
  }

  const isOverdue =
    paymentState !== "PAID" && period?.dueAt != null && now > new Date(period.dueAt);

  return {
    settledAmount: settledDec,
    outstandingAmount: outstandingDec,
    paymentState,
    isOverdue,
  };
}

export function attachPeriodProjection<
  T extends {
    total: Prisma.Decimal | number | string;
    dueAt?: Date | string | null;
    settlements?: Array<{ amount: Prisma.Decimal | number | string }>;
    debtNoticeCount?: number;
    debtNoticeSentAt?: Date | string | null;
  },
>(period: T, extraNotice?: { count: number; lastSentAt: Date | string | null }) {
  if (!period) return period;
  const projection = computePeriodProjection(period);
  return {
    ...period,
    ...projection,
    debtNoticeCount: extraNotice?.count ?? period.debtNoticeCount ?? 0,
    debtNoticeSentAt: extraNotice?.lastSentAt ?? period.debtNoticeSentAt ?? null,
  };
}

@Injectable()
export class PlatformBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  async finalizePeriod(
    contractId: string,
    periodStart: string,
    periodEnd: string,
    actorUserId?: string,
  ) {
    assertReconciliationRange(periodStart, periodEnd);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "PlatformBillingContract" WHERE id = $1 FOR UPDATE',
          contractId,
        );

        const existingPeriod = await tx.platformBillingPeriod.findUnique({
          where: {
            contractId_periodStart_periodEnd: {
              contractId,
              periodStart: new Date(periodStart),
              periodEnd: new Date(periodEnd),
            },
          },
        });

        if (existingPeriod && existingPeriod.status === "FINALIZED") {
          return existingPeriod;
        }

        const charges = await tx.platformBillableDay.aggregate({
          where: {
            contractId,
            serviceDate: { gte: new Date(periodStart), lt: new Date(periodEnd) },
          },
          _count: { id: true },
          _sum: { amount: true },
        });

        const adjustments = await tx.platformBillingAdjustment.aggregate({
          where: {
            contractId,
            createdAt: { gte: new Date(periodStart), lt: new Date(periodEnd) },
          },
          _sum: { amount: true },
        });

        const chargeCount = charges._count.id ?? 0;
        const subtotal = charges._sum.amount ?? new Prisma.Decimal(0);
        const adjustmentTotal = adjustments._sum.amount ?? new Prisma.Decimal(0);
        const total = Prisma.Decimal.add(subtotal, adjustmentTotal);
        const now = new Date();

        const period = await tx.platformBillingPeriod.upsert({
          where: {
            contractId_periodStart_periodEnd: {
              contractId,
              periodStart: new Date(periodStart),
              periodEnd: new Date(periodEnd),
            },
          },
          create: {
            contractId,
            periodStart: new Date(periodStart),
            periodEnd: new Date(periodEnd),
            status: "FINALIZED",
            chargeCount,
            subtotal,
            adjustmentTotal,
            total,
            finalizedAt: now,
            finalizedByUserId: actorUserId,
            dueAt: new Date(Date.parse(periodEnd) + 7 * 86_400_000),
          },
          update: {
            status: "FINALIZED",
            chargeCount,
            subtotal,
            adjustmentTotal,
            total,
            finalizedAt: now,
            finalizedByUserId: actorUserId,
            dueAt: new Date(Date.parse(periodEnd) + 7 * 86_400_000),
          },
        });

        return period;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recordSettlement(
    periodId: string,
    input: {
      amount: number;
      method?: string;
      reference?: string;
      idempotencyKey: string;
      actorUserId?: string;
    },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          'SELECT id FROM "PlatformBillingPeriod" WHERE id = $1 FOR UPDATE',
          periodId,
        );

        const period = await tx.platformBillingPeriod.findUnique({
          where: { id: periodId },
          include: { settlements: true },
        });
        if (!period) throw new NotFoundException("Không tìm thấy kỳ thanh toán");
        if (period.status !== "FINALIZED") {
          throw new BadRequestException("Kỳ thanh toán chưa được chốt hóa đơn");
        }

        const existing = await tx.platformBillingSettlement.findUnique({
          where: {
            periodId_idempotencyKey: {
              periodId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) {
          const projection = computePeriodProjection(period);
          return {
            ...existing,
            ...projection,
          };
        }

        const currentProjection = computePeriodProjection(period);
        const settlementAmount = new Prisma.Decimal(input.amount);

        if (settlementAmount.greaterThan(currentProjection.outstandingAmount)) {
          throw new BadRequestException(
            "Số tiền thanh toán vượt quá số tiền còn lại phải thanh toán",
          );
        }

        const settlement = await tx.platformBillingSettlement.create({
          data: {
            periodId,
            amount: settlementAmount,
            method: input.method ?? "BANK_TRANSFER",
            reference: input.reference,
            idempotencyKey: input.idempotencyKey,
            actorUserId: input.actorUserId,
          },
        });

        const updatedSettlements = [...(period.settlements || []), settlement];
        const updatedProjection = computePeriodProjection({
          ...period,
          settlements: updatedSettlements,
        });

        return {
          ...settlement,
          ...updatedProjection,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createAdjustment(
    contractId: string,
    input: {
      billableDayId?: string;
      periodId?: string;
      amount: number;
      reasonCode: string;
      note?: string;
      idempotencyKey: string;
      actorUserId?: string;
    },
  ) {
    const existing = await this.prisma.platformBillingAdjustment.findUnique({
      where: {
        contractId_idempotencyKey: {
          contractId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return existing;

    return this.prisma.platformBillingAdjustment.create({
      data: {
        contractId,
        billableDayId: input.billableDayId,
        periodId: input.periodId,
        amount: new Prisma.Decimal(input.amount),
        reasonCode: input.reasonCode,
        note: input.note,
        idempotencyKey: input.idempotencyKey,
        actorUserId: input.actorUserId,
      },
    });
  }

  private async getPeriodNoticesMap(
    periodIds: string[],
  ): Promise<Map<string, { count: number; lastSentAt: Date }>> {
    const map = new Map<string, { count: number; lastSentAt: Date }>();
    if (!this.prisma.auditLog || periodIds.length === 0) return map;

    try {
      const noticeLogs = await this.prisma.auditLog.findMany({
        where: {
          action: { in: ["DEBT_REMINDER_RECORDED", "DEBT_NOTICE_ISSUED"] },
          entityType: "PlatformBillingPeriod",
          entityId: { in: periodIds },
        },
        orderBy: { createdAt: "desc" },
        select: { entityId: true, createdAt: true },
      });

      for (const log of noticeLogs) {
        if (!log.entityId) continue;
        const existing = map.get(log.entityId);
        if (!existing) {
          map.set(log.entityId, { count: 1, lastSentAt: log.createdAt });
        } else {
          existing.count += 1;
        }
      }
    } catch {
      // Graceful fallback if auditLog is not available or mocked without findMany
    }
    return map;
  }

  async issueDebtNotice(
    periodId: string,
    options?: { channel?: "MANUAL"; note?: string; actorUserId?: string },
  ) {
    const period = await this.prisma.platformBillingPeriod.findUnique({
      where: { id: periodId },
      include: {
        contract: {
          include: {
            hotel: {
              include: {
                tenant: true,
              },
            },
          },
        },
        settlements: true,
      },
    });

    if (!period) throw new NotFoundException("Không tìm thấy kỳ thanh toán");
    if (period.status !== "FINALIZED") {
      throw new BadRequestException("Chỉ có thể ghi nhận nhắc nợ cho kỳ đã được chốt (FINALIZED)");
    }

    const projection = computePeriodProjection(period);
    if (projection.outstandingAmount.equals(0)) {
      throw new BadRequestException("Kỳ thanh toán không còn công nợ");
    }
    const noticeMap = await this.getPeriodNoticesMap([periodId]);
    const previousCount = noticeMap.get(periodId)?.count ?? 0;
    const noticeCount = previousCount + 1;
    const channel = options?.channel ?? "MANUAL";

    if (this.prisma.auditLog) {
      await this.prisma.auditLog.create({
        data: {
          actorId: options?.actorUserId || null,
          tenantId: period.contract.hotel.tenantId,
          action: "DEBT_REMINDER_RECORDED",
          entityType: "PlatformBillingPeriod",
          entityId: periodId,
          metadata: {
            noticeCount,
            channel,
            note: options?.note || "Ghi nhận đã nhắc nợ thủ công",
            total: Number(period.total),
            outstandingAmount: Number(projection.outstandingAmount),
            dueAt: period.dueAt ? period.dueAt.toISOString() : null,
            periodStart: period.periodStart.toISOString(),
            periodEnd: period.periodEnd.toISOString(),
            hotelName: period.contract.hotel.name,
            issuedAt: new Date().toISOString(),
          },
        },
      });
    }

    return {
      success: true,
      periodId,
      noticeCount,
      channel,
      issuedAt: new Date().toISOString(),
      outstandingAmount: Number(projection.outstandingAmount),
      total: Number(period.total),
      dueAt: period.dueAt ? period.dueAt.toISOString() : null,
      message: `Đã ghi nhận nhắc nợ lần ${noticeCount} cho khách sạn ${period.contract.hotel.name}`,
    };
  }

  async getPlatformDebtStatement(periodId: string) {
    return this.buildDebtStatement(periodId);
  }

  async getOwnerDebtStatement(
    periodId: string,
    actor: { actorUserId: string; actorRoleId: string },
  ) {
    const period = await this.prisma.platformBillingPeriod.findUnique({
      where: { id: periodId },
      select: {
        contract: {
          select: {
            hotelId: true,
          },
        },
      },
    });

    if (!period) throw new NotFoundException("Không tìm thấy kỳ thanh toán");

    await this.hotelAccessService.assertHotelAccess(
      actor.actorUserId,
      actor.actorRoleId,
      period.contract.hotelId,
    );

    return this.buildDebtStatement(periodId);
  }

  private async buildDebtStatement(periodId: string) {
    const period = await this.prisma.platformBillingPeriod.findUnique({
      where: { id: periodId },
      include: {
        contract: {
          include: {
            hotel: {
              include: {
                tenant: true,
              },
            },
          },
        },
        settlements: {
          orderBy: { createdAt: "desc" },
        },
        adjustments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!period) throw new NotFoundException("Không tìm thấy kỳ thanh toán");
    if (period.status !== "FINALIZED") {
      throw new BadRequestException("Kỳ thanh toán chưa được chốt hóa đơn");
    }

    const noticeMap = await this.getPeriodNoticesMap([periodId]);
    const periodProjection = attachPeriodProjection(period, noticeMap.get(periodId));

    let noticeHistory: Array<{
      id: string;
      noticeCount: number;
      channel: string;
      issuedAt: string;
      actorName?: string;
      note?: string;
    }> = [];
    if (this.prisma.auditLog) {
      const logs = await this.prisma.auditLog.findMany({
        where: {
          action: { in: ["DEBT_REMINDER_RECORDED", "DEBT_NOTICE_ISSUED"] },
          entityType: "PlatformBillingPeriod",
          entityId: periodId,
        },
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { fullName: true } },
        },
      });
      noticeHistory = logs.map((l) => ({
        id: l.id,
        noticeCount: (l.metadata as any)?.noticeCount || 1,
        channel: (l.metadata as any)?.channel || "MANUAL",
        issuedAt: l.createdAt.toISOString(),
        actorName: l.actor?.fullName || "Kế toán Nền tảng",
        note: (l.metadata as any)?.note || undefined,
      }));
    }

    // Query immutable billable-day snapshots in [periodStart, periodEnd)
    const billableDays = await this.prisma.platformBillableDay.findMany({
      where: {
        contractId: period.contractId,
        serviceDate: {
          gte: period.periodStart,
          lt: period.periodEnd,
        },
      },
      select: {
        id: true,
        calculationVersion: true,
        unitPrice: true,
        amount: true,
        currency: true,
        quantity: true,
        contractRevision: { select: { pricingModel: true } },
      },
    });

    const periodCurrency = period.currency || "VND";
    for (const day of billableDays) {
      if (day.currency && day.currency !== periodCurrency) {
        throw new BadRequestException(
          `Phát hiện loại tiền tệ không khớp (${day.currency} khác ${periodCurrency}) trong kỳ thanh toán`,
        );
      }
    }

    const rateGroups = new Map<
      string,
      {
        calculationVersion: number;
        pricingModel: string;
        unitPrice: number;
        quantity: number;
        amount: number;
        currency: string;
      }
    >();
    for (const day of billableDays) {
      const priceNum = Number(day.unitPrice);
      const pricingModel = day.contractRevision.pricingModel || "FIXED";
      const calculationVersion = day.calculationVersion ?? 1;
      const key = `${calculationVersion}_${pricingModel}_${priceNum}_${day.currency || periodCurrency}`;
      const existing = rateGroups.get(key);
      const qty = day.quantity || 1;
      const amt = Number(day.amount);
      if (existing) {
        existing.quantity += qty;
        existing.amount += amt;
      } else {
        rateGroups.set(key, {
          calculationVersion,
          pricingModel,
          unitPrice: priceNum,
          quantity: qty,
          amount: amt,
          currency: day.currency || periodCurrency,
        });
      }
    }

    let lineItems = Array.from(rateGroups.values()).map((g) => ({
      description:
        g.calculationVersion >= 2 && g.pricingModel === "PERCENTAGE"
          ? `Phí sử dụng nền tảng VietSage SaaS (${g.unitPrice.toLocaleString("vi-VN")}% giá phòng/lượt check-in)`
          : g.calculationVersion >= 2
            ? `Phí sử dụng nền tảng VietSage SaaS (${g.unitPrice.toLocaleString("vi-VN")} ${g.currency}/lượt check-in)`
            : g.pricingModel === "PERCENTAGE"
              ? `Phí sử dụng nền tảng VietSage SaaS (${g.unitPrice.toLocaleString("vi-VN")}% giá phòng)`
              : `Phí sử dụng nền tảng VietSage SaaS (${g.unitPrice.toLocaleString("vi-VN")} ${g.currency}/phòng/ngày)`,
      pricingModel: g.pricingModel,
      quantity: g.quantity,
      unitPrice: g.unitPrice,
      amount: g.amount,
      currency: g.currency,
    }));

    const billableDaysCount =
      billableDays.length > 0
        ? billableDays.reduce((sum, d) => sum + (d.quantity || 1), 0)
        : period.chargeCount || 0;

    if (lineItems.length === 0 && Number(period.subtotal) > 0) {
      const unitPrice =
        billableDaysCount > 0
          ? Number(period.subtotal) / billableDaysCount
          : Number(period.subtotal);
      lineItems = [
        {
          description: "Phí sử dụng nền tảng VietSage SaaS",
          pricingModel: "PERIOD_SNAPSHOT",
          quantity: billableDaysCount,
          unitPrice,
          amount: Number(period.subtotal),
          currency: periodCurrency,
        },
      ];
    }

    const adjustments = (period.adjustments || []).map((adj) => {
      if (adj.currency && adj.currency !== periodCurrency) {
        throw new BadRequestException(
          `Phát hiện loại tiền tệ điều chỉnh không khớp (${adj.currency} khác ${periodCurrency}) trong kỳ thanh toán`,
        );
      }
      return {
        id: adj.id,
        reasonCode: adj.reasonCode,
        amount: Number(adj.amount),
        currency: adj.currency || periodCurrency,
        note: adj.note || undefined,
      };
    });

    const brand = period.contract.hotel.brandSettings as Record<string, any> | null;

    return {
      statementNumber: `VS-STMT-${period.contract.hotel.code}-${period.id.slice(-6).toUpperCase()}`,
      issuedAt: new Date().toISOString(),
      period: periodProjection,
      hotel: {
        id: period.contract.hotel.id,
        name: period.contract.hotel.name,
        code: period.contract.hotel.code,
        address: typeof brand?.address === "string" ? brand.address : undefined,
        phoneNumber: typeof brand?.phoneNumber === "string" ? brand.phoneNumber : undefined,
        tenantId: period.contract.hotel.tenantId,
        tenantName: period.contract.hotel.tenant.name,
      },
      contract: {
        id: period.contract.id,
        status: period.contract.status,
        pricingModel: lineItems.length > 1 ? "MIXED_SNAPSHOT" : "SNAPSHOT",
        roomDayUnitPrice: lineItems.length === 1 ? lineItems[0].unitPrice : 0,
        currency: periodCurrency,
        billableDaysCount,
      },
      lineItems,
      adjustments,
      noticeHistory,
      platformBankInfo: null,
    };
  }

  async listPeriods(contractId: string) {
    const periods = await this.prisma.platformBillingPeriod.findMany({
      where: { contractId },
      include: { settlements: true, adjustments: true },
      orderBy: { periodStart: "desc" },
    });
    const noticeMap = await this.getPeriodNoticesMap(periods.map((p) => p.id));
    return periods.map((p) => attachPeriodProjection(p, noticeMap.get(p.id)));
  }

  async listAllPeriods(query?: {
    status?: "DRAFT" | "FINALIZED" | "VOID";
    paymentState?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    isOverdue?: boolean;
    search?: string;
    periodStart?: string;
    periodEnd?: string;
    limit?: number;
  }) {
    const whereClause: Prisma.PlatformBillingPeriodWhereInput = {};

    if (query?.status) {
      whereClause.status = query.status;
    }

    if (query?.periodStart) {
      whereClause.periodStart = { gte: new Date(query.periodStart) };
    }

    if (query?.periodEnd) {
      whereClause.periodEnd = { lte: new Date(query.periodEnd) };
    }

    if (query?.search) {
      whereClause.contract = {
        hotel: {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { code: { contains: query.search, mode: "insensitive" } },
          ],
        },
      };
    }

    const periods = await this.prisma.platformBillingPeriod.findMany({
      where: whereClause,
      include: {
        contract: {
          include: {
            hotel: { select: { id: true, name: true, code: true } },
            revisions: { orderBy: { effectiveFrom: "desc" }, take: 1 },
          },
        },
        settlements: true,
        adjustments: true,
      },
      orderBy: { periodStart: "desc" },
      take: query?.limit ?? 50,
    });

    const noticeMap = await this.getPeriodNoticesMap(periods.map((p) => p.id));
    let projectedPeriods = periods.map((p) => attachPeriodProjection(p, noticeMap.get(p.id)));

    if (query?.paymentState) {
      projectedPeriods = projectedPeriods.filter((p) => p.paymentState === query.paymentState);
    }

    if (query?.isOverdue !== undefined) {
      projectedPeriods = projectedPeriods.filter((p) => p.isOverdue === query.isOverdue);
    }

    return projectedPeriods;
  }

  async batchFinalize(
    input: {
      periodStart: string;
      periodEnd: string;
      contractIds?: string[];
    },
    actorUserId?: string,
  ) {
    assertReconciliationRange(input.periodStart, input.periodEnd);

    const targetContracts = await this.prisma.platformBillingContract.findMany({
      where: {
        status: "ACTIVE",
        ...(input.contractIds && input.contractIds.length > 0
          ? { id: { in: input.contractIds } }
          : {}),
      },
      include: { hotel: { select: { id: true, name: true, code: true } } },
    });

    const results: Array<{
      contractId: string;
      hotelName: string;
      periodId: string;
      total: number;
      status: string;
    }> = [];

    for (const contract of targetContracts) {
      try {
        const period = await this.finalizePeriod(
          contract.id,
          input.periodStart,
          input.periodEnd,
          actorUserId,
        );
        results.push({
          contractId: contract.id,
          hotelName: contract.hotel.name,
          periodId: period.id,
          total: Number(period.total),
          status: period.status,
        });
      } catch (err: unknown) {
        this.logger.warn(
          `Batch finalize skipped contract ${contract.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      success: true,
      finalizedCount: results.length,
      totalContracts: targetContracts.length,
      results,
    };
  }

  async getPeriod(periodId: string) {
    const period = await this.prisma.platformBillingPeriod.findUnique({
      where: { id: periodId },
      include: {
        contract: { include: { hotel: { select: { id: true, name: true, code: true } } } },
        settlements: true,
        adjustments: true,
      },
    });
    if (!period) throw new NotFoundException("Không tìm thấy kỳ thanh toán");
    const noticeMap = await this.getPeriodNoticesMap([periodId]);
    return attachPeriodProjection(period, noticeMap.get(periodId));
  }

  async getDashboardSummary() {
    const [contractCount, kpiRows, rawDuePeriods] = await Promise.all([
      this.prisma.platformBillingContract.count({ where: { status: "ACTIVE" } }),
      this.prisma.$queryRaw<
        Array<{
          finalizedPeriods?: bigint | number | string;
          finalizedAmount?: Prisma.Decimal | number | string;
          collectedAmount?: Prisma.Decimal | number | string;
          outstandingAmount?: Prisma.Decimal | number | string;
          unpaidPeriodCount?: bigint | number | string;
          overduePeriodCount?: bigint | number | string;
          overdueAmount?: Prisma.Decimal | number | string;
        }>
      >`
        SELECT
          COUNT(*)::bigint AS "finalizedPeriods",
          COALESCE(SUM(p.total), 0) AS "finalizedAmount",
          COALESCE(SUM(s.settled), 0) AS "collectedAmount",
          COALESCE(SUM(GREATEST(0, p.total - COALESCE(s.settled, 0))), 0) AS "outstandingAmount",
          COUNT(CASE WHEN p.total - COALESCE(s.settled, 0) > 0 THEN 1 END)::bigint AS "unpaidPeriodCount",
          COUNT(CASE WHEN p.total - COALESCE(s.settled, 0) > 0 AND p."dueAt" < NOW() THEN 1 END)::bigint AS "overduePeriodCount",
          COALESCE(SUM(CASE WHEN p.total - COALESCE(s.settled, 0) > 0 AND p."dueAt" < NOW() THEN p.total - COALESCE(s.settled, 0) ELSE 0 END), 0) AS "overdueAmount"
        FROM "PlatformBillingPeriod" p
        LEFT JOIN (
          SELECT "periodId", SUM(amount) AS settled
          FROM "PlatformBillingSettlement"
          GROUP BY "periodId"
        ) s ON s."periodId" = p.id
        WHERE p.status = 'FINALIZED'::"PlatformBillingPeriodStatus"
      `,
      this.prisma.platformBillingPeriod.findMany({
        where: { status: "FINALIZED" },
        include: {
          contract: { include: { hotel: { select: { name: true } } } },
          settlements: true,
        },
        orderBy: { dueAt: "asc" },
        take: 20,
      }),
    ]);

    const kpi = kpiRows?.[0];

    const finalizedPeriods = Number(kpi?.finalizedPeriods ?? 0);

    const rawFinalizedAmount = kpi?.finalizedAmount;
    const finalizedAmount =
      rawFinalizedAmount instanceof Prisma.Decimal
        ? rawFinalizedAmount
        : typeof rawFinalizedAmount === "number" || typeof rawFinalizedAmount === "string"
          ? new Prisma.Decimal(rawFinalizedAmount)
          : new Prisma.Decimal(0);

    const rawCollectedAmount = kpi?.collectedAmount;
    const collectedAmount =
      rawCollectedAmount instanceof Prisma.Decimal
        ? rawCollectedAmount
        : typeof rawCollectedAmount === "number" || typeof rawCollectedAmount === "string"
          ? new Prisma.Decimal(rawCollectedAmount)
          : new Prisma.Decimal(0);

    const rawOutstandingAmount = kpi?.outstandingAmount;
    const outstandingAmount =
      rawOutstandingAmount instanceof Prisma.Decimal
        ? rawOutstandingAmount
        : typeof rawOutstandingAmount === "number" || typeof rawOutstandingAmount === "string"
          ? new Prisma.Decimal(rawOutstandingAmount)
          : Prisma.Decimal.max(
              new Prisma.Decimal(0),
              Prisma.Decimal.sub(finalizedAmount, collectedAmount),
            );

    const unpaidPeriodCount = Number(kpi?.unpaidPeriodCount ?? 0);
    const overduePeriodCount = Number(kpi?.overduePeriodCount ?? 0);
    const overdueAmount = new Prisma.Decimal(kpi?.overdueAmount ?? 0);

    const duePeriods = rawDuePeriods
      .map((p) => attachPeriodProjection(p))
      .filter((p) => p.paymentState !== "PAID" && new Prisma.Decimal(p.outstandingAmount).gt(0));

    return {
      activeContracts: contractCount,
      finalizedPeriods,
      finalizedAmount,
      collectedAmount,
      outstandingAmount,
      unpaidPeriodCount,
      overduePeriodCount,
      overdueAmount,
      duePeriods,
    };
  }

  async createContract(
    input: {
      hotelId: string;
      starTierSnapshot?: number;
      pricingModel: "FIXED" | "PERCENTAGE";
      pricingValue: number;
      currency?: string;
      billingStartedAt: string;
    },
    actorUserId?: string,
  ) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: input.hotelId },
    });
    if (!hotel) throw new NotFoundException("Không tìm thấy khách sạn");

    const existingContract = await this.prisma.platformBillingContract.findFirst({
      where: { hotelId: input.hotelId, status: "ACTIVE" },
    });
    if (existingContract) {
      throw new BadRequestException("Khách sạn đã có hợp đồng tính phí đang hoạt động");
    }

    const onboardedAt = new Date();
    const billingStartedAt = new Date(input.billingStartedAt);
    const starTierSnapshot = input.starTierSnapshot ?? 3;
    const roomDayUnitPrice = new Prisma.Decimal(input.pricingValue);
    const currency = input.currency ?? "VND";

    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.platformBillingContract.create({
        data: {
          hotelId: input.hotelId,
          status: "ACTIVE",
          onboardedAt,
          billingStartedAt,
        },
      });

      await tx.platformBillingContractRevision.create({
        data: {
          contractId: contract.id,
          effectiveFrom: billingStartedAt,
          starTierSnapshot,
          roomDayUnitPrice,
          pricingModel: input.pricingModel,
          currency,
          createdByUserId: actorUserId,
        },
      });

      return tx.platformBillingContract.findUnique({
        where: { id: contract.id },
        include: { hotel: { select: { id: true, name: true, code: true } }, revisions: true },
      });
    });
  }

  async addContractRevision(
    contractId: string,
    input: {
      effectiveFrom: string;
      starTierSnapshot?: number;
      pricingModel: "FIXED" | "PERCENTAGE";
      pricingValue: number;
      currency?: string;
    },
    actorUserId?: string,
  ) {
    const contract = await this.prisma.platformBillingContract.findUnique({
      where: { id: contractId },
      include: { hotel: true },
    });
    if (!contract) throw new NotFoundException("Không tìm thấy hợp đồng");

    const effectiveFrom = new Date(input.effectiveFrom);
    const starTierSnapshot = input.starTierSnapshot ?? 3;
    const roomDayUnitPrice = new Prisma.Decimal(input.pricingValue);
    const currency = input.currency ?? "VND";

    return this.prisma.platformBillingContractRevision.create({
      data: {
        contractId,
        effectiveFrom,
        starTierSnapshot,
        roomDayUnitPrice,
        pricingModel: input.pricingModel,
        currency,
        createdByUserId: actorUserId,
      },
    });
  }

  async updateContractStatus(contractId: string, status: PlatformBillingContractStatus) {
    const contract = await this.prisma.platformBillingContract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException("Không tìm thấy hợp đồng");

    return this.prisma.platformBillingContract.update({
      where: { id: contractId },
      data: { status },
      include: { hotel: { select: { id: true, name: true, code: true } } },
    });
  }

  async listContracts(query?: { status?: PlatformBillingContractStatus; search?: string }) {
    const contracts = await this.prisma.platformBillingContract.findMany({
      where: {
        ...(query?.status ? { status: query.status } : {}),
        ...(query?.search
          ? {
              hotel: {
                OR: [
                  { name: { contains: query.search, mode: "insensitive" } },
                  { code: { contains: query.search, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      include: {
        hotel: { select: { id: true, name: true, code: true } },
        revisions: { orderBy: { effectiveFrom: "desc" }, take: 1 },
        periods: {
          include: { settlements: true },
          orderBy: { periodStart: "desc" },
          take: 3,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const periodIds = contracts.flatMap((c) => (c.periods || []).map((p) => p.id));
    const noticeMap = await this.getPeriodNoticesMap(periodIds);

    return contracts.map((c) => ({
      ...c,
      periods: (c.periods || []).map((p) => attachPeriodProjection(p, noticeMap.get(p.id))),
    }));
  }

  async getOwnerAnalytics(
    hotelId: string,
    queryParam:
      | {
          monthDate?: string;
          periodPage?: number;
          periodLimit?: number;
          billableDayPage?: number;
          billableDayLimit?: number;
        }
      | undefined,
    actorContext: {
      actorUserId: string;
      actorRoleId: string;
    },
  ) {
    const periodPage = Math.max(1, queryParam?.periodPage || 1);
    const periodLimit = Math.min(50, Math.max(1, queryParam?.periodLimit || 10));
    const monthDate = queryParam?.monthDate;

    await this.hotelAccessService.assertHotelAccess(
      actorContext?.actorUserId,
      actorContext?.actorRoleId,
      hotelId,
    );

    const contract = await this.prisma.platformBillingContract.findFirst({
      where: { hotelId },
      include: {
        hotel: { select: { id: true, name: true, code: true } },
        revisions: { orderBy: { effectiveFrom: "desc" }, take: 1 },
      },
    });
    if (!contract) {
      return {
        hasContract: false,
        hotelId,
        billableDaysCount: 0,
        usageCount: 0,
        estimatedFee: 0,
        periods: [],
        periodsPage: { page: periodPage, limit: periodLimit, total: 0, items: [] },
        reminder: {
          dueSoonCount: 0,
          overdueCount: 0,
          dueSoonOutstandingAmount: new Prisma.Decimal(0),
          overdueOutstandingAmount: new Prisma.Decimal(0),
          nearestDueAt: null,
        },
        debtSummary: {
          totalOutstandingAmount: 0,
          unpaidPeriodCount: 0,
          totalSettledAmount: 0,
          totalFinalizedAmount: 0,
          overdueAmount: 0,
          overdueCount: 0,
          dueSoonAmount: 0,
          dueSoonCount: 0,
          nearestDueAt: null,
        },
        roomUsageSummary: [],
      };
    }

    const targetDate = monthDate ? new Date(monthDate) : new Date();
    if (!Number.isFinite(targetDate.getTime())) {
      throw new BadRequestException("Tháng đối soát không hợp lệ");
    }
    const startOfMonth = new Date(
      Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 1),
    );
    const endOfMonth = new Date(
      Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, 1),
    );
    const monthKey = startOfMonth.toISOString().slice(0, 7);

    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [roomRows, totalPeriodsCount, paginatedPeriods, reminderRaw] = await Promise.all([
      // Single grouped pass over historical room-day rows and new per-check-in rows, keyed per room.
      // ponytail: month window uses UTC boundaries like the previous implementation;
      // switch to hotel-timezone bounds if cross-midnight edge days ever matter.
      this.prisma.$queryRaw<
        Array<{
          roomNumber: string;
          usageCount: number;
          billableDaysCount: number;
          billedAmount: Prisma.Decimal | number | string;
          currency: string | null;
          currencyCount: number;
        }>
      >`
        WITH bd AS (
          SELECT COALESCE(bs."roomId", b."subjectId") AS "roomId",
                 COUNT(*)::int AS "days",
                 SUM(b.amount) AS "amount",
                 MIN(b.currency) AS "currency",
                 COUNT(DISTINCT b.currency)::int AS "currencyCount"
          FROM "PlatformBillableDay" b
          LEFT JOIN "GuestStay" bs
            ON b."subjectType" = 'GUEST_STAY' AND bs.id = b."subjectId"
          WHERE b."contractId" = ${contract.id}
            AND b."subjectType" IN ('ROOM', 'GUEST_STAY')
            AND b."serviceDate" >= ${startOfMonth}
            AND b."serviceDate" < ${endOfMonth}
          GROUP BY COALESCE(bs."roomId", b."subjectId")
        ), us AS (
          SELECT COALESCE(s."roomId", u."subjectId") AS "roomId",
                 COUNT(DISTINCT u."sourceId")::int AS "stays"
          FROM "PlatformUsage" u
          LEFT JOIN "GuestStay" s ON s.id = u."sourceId" AND u."sourceType" = 'GUEST_STAY'
          WHERE u."hotelId" = ${hotelId}
            AND u."sourceType" = 'GUEST_STAY'
            AND u."subjectType" IN ('ROOM', 'GUEST_STAY')
            AND (s.id IS NULL OR s.status <> 'CANCELLED'::"GuestStayStatus")
            AND u."startedAt" < ${endOfMonth}
            AND COALESCE(u."endedAt", ${now}) >= ${startOfMonth}
          GROUP BY COALESCE(s."roomId", u."subjectId")
        ), subjects AS (
          SELECT "roomId" FROM bd UNION SELECT "roomId" FROM us
        )
        SELECT COALESCE(r."roomNumber", sub."roomId") AS "roomNumber",
               COALESCE(us."stays", 0) AS "usageCount",
               COALESCE(bd."days", 0) AS "billableDaysCount",
               COALESCE(bd."amount", 0) AS "billedAmount",
               bd."currency" AS "currency",
               COALESCE(bd."currencyCount", 0) AS "currencyCount"
        FROM subjects sub
        LEFT JOIN "Room" r ON r.id = sub."roomId"
        LEFT JOIN bd ON bd."roomId" = sub."roomId"
        LEFT JOIN us ON us."roomId" = sub."roomId"
        ORDER BY 1
      `,
      this.prisma.platformBillingPeriod.count({
        where: { contractId: contract.id, status: "FINALIZED" },
      }),
      this.prisma.platformBillingPeriod.findMany({
        where: { contractId: contract.id, status: "FINALIZED" },
        include: { settlements: true, adjustments: true },
        orderBy: { periodStart: "desc" },
        skip: (periodPage - 1) * periodLimit,
        take: periodLimit,
      }),
      this.prisma.$queryRaw<
        Array<{
          dueSoonCount: number;
          overdueCount: number;
          dueSoonOutstandingAmount: Prisma.Decimal;
          overdueOutstandingAmount: Prisma.Decimal;
          totalOutstandingAmount: Prisma.Decimal;
          unpaidPeriodCount: number;
          totalSettledAmount: Prisma.Decimal;
          totalFinalizedAmount: Prisma.Decimal;
          nearestDueAt: Date | null;
        }>
      >`
        SELECT
          COUNT(CASE WHEN p."dueAt" >= ${now} AND p."dueAt" <= ${next7Days} AND (p."total" - COALESCE(s."settled_sum", 0)) > 0 THEN 1 END)::int AS "dueSoonCount",
          COUNT(CASE WHEN p."dueAt" < ${now} AND (p."total" - COALESCE(s."settled_sum", 0)) > 0 THEN 1 END)::int AS "overdueCount",
          COALESCE(SUM(CASE WHEN p."dueAt" >= ${now} AND p."dueAt" <= ${next7Days} AND (p."total" - COALESCE(s."settled_sum", 0)) > 0 THEN (p."total" - COALESCE(s."settled_sum", 0)) ELSE 0 END), 0) AS "dueSoonOutstandingAmount",
          COALESCE(SUM(CASE WHEN p."dueAt" < ${now} AND (p."total" - COALESCE(s."settled_sum", 0)) > 0 THEN (p."total" - COALESCE(s."settled_sum", 0)) ELSE 0 END), 0) AS "overdueOutstandingAmount",
          COALESCE(SUM(GREATEST(0, p."total" - COALESCE(s."settled_sum", 0))), 0) AS "totalOutstandingAmount",
          COUNT(CASE WHEN (p."total" - COALESCE(s."settled_sum", 0)) > 0 THEN 1 END)::int AS "unpaidPeriodCount",
          COALESCE(SUM(COALESCE(s."settled_sum", 0)), 0) AS "totalSettledAmount",
          COALESCE(SUM(p."total"), 0) AS "totalFinalizedAmount",
          MIN(CASE WHEN (p."dueAt" >= ${now} AND p."dueAt" <= ${next7Days} AND (p."total" - COALESCE(s."settled_sum", 0)) > 0) OR (p."dueAt" < ${now} AND (p."total" - COALESCE(s."settled_sum", 0)) > 0) THEN p."dueAt" END) AS "nearestDueAt"
        FROM "PlatformBillingPeriod" p
        LEFT JOIN (
          SELECT "periodId", SUM("amount") AS "settled_sum"
          FROM "PlatformBillingSettlement"
          GROUP BY "periodId"
        ) s ON s."periodId" = p."id"
        WHERE p."contractId" = ${contract.id}
          AND p."status" = 'FINALIZED'
      `,
    ]);

    const activeRevision = contract.revisions[0];
    const unitPrice = activeRevision ? Number(activeRevision.roomDayUnitPrice) : 0;
    const defaultCurrency = activeRevision?.currency ?? "VND";

    const roomUsageSummary = (roomRows ?? []).map((row) => {
      if (Number(row.currencyCount ?? 0) > 1) {
        throw new BadRequestException(
          `Phát hiện nhiều loại tiền tệ khác nhau trong cùng một phòng (${row.roomNumber})`,
        );
      }
      return {
        roomNumber: String(row.roomNumber),
        usageCount: Number(row.usageCount ?? 0),
        billableDaysCount: Number(row.billableDaysCount ?? 0),
        billedAmount: Number(row.billedAmount ?? 0),
        currency: row.currency || defaultCurrency,
      };
    });

    // KPI totals are the sum of the same room rows the table renders — guaranteed consistent.
    const billableDaysCount = roomUsageSummary.reduce((sum, r) => sum + r.billableDaysCount, 0);
    const usageCount = roomUsageSummary.reduce((sum, r) => sum + r.usageCount, 0);
    const estimatedFee = roomUsageSummary.reduce((sum, r) => sum + r.billedAmount, 0);

    const noticeMap = await this.getPeriodNoticesMap(paginatedPeriods.map((p) => p.id));
    const projectedPeriods = paginatedPeriods.map((p) =>
      attachPeriodProjection(p, noticeMap.get(p.id)),
    );

    const reminderData = reminderRaw[0] ?? {
      dueSoonCount: 0,
      overdueCount: 0,
      dueSoonOutstandingAmount: new Prisma.Decimal(0),
      overdueOutstandingAmount: new Prisma.Decimal(0),
      totalOutstandingAmount: new Prisma.Decimal(0),
      unpaidPeriodCount: 0,
      totalSettledAmount: new Prisma.Decimal(0),
      totalFinalizedAmount: new Prisma.Decimal(0),
      nearestDueAt: null,
    };

    const reminder = {
      dueSoonCount: Number(reminderData.dueSoonCount ?? 0),
      overdueCount: Number(reminderData.overdueCount ?? 0),
      dueSoonOutstandingAmount: new Prisma.Decimal(reminderData.dueSoonOutstandingAmount ?? 0),
      overdueOutstandingAmount: new Prisma.Decimal(reminderData.overdueOutstandingAmount ?? 0),
      nearestDueAt: reminderData.nearestDueAt ? new Date(reminderData.nearestDueAt) : null,
    };

    const debtSummary = {
      totalOutstandingAmount: Number(reminderData.totalOutstandingAmount ?? 0),
      unpaidPeriodCount: Number(reminderData.unpaidPeriodCount ?? 0),
      totalSettledAmount: Number(reminderData.totalSettledAmount ?? 0),
      totalFinalizedAmount: Number(reminderData.totalFinalizedAmount ?? 0),
      overdueAmount: Number(reminderData.overdueOutstandingAmount ?? 0),
      overdueCount: Number(reminderData.overdueCount ?? 0),
      dueSoonAmount: Number(reminderData.dueSoonOutstandingAmount ?? 0),
      dueSoonCount: Number(reminderData.dueSoonCount ?? 0),
      nearestDueAt: reminderData.nearestDueAt
        ? new Date(reminderData.nearestDueAt).toISOString()
        : null,
    };

    const periodsPage = {
      page: periodPage,
      limit: periodLimit,
      total: totalPeriodsCount,
      items: projectedPeriods,
    };

    return {
      hasContract: true,
      contract,
      unitPrice,
      monthKey,
      billableDaysCount,
      usageCount,
      estimatedFee,
      periods: projectedPeriods,
      periodsPage,
      reminder,
      debtSummary,
      roomUsageSummary,
    };
  }
}
