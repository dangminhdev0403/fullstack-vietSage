import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PlatformBillingContractStatus, Prisma } from "@prisma/client";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { HotelAccessService } from "../../property/property-public";

const DAY_MS = 86_400_000;
const MAX_RECONCILIATION_DAYS = 31;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

type Tx = Prisma.TransactionClient;

type StayUsageInput = {
  hotelId: string;
  roomId: string;
  stayId: string;
  startedAt: Date;
  endedAt?: Date | null;
};

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
    paymentState !== "PAID" &&
    period?.dueAt != null &&
    now > new Date(period.dueAt);

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
  },
>(period: T) {
  if (!period) return period;
  const projection = computePeriodProjection(period);
  return {
    ...period,
    ...projection,
  };
}

const HTZ = Prisma.raw(
  `CASE WHEN h.timezone = 'Asia/Saigon' OR h.timezone IS NULL THEN 'Asia/Ho_Chi_Minh' ELSE h.timezone END`,
);
const UTZ = Prisma.raw(
  `CASE WHEN u."hotelTimezoneSnapshot" = 'Asia/Saigon' OR u."hotelTimezoneSnapshot" IS NULL THEN 'Asia/Ho_Chi_Minh' ELSE u."hotelTimezoneSnapshot" END`,
);

export async function recordPlatformUsageAtCheckIn(tx: Tx, input: StayUsageInput): Promise<void> {
  if (typeof tx?.$queryRaw !== "function" || typeof tx?.$executeRaw !== "function") return;
  const bounds = await tx.$queryRaw<
    Array<{ contractId: string; serviceDate: string; nextDate: string }>
  >`
    SELECT c.id AS "contractId",
           ((${input.startedAt} AT TIME ZONE ${HTZ})::date)::text AS "serviceDate",
           (((${input.startedAt} AT TIME ZONE ${HTZ})::date + 1))::text AS "nextDate"
    FROM "PlatformBillingContract" c
    JOIN "Hotel" h ON h.id = c."hotelId"
    WHERE c."hotelId" = ${input.hotelId}
      AND c.status = 'ACTIVE'::"PlatformBillingContractStatus"
      AND c."billingStartedAt" <= ${input.startedAt}
    ORDER BY c."createdAt" DESC
    LIMIT 1
    FOR UPDATE OF c
  `;
  const bound = bounds[0];
  if (!bound) return;

  await tx.$executeRaw`
    INSERT INTO "PlatformUsage" (
      id, "hotelId", "subjectType", "subjectId", "usageKind", "sourceType", "sourceId",
      occurrence, "startedAt", "hotelTimezoneSnapshot", "createdAt"
    )
    SELECT 'pu_' || md5(${input.stayId} || ':1'), ${input.hotelId}, 'ROOM', ${input.roomId},
           'STAY', 'GUEST_STAY', ${input.stayId}, 1, ${input.startedAt},
           CASE WHEN h.timezone = 'Asia/Saigon' THEN 'Asia/Ho_Chi_Minh' ELSE h.timezone END, NOW()
    FROM "Hotel" h WHERE h.id = ${input.hotelId}
    ON CONFLICT ("sourceType", "sourceId", occurrence) DO NOTHING
  `;
  await reconcilePlatformBillingRange(
    tx,
    bound.contractId,
    bound.serviceDate,
    bound.nextDate,
    input.startedAt,
  );
}

export async function closePlatformUsageAtCheckout(tx: Tx, input: StayUsageInput): Promise<void> {
  if (typeof tx?.$executeRaw !== "function" || typeof tx?.$queryRaw !== "function") return;
  await tx.$executeRaw`
    UPDATE "PlatformUsage"
    SET "endedAt" = ${input.endedAt},
        "closedAt" = ${input.endedAt},
        "durationMinutes" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${input.endedAt} - "startedAt")) / 60))::integer
    WHERE "sourceType" = 'GUEST_STAY' AND "sourceId" = ${input.stayId}
      AND occurrence = 1 AND "endedAt" IS NULL
  `;
  const bounds = await tx.$queryRaw<
    Array<{ contractId: string; fromDate: string; toDate: string }>
  >`
    SELECT c.id AS "contractId",
           date_trunc('month', ${input.endedAt} AT TIME ZONE ${HTZ})::date::text AS "fromDate",
           (date_trunc('month', ${input.endedAt} AT TIME ZONE ${HTZ}) + interval '1 month')::date::text AS "toDate"
    FROM "PlatformBillingContract" c
    JOIN "Hotel" h ON h.id = c."hotelId"
    WHERE c."hotelId" = ${input.hotelId}
      AND c.status = 'ACTIVE'::"PlatformBillingContractStatus"
    ORDER BY c."createdAt" DESC LIMIT 1 FOR UPDATE OF c
  `;
  const bound = bounds[0];
  if (bound) {
    await reconcilePlatformBillingRange(
      tx,
      bound.contractId,
      bound.fromDate,
      bound.toDate,
      input.endedAt!,
    );
  }
}

