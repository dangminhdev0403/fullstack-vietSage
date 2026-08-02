import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PlatformBillingContractStatus } from "@prisma/client";
import { PlatformBillingService } from "../application/platform-billing.service";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import type { RequestWithAuthenticatedUser } from "../../../shared/security";

export class FinalizePeriodDto {
  periodStart!: string;
  periodEnd!: string;
}

export class RecordSettlementDto {
  amount!: number;
  method?: string;
  reference?: string;
  idempotencyKey!: string;
}

export class CreateAdjustmentDto {
  billableDayId?: string;
  periodId?: string;
  amount!: number;
  reasonCode!: string;
  note?: string;
  idempotencyKey!: string;
}

export class CreateContractDto {
  hotelId!: string;
  starTierSnapshot?: number;
  roomDayUnitPrice!: number;
  currency?: string;
  billingStartedAt!: string;
}

export class AddRevisionDto {
  effectiveFrom!: string;
  starTierSnapshot?: number;
  roomDayUnitPrice!: number;
  currency?: string;
}

export class UpdateContractStatusDto {
  status!: PlatformBillingContractStatus;
}

@ApiTags("platform-billing")
@ApiBearerAuth()
@Controller("platform-billing")
export class PlatformBillingController {
  constructor(private readonly platformBillingService: PlatformBillingService) {}

  @Get("dashboard/summary")
  @RequirePermission("platform.billing.view")
  @ApiOperation({ summary: "Get platform billing dashboard summary" })
  async getDashboardSummary() {
    return this.platformBillingService.getDashboardSummary();
  }

  @Get("contracts")
  @RequirePermission("platform.billing.view")
  @ApiOperation({ summary: "List platform billing contracts for admin" })
  async listContracts(
    @Query("status") status?: PlatformBillingContractStatus,
    @Query("search") search?: string,
  ) {
    return this.platformBillingService.listContracts({ status, search });
  }

  @Post("contracts")
  @RequirePermission("platform.billing.manage")
  @ApiOperation({ summary: "Onboard new platform billing contract for hotel" })
  async createContract(
    @Req() request: RequestWithAuthenticatedUser,
    @Body() dto: CreateContractDto,
  ) {
    return this.platformBillingService.createContract(dto, request.user?.userId);
  }

  @Get("contracts/:contractId/periods")
  @RequirePermission("platform.billing.view")
  @ApiOperation({ summary: "List billing periods for contract" })
  async listPeriods(@Param("contractId") contractId: string) {
    return this.platformBillingService.listPeriods(contractId);
  }

  @Get("periods/:periodId")
  @RequirePermission("platform.billing.view")
  @ApiOperation({ summary: "Get period detail with adjustments and settlements" })
  async getPeriod(@Param("periodId") periodId: string) {
    return this.platformBillingService.getPeriod(periodId);
  }

  @Post("contracts/:contractId/revisions")
  @RequirePermission("platform.billing.manage")
  @ApiOperation({ summary: "Add contract price revision" })
  async addContractRevision(
    @Req() request: RequestWithAuthenticatedUser,
    @Param("contractId") contractId: string,
    @Body() dto: AddRevisionDto,
  ) {
    return this.platformBillingService.addContractRevision(contractId, dto, request.user?.userId);
  }

  @Patch("contracts/:contractId/status")
  @RequirePermission("platform.billing.manage")
  @ApiOperation({ summary: "Update contract status" })
  async updateContractStatus(
    @Param("contractId") contractId: string,
    @Body() dto: UpdateContractStatusDto,
  ) {
    return this.platformBillingService.updateContractStatus(contractId, dto.status);
  }

  @Post("contracts/:contractId/finalize")
  @RequirePermission("platform.billing.manage")
  @ApiOperation({ summary: "Finalize period snapshot idempotently" })
  async finalizePeriod(
    @Req() request: RequestWithAuthenticatedUser,
    @Param("contractId") contractId: string,
    @Body() dto: FinalizePeriodDto,
  ) {
    return this.platformBillingService.finalizePeriod(
      contractId,
      dto.periodStart,
      dto.periodEnd,
      request.user?.userId,
    );
  }

  @Post("periods/:periodId/settlements")
  @RequirePermission("platform.billing.manage")
  @ApiOperation({ summary: "Record settlement for finalized period" })
  async recordSettlement(
    @Req() request: RequestWithAuthenticatedUser,
    @Param("periodId") periodId: string,
    @Body() dto: RecordSettlementDto,
  ) {
    return this.platformBillingService.recordSettlement(periodId, {
      ...dto,
      actorUserId: request.user?.userId,
    });
  }

  @Post("contracts/:contractId/adjustments")
  @RequirePermission("platform.billing.manage")
  @ApiOperation({ summary: "Create append-only adjustment record" })
  async createAdjustment(
    @Req() request: RequestWithAuthenticatedUser,
    @Param("contractId") contractId: string,
    @Body() dto: CreateAdjustmentDto,
  ) {
    return this.platformBillingService.createAdjustment(contractId, {
      ...dto,
      actorUserId: request.user?.userId,
    });
  }

  @Get("owner/analytics/:hotelId")
  @RequirePermission("hotel.revenue-protection.view")
  @ApiOperation({ summary: "Get revenue protection analytics for hotel owner" })
  async getOwnerAnalytics(
    @Param("hotelId") hotelId: string,
    @Query("monthDate") monthDate?: string,
  ) {
    return this.platformBillingService.getOwnerAnalytics(hotelId, monthDate);
  }
}
