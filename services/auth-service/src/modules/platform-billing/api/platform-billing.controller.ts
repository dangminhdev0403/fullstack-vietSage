import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PlatformBillingContractStatus } from "@prisma/client";
import { PlatformBillingService } from "../application/platform-billing.service";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import type { RequestWithAuthenticatedUser } from "../../../shared/security";
import {
  addRevisionBodySchema,
  contractIdParamSchema,
  createAdjustmentBodySchema,
  createContractBodySchema,
  dashboardSummaryQuerySchema,
  finalizePeriodBodySchema,
  listContractsQuerySchema,
  ownerAnalyticsQuerySchema,
  periodIdParamSchema,
  recordSettlementBodySchema,
  updateContractStatusBodySchema,
} from "../domain/schemas/platform-billing.schema";

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
  @ApiDescript("Xem tổng quan dashboard billing nền tảng")
  @ApiOperation({ summary: "Get platform billing dashboard summary" })
  async getDashboardSummary(@Query() query: unknown) {
    parseWithZod(dashboardSummaryQuerySchema, query);
    return this.platformBillingService.getDashboardSummary();
  }

  @Get("contracts")
  @RequirePermission("platform.billing.view")
  @ApiDescript("Xem danh sách hợp đồng billing khách sạn")
  @ApiOperation({ summary: "List platform billing contracts for admin" })
  async listContracts(@Query() query: unknown) {
    const parsed = parseWithZod(listContractsQuerySchema, query);
    return this.platformBillingService.listContracts(parsed);
  }

  @Post("contracts")
  @RequirePermission("platform.billing.manage")
  @ApiDescript("Tạo hợp đồng billing mới cho khách sạn")
  @ApiOperation({ summary: "Onboard new platform billing contract for hotel" })
  async createContract(@Req() request: RequestWithAuthenticatedUser, @Body() body: unknown) {
    const dto = parseWithZod(createContractBodySchema, body);
    return this.platformBillingService.createContract(dto, request.user?.userId);
  }

  @Get("contracts/:contractId/periods")
  @RequirePermission("platform.billing.view")
  @ApiDescript("Xem danh sách các kỳ billing theo hợp đồng")
  @ApiOperation({ summary: "List billing periods for contract" })
  async listPeriods(@Param("contractId") contractIdParam: string) {
    const contractId = parseWithZod(contractIdParamSchema, contractIdParam);
    return this.platformBillingService.listPeriods(contractId);
  }

  @Get("periods/:periodId")
  @RequirePermission("platform.billing.view")
  @ApiDescript("Xem chi tiết kỳ billing bao gồm điều chỉnh và thanh toán")
  @ApiOperation({ summary: "Get period detail with adjustments and settlements" })
  async getPeriod(@Param("periodId") periodIdParam: string) {
    const periodId = parseWithZod(periodIdParamSchema, periodIdParam);
    return this.platformBillingService.getPeriod(periodId);
  }

  @Post("contracts/:contractId/revisions")
  @RequirePermission("platform.billing.manage")
  @ApiDescript("Thêm điều chỉnh giá hợp đồng billing")
  @ApiOperation({ summary: "Add contract price revision" })
  async addContractRevision(
    @Req() request: RequestWithAuthenticatedUser,
    @Param("contractId") contractIdParam: string,
    @Body() body: unknown,
  ) {
    const contractId = parseWithZod(contractIdParamSchema, contractIdParam);
    const dto = parseWithZod(addRevisionBodySchema, body);
    return this.platformBillingService.addContractRevision(contractId, dto, request.user?.userId);
  }

  @Patch("contracts/:contractId/status")
  @RequirePermission("platform.billing.manage")
  @ApiDescript("Cập nhật trạng thái hợp đồng billing")
  @ApiOperation({ summary: "Update contract status" })
  async updateContractStatus(@Param("contractId") contractIdParam: string, @Body() body: unknown) {
    const contractId = parseWithZod(contractIdParamSchema, contractIdParam);
    const dto = parseWithZod(updateContractStatusBodySchema, body);
    return this.platformBillingService.updateContractStatus(contractId, dto.status);
  }

  @Post("contracts/:contractId/finalize")
  @RequirePermission("platform.billing.manage")
  @ApiDescript("Chốt sổ kỳ billing (finalize period)")
  @ApiOperation({ summary: "Finalize period snapshot idempotently" })
  async finalizePeriod(
    @Req() request: RequestWithAuthenticatedUser,
    @Param("contractId") contractIdParam: string,
    @Body() body: unknown,
  ) {
    const contractId = parseWithZod(contractIdParamSchema, contractIdParam);
    const dto = parseWithZod(finalizePeriodBodySchema, body);
    return this.platformBillingService.finalizePeriod(
      contractId,
      dto.periodStart,
      dto.periodEnd,
      request.user?.userId,
    );
  }

  @Post("periods/:periodId/settlement")
  @Post("periods/:periodId/settlements")
  @RequirePermission("platform.billing.manage")
  @ApiDescript("Ghi nhận thanh toán cho kỳ billing đã chốt")
  @ApiOperation({ summary: "Record settlement for finalized period" })
  async recordSettlement(
    @Req() request: RequestWithAuthenticatedUser,
    @Param("periodId") periodIdParam: string,
    @Body() body: unknown,
  ) {
    const periodId = parseWithZod(periodIdParamSchema, periodIdParam);
    const dto = parseWithZod(recordSettlementBodySchema, body);
    return this.platformBillingService.recordSettlement(periodId, {
      ...dto,
      actorUserId: request.user?.userId,
    });
  }

  @Post("contracts/:contractId/adjustments")
  @RequirePermission("platform.billing.manage")
  @ApiDescript("Tạo khoản điều chỉnh billing (adjustment)")
  @ApiOperation({ summary: "Create append-only adjustment record" })
  async createAdjustment(
    @Req() request: RequestWithAuthenticatedUser,
    @Param("contractId") contractIdParam: string,
    @Body() body: unknown,
  ) {
    const contractId = parseWithZod(contractIdParamSchema, contractIdParam);
    const dto = parseWithZod(createAdjustmentBodySchema, body);
    return this.platformBillingService.createAdjustment(contractId, {
      ...dto,
      actorUserId: request.user?.userId,
    });
  }

  @Get("owner/analytics/:hotelId")
  @RequirePermission("hotel.revenue-protection.view")
  @ApiDescript("Xem phân tích đối soát billing cho chủ khách sạn")
  @ApiOperation({ summary: "Get revenue protection analytics for hotel owner" })
  async getOwnerAnalytics(
    @Req() request: RequestWithAuthenticatedUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() rawQuery: unknown,
  ) {
    const hotelId = parseWithZod(contractIdParamSchema, hotelIdParam);
    const query = parseWithZod(ownerAnalyticsQuerySchema, rawQuery ?? {});
    const actorUserId = request.user?.userId;
    const actorRoleId = request.user?.roleId;

    if (!actorUserId || !actorRoleId) {
      throw new BadRequestException("Thiếu thông tin người thực hiện yêu cầu");
    }

    return this.platformBillingService.getOwnerAnalytics(hotelId, query, {
      actorUserId,
      actorRoleId,
    });
  }
}