export async function reconcilePlatformBillingRange(
  tx: Tx,
  contractId: string,
  fromDate: string,
  toDateExclusive: string,
  watermark: Date,
): Promise<void> {
  assertReconciliationRange(fromDate, toDateExclusive);
  await tx.$executeRaw`
    UPDATE "Hotel" SET timezone = 'Asia/Ho_Chi_Minh' WHERE timezone = 'Asia/Saigon'
  `;
  await tx.$executeRaw`
    UPDATE "PlatformUsage" SET "hotelTimezoneSnapshot" = 'Asia/Ho_Chi_Minh' WHERE "hotelTimezoneSnapshot" = 'Asia/Saigon'
  `;
  await tx.$executeRaw`
    INSERT INTO "PlatformUsage" (
      id, "hotelId", "subjectType", "subjectId", "usageKind", "sourceType", "sourceId", occurrence,
      "startedAt", "endedAt", "durationMinutes", "hotelTimezoneSnapshot", "createdAt", "closedAt"
    )
    SELECT 'pu_' || md5(s.id || ':1'), s."hotelId", 'ROOM', s."roomId", 'STAY', 'GUEST_STAY', s.id, 1,
           s."checkedInAt", s."checkedOutAt",
           CASE WHEN s."checkedOutAt" IS NULL THEN NULL ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (s."checkedOutAt" - s."checkedInAt")) / 60))::integer END,
           CASE WHEN h.timezone = 'Asia/Saigon' THEN 'Asia/Ho_Chi_Minh' ELSE h.timezone END, NOW(), s."checkedOutAt"
    FROM "PlatformBillingContract" c
    JOIN "Hotel" h ON h.id = c."hotelId"
    JOIN "GuestStay" s ON s."hotelId" = c."hotelId"
    WHERE c.id = ${contractId} AND s."checkedInAt" IS NOT NULL
      AND s."checkedInAt" < (${toDateExclusive}::date::timestamp AT TIME ZONE ${HTZ})
      AND (s."checkedOutAt" IS NULL OR s."checkedOutAt" > (${fromDate}::date::timestamp AT TIME ZONE ${HTZ}))
    ON CONFLICT ("sourceType", "sourceId", occurrence) DO UPDATE
      SET "endedAt" = EXCLUDED."endedAt", "durationMinutes" = EXCLUDED."durationMinutes", "closedAt" = EXCLUDED."closedAt"
      WHERE "PlatformUsage"."endedAt" IS NULL AND EXCLUDED."endedAt" IS NOT NULL
  `;
  await tx.$executeRaw`
    WITH days AS (
      SELECT d::date AS "serviceDate"
      FROM generate_series(${fromDate}::date, ${toDateExclusive}::date - 1, interval '1 day') d
    ), expected AS (
      SELECT DISTINCT c.id AS "contractId", r.id AS "revisionId", c."hotelId", u."subjectType",
             u."subjectId", d."serviceDate", ${UTZ} AS "hotelTimezoneSnapshot", r."starTierSnapshot",
             r."roomDayUnitPrice", r.currency,
             (d."serviceDate"::timestamp AT TIME ZONE ${UTZ}) AS "windowStart",
             ((d."serviceDate" + 1)::timestamp AT TIME ZONE ${UTZ}) AS "windowEnd"
      FROM "PlatformBillingContract" c
      JOIN "PlatformUsage" u ON u."hotelId" = c."hotelId"
      CROSS JOIN days d
      JOIN LATERAL (
        SELECT r.* FROM "PlatformBillingContractRevision" r
        WHERE r."contractId" = c.id AND r."effectiveFrom" <= d."serviceDate"
        ORDER BY r."effectiveFrom" DESC LIMIT 1
      ) r ON TRUE
      WHERE c.id = ${contractId}
        AND d."serviceDate" >= ${fromDate}::date AND d."serviceDate" < ${toDateExclusive}::date
        AND u."startedAt" < ((d."serviceDate" + 1)::timestamp AT TIME ZONE ${UTZ})
        AND COALESCE(u."endedAt", ${watermark}) > (d."serviceDate"::timestamp AT TIME ZONE ${UTZ})
        AND NOT EXISTS (
          SELECT 1 FROM "PlatformBillingPeriod" p
          WHERE p."contractId" = c.id AND p.status = 'FINALIZED'::"PlatformBillingPeriodStatus"
            AND d."serviceDate" >= p."periodStart" AND d."serviceDate" < p."periodEnd"
        )
    )
    INSERT INTO "PlatformBillableDay" (
      id, "contractId", "contractRevisionId", "hotelId", "subjectType", "subjectId", "serviceDate",
      "hotelTimezoneSnapshot", "starTierSnapshot", "unitPrice", quantity, amount, currency,
      "calculationVersion", "sourceWindowStart", "sourceWindowEnd", "createdAt"
    )
    SELECT 'pbd_' || md5("contractId" || ':' || "subjectType" || ':' || "subjectId" || ':' || "serviceDate"::text),
           "contractId", "revisionId", "hotelId", "subjectType", "subjectId", "serviceDate",
           "hotelTimezoneSnapshot", "starTierSnapshot", "roomDayUnitPrice", 1, "roomDayUnitPrice", currency,
           1, "windowStart", "windowEnd", NOW()
    FROM expected
    ON CONFLICT ("contractId", "subjectType", "subjectId", "serviceDate") DO NOTHING
  `;

  const missing = await tx.$queryRaw<Array<{ count: bigint }>>`
    WITH days AS (
      SELECT d::date AS "serviceDate"
      FROM generate_series(${fromDate}::date, ${toDateExclusive}::date - 1, interval '1 day') d
    ), expected AS (
      SELECT DISTINCT c.id AS "contractId", u."subjectType", u."subjectId", d."serviceDate"
      FROM "PlatformBillingContract" c
      JOIN "PlatformUsage" u ON u."hotelId" = c."hotelId"
      CROSS JOIN days d
      JOIN LATERAL (
        SELECT r.id FROM "PlatformBillingContractRevision" r
        WHERE r."contractId" = c.id AND r."effectiveFrom" <= d."serviceDate"
        ORDER BY r."effectiveFrom" DESC LIMIT 1
      ) r ON TRUE
      WHERE c.id = ${contractId}
        AND d."serviceDate" >= ${fromDate}::date AND d."serviceDate" < ${toDateExclusive}::date
        AND u."startedAt" < ((d."serviceDate" + 1)::timestamp AT TIME ZONE ${UTZ})
        AND COALESCE(u."endedAt", ${watermark}) > (d."serviceDate"::timestamp AT TIME ZONE ${UTZ})
        AND NOT EXISTS (
          SELECT 1 FROM "PlatformBillingPeriod" p WHERE p."contractId" = c.id
            AND p.status = 'FINALIZED'::"PlatformBillingPeriodStatus"
            AND d."serviceDate" >= p."periodStart" AND d."serviceDate" < p."periodEnd"
        )
    )
    SELECT COUNT(*)::bigint AS count FROM expected e
    LEFT JOIN "PlatformBillableDay" b ON b."contractId" = e."contractId"
      AND b."subjectType" = e."subjectType" AND b."subjectId" = e."subjectId"
      AND b."serviceDate" = e."serviceDate"
    WHERE b.id IS NULL
  `;
  if (Number(missing[0]?.count ?? 0) !== 0)
    throw new Error("PLATFORM_BILLING_RECONCILIATION_INCOMPLETE");
}

@Injectable()
export class PlatformBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  @Interval(300_000)
  async reconcileCatchUp(): Promise<void> {
    const contracts = await this.prisma.$queryRaw<
      Array<{ id: string; fromDate: string; toDate: string }>
    >`
      SELECT c.id,
             COALESCE((c."reconciledThroughDate" + 1)::text, (c."billingStartedAt" AT TIME ZONE ${HTZ})::date::text) AS "fromDate",
             LEAST(COALESCE(c."reconciledThroughDate" + 32, (c."billingStartedAt" AT TIME ZONE ${HTZ})::date + 31),
                   (NOW() AT TIME ZONE ${HTZ})::date + 1)::text AS "toDate"
      FROM "PlatformBillingContract" c JOIN "Hotel" h ON h.id = c."hotelId"
      WHERE c.status = ${PlatformBillingContractStatus.ACTIVE}::"PlatformBillingContractStatus"
        AND COALESCE(c."reconciledThroughDate", (c."billingStartedAt" AT TIME ZONE ${HTZ})::date - 1)
            < (NOW() AT TIME ZONE ${HTZ})::date
      ORDER BY c."reconciledThroughDate" NULLS FIRST, c.id LIMIT 50
    `;
    for (const contract of contracts) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await reconcilePlatformBillingRange(
              tx,
              contract.id,
              contract.fromDate,
              contract.toDate,
              new Date(),
            );
            await tx.$executeRaw`
            UPDATE "PlatformBillingContract" SET "reconciledThroughDate" = ${contract.toDate}::date - 1
            WHERE id = ${contract.id}
              AND ("reconciledThroughDate" IS NULL OR "reconciledThroughDate" < ${contract.toDate}::date - 1)
          `;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        this.logger.error(error, {
          module: "platform-billing",
          event: "PLATFORM_BILLING_RECONCILIATION_FAILED",
          contractId: contract.id,
        });
      }
    }
  }

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

        await reconcilePlatformBillingRange(tx, contractId, periodStart, periodEnd, new Date());

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
          throw new BadRequestException("Số tiền thanh toán vượt quá số tiền còn lại phải thanh toán");
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

  async listPeriods(contractId: string) {
    const periods = await this.prisma.platformBillingPeriod.findMany({
      where: { contractId },
      include: { settlements: true, adjustments: true },
      orderBy: { periodStart: "desc" },
    });
    return periods.map((p) => attachPeriodProjection(p));
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
    return attachPeriodProjection(period);
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
        }>
      >`
        SELECT
          COUNT(*)::bigint AS "finalizedPeriods",
          COALESCE(SUM(p.total), 0) AS "finalizedAmount",
          COALESCE(SUM(s.settled), 0) AS "collectedAmount",
          COALESCE(SUM(GREATEST(0, p.total - COALESCE(s.settled, 0))), 0) AS "outstandingAmount",
          COUNT(CASE WHEN p.total - COALESCE(s.settled, 0) > 0 THEN 1 END)::bigint AS "unpaidPeriodCount",
          COUNT(CASE WHEN p.total - COALESCE(s.settled, 0) > 0 AND p."dueAt" < NOW() THEN 1 END)::bigint AS "overduePeriodCount"
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
        : Prisma.Decimal.max(new Prisma.Decimal(0), Prisma.Decimal.sub(finalizedAmount, collectedAmount));

    const unpaidPeriodCount = Number(kpi?.unpaidPeriodCount ?? 0);
    const overduePeriodCount = Number(kpi?.overduePeriodCount ?? 0);

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
      duePeriods,
    };
  }

  async createContract(
    input: {
      hotelId: string;
      starTierSnapshot?: number;
      roomDayUnitPrice: number;
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
    const roomDayUnitPrice = new Prisma.Decimal(input.roomDayUnitPrice);
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
      roomDayUnitPrice: number;
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
    const roomDayUnitPrice = new Prisma.Decimal(input.roomDayUnitPrice);
    const currency = input.currency ?? "VND";

    return this.prisma.platformBillingContractRevision.create({
      data: {
        contractId,
        effectiveFrom,
        starTierSnapshot,
        roomDayUnitPrice,
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

    return contracts.map((c) => ({
      ...c,
      periods: (c.periods || []).map((p) => attachPeriodProjection(p)),
    }));
  }

  async getOwnerAnalytics(
    hotelId: string,
    queryParam: {
      monthDate?: string;
      periodPage?: number;
      periodLimit?: number;
      billableDayPage?: number;
      billableDayLimit?: number;
    } | undefined,
    actorContext: {
      actorUserId: string;
      actorRoleId: string;
    },
  ) {
    const periodPage = Math.max(1, queryParam?.periodPage || 1);
    const periodLimit = Math.min(50, Math.max(1, queryParam?.periodLimit || 10));
    const billableDayPage = Math.max(1, queryParam?.billableDayPage || 1);
    const billableDayLimit = Math.min(100, Math.max(1, queryParam?.billableDayLimit || 20));
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
        billableDays: [],
        periodsPage: { page: periodPage, limit: periodLimit, total: 0, items: [] },
        billableDaysPage: { page: billableDayPage, limit: billableDayLimit, total: 0, items: [] },
        reminder: {
          dueSoonCount: 0,
          overdueCount: 0,
          dueSoonOutstandingAmount: new Prisma.Decimal(0),
          overdueOutstandingAmount: new Prisma.Decimal(0),
          nearestDueAt: null,
        },
        dailySummaries: [],
        roomUsageSummary: [],
      };
    }

    const targetDate = monthDate ? new Date(monthDate) : new Date();
    const startOfMonth = new Date(
      Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 1),
    );
    const endOfMonth = new Date(
      Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth() + 1, 1),
    );

    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalBillableDaysCount,
      paginatedBillableDays,
      monthBillableDays,
      totalPeriodsCount,
      paginatedPeriods,
      summaries,
      rooms,
      platformUsages,
      reminderRaw,
    ] = await Promise.all([
      this.prisma.platformBillableDay.count({
        where: {
          contractId: contract.id,
          serviceDate: { gte: startOfMonth, lt: endOfMonth },
        },
      }),
      this.prisma.platformBillableDay.findMany({
        where: {
          contractId: contract.id,
          serviceDate: { gte: startOfMonth, lt: endOfMonth },
        },
        orderBy: { serviceDate: "desc" },
        skip: (billableDayPage - 1) * billableDayLimit,
        take: billableDayLimit,
      }),
      this.prisma.platformBillableDay.findMany({
        where: {
          contractId: contract.id,
          serviceDate: { gte: startOfMonth, lt: endOfMonth },
        },
        select: { subjectId: true, amount: true, currency: true },
      }),
      this.prisma.platformBillingPeriod.count({
        where: { contractId: contract.id },
      }),
      this.prisma.platformBillingPeriod.findMany({
        where: { contractId: contract.id },
        include: { settlements: true, adjustments: true },
        orderBy: { periodStart: "desc" },
        skip: (periodPage - 1) * periodLimit,
        take: periodLimit,
      }),
      this.prisma.platformBillingDailySummary.findMany({
        where: {
          contractId: contract.id,
          serviceDate: { gte: startOfMonth, lt: endOfMonth },
        },
        orderBy: { serviceDate: "desc" },
      }),
      this.prisma.room.findMany({
        where: { hotelId },
        select: { id: true, roomNumber: true },
      }),
      this.prisma.platformUsage.findMany({
        where: {
          hotelId,
          startedAt: { gte: startOfMonth, lt: endOfMonth },
        },
        select: {
          id: true,
          subjectId: true,
          occurrence: true,
          startedAt: true,
          endedAt: true,
          durationMinutes: true,
        },
        orderBy: { startedAt: "desc" },
      }),
      this.prisma.$queryRaw<
        Array<{
          dueSoonCount: number;
          overdueCount: number;
          dueSoonOutstandingAmount: Prisma.Decimal;
          overdueOutstandingAmount: Prisma.Decimal;
          nearestDueAt: Date | null;
        }>
      >`
        SELECT
          COUNT(CASE WHEN p."dueAt" >= ${now} AND p."dueAt" <= ${next7Days} AND (p."total" - COALESCE(s."settled_sum", 0)) > 0 THEN 1 END)::int AS "dueSoonCount",
          COUNT(CASE WHEN p."dueAt" < ${now} AND (p."total" - COALESCE(s."settled_sum", 0)) > 0 THEN 1 END)::int AS "overdueCount",
          COALESCE(SUM(CASE WHEN p."dueAt" >= ${now} AND p."dueAt" <= ${next7Days} AND (p."total" - COALESCE(s."settled_sum", 0)) > 0 THEN (p."total" - COALESCE(s."settled_sum", 0)) ELSE 0 END), 0) AS "dueSoonOutstandingAmount",
          COALESCE(SUM(CASE WHEN p."dueAt" < ${now} AND (p."total" - COALESCE(s."settled_sum", 0)) > 0 THEN (p."total" - COALESCE(s."settled_sum", 0)) ELSE 0 END), 0) AS "overdueOutstandingAmount",
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

    const roomMap = new Map(rooms.map((r) => [r.id, r.roomNumber]));
    const mappedBillableDays = paginatedBillableDays.map((bd) => ({
      ...bd,
      roomNumber: roomMap.get(bd.subjectId) ?? bd.subjectId,
    }));

    const activeRevision = contract.revisions[0];
    const unitPrice = activeRevision ? Number(activeRevision.roomDayUnitPrice) : 0;
    const defaultCurrency = activeRevision?.currency ?? "VND";

    const roomUsageMap = new Map<
      string,
      { roomNumber: string; usageCount: number; billableDaysCount: number; billedAmount: number; currency: string }
    >();

    for (const room of rooms) {
      roomUsageMap.set(room.id, {
        roomNumber: room.roomNumber,
        usageCount: 0,
        billableDaysCount: 0,
        billedAmount: 0,
        currency: defaultCurrency,
      });
    }

    for (const pu of platformUsages) {
      const entry = roomUsageMap.get(pu.subjectId) ?? {
        roomNumber: roomMap.get(pu.subjectId) ?? pu.subjectId,
        usageCount: 0,
        billableDaysCount: 0,
        billedAmount: 0,
        currency: defaultCurrency,
      };
      entry.usageCount += 1;
      roomUsageMap.set(pu.subjectId, entry);
    }

    for (const bd of monthBillableDays) {
      const entry = roomUsageMap.get(bd.subjectId) ?? {
        roomNumber: roomMap.get(bd.subjectId) ?? bd.subjectId,
        usageCount: 0,
        billableDaysCount: 0,
        billedAmount: 0,
        currency: bd.currency || defaultCurrency,
      };

      const bdCurrency = bd.currency || defaultCurrency;
      if (entry.billableDaysCount > 0 && entry.currency !== bdCurrency) {
        throw new BadRequestException(`Phát hiện nhiều loại tiền tệ khác nhau (${entry.currency}, ${bdCurrency}) trong cùng một phòng`);
      }

      entry.currency = bdCurrency;
      entry.billableDaysCount += 1;
      entry.billedAmount += Number(bd.amount ?? 0);
      roomUsageMap.set(bd.subjectId, entry);
    }

    const roomUsageSummary = Array.from(roomUsageMap.values()).filter(
      (r) => r.usageCount > 0 || r.billableDaysCount > 0,
    );

    const billableDaysCount = totalBillableDaysCount;
    const usageCount = platformUsages.length;
    const estimatedFee = billableDaysCount * unitPrice;

    const projectedPeriods = paginatedPeriods.map((p) => attachPeriodProjection(p));

    const reminderData = reminderRaw[0] ?? {
      dueSoonCount: 0,
      overdueCount: 0,
      dueSoonOutstandingAmount: new Prisma.Decimal(0),
      overdueOutstandingAmount: new Prisma.Decimal(0),
      nearestDueAt: null,
    };

    const reminder = {
      dueSoonCount: Number(reminderData.dueSoonCount ?? 0),
      overdueCount: Number(reminderData.overdueCount ?? 0),
      dueSoonOutstandingAmount: new Prisma.Decimal(reminderData.dueSoonOutstandingAmount ?? 0),
      overdueOutstandingAmount: new Prisma.Decimal(reminderData.overdueOutstandingAmount ?? 0),
      nearestDueAt: reminderData.nearestDueAt ? new Date(reminderData.nearestDueAt) : null,
    };

    const periodsPage = {
      page: periodPage,
      limit: periodLimit,
      total: totalPeriodsCount,
      items: projectedPeriods,
    };

    const billableDaysPage = {
      page: billableDayPage,
      limit: billableDayLimit,
      total: totalBillableDaysCount,
      items: mappedBillableDays,
    };

    return {
      hasContract: true,
      contract,
      unitPrice,
      billableDaysCount,
      usageCount,
      estimatedFee,
      billableDays: mappedBillableDays,
      periods: projectedPeriods,
      periodsPage,
      billableDaysPage,
      reminder,
      roomUsageSummary,
      dailySummaries: summaries,
    };
  }
}
