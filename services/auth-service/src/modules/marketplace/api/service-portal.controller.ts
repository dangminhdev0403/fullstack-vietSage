import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { ServicePortalService } from "../application/service-portal.service";
import {
  marketplaceAvailabilitySchema,
  marketplaceServiceBodySchema,
  marketplaceServiceUpdateSchema,
  servicePortalIdSchema,
  serviceProfileBodySchema,
} from "../domain/service-portal.schema";
import { MarketplaceOrderService } from "../application/marketplace-order.service";
import { ServiceItemImportService } from "../application/service-item-import.service";
import {
  marketplaceOrderIdSchema,
  marketplaceTransitionSchema,
  partnerSettlementQuerySchema,
} from "../domain/marketplace-order.schema";

import { RequestRealtimeTicketService } from "../../request-realtime/application/request-realtime-ticket.service";

@Controller("service-portal")
export class ServicePortalController {
  constructor(
    private readonly service: ServicePortalService,
    private readonly orders: MarketplaceOrderService,
    private readonly imports: ServiceItemImportService,
    private readonly tickets: RequestRealtimeTicketService,
  ) {}

  @ApiDescript("Xem hồ sơ Service Tenant")
  @RequirePermission("service.marketplace.view")
  @Get("profile")
  profile(@Req() req: RequestWithRequiredUser) {
    return this.service.profile(req.user.userId);
  }

  @ApiDescript("Cập nhật hồ sơ Service Tenant")
  @RequirePermission("service.marketplace.manage")
  @Patch("profile")
  updateProfile(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    return this.service.updateProfile(
      req.user.userId,
      parseWithZod(serviceProfileBodySchema, body),
    );
  }

  @ApiDescript("Xem dịch vụ Service Tenant")
  @RequirePermission("service.marketplace.view")
  @Get("services")
  services(@Req() req: RequestWithRequiredUser) {
    return this.service.services(req.user.userId);
  }

  @ApiDescript("Tạo dịch vụ Service Tenant")
  @RequirePermission("service.marketplace.manage")
  @Post("services")
  create(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    return this.service.createService(
      req.user.userId,
      parseWithZod(marketplaceServiceBodySchema, body),
    );
  }

  @ApiDescript("Cập nhật dịch vụ Service Tenant")
  @RequirePermission("service.marketplace.manage")
  @Patch("services/:serviceId")
  update(
    @Req() req: RequestWithRequiredUser,
    @Param("serviceId") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateService(
      req.user.userId,
      parseWithZod(servicePortalIdSchema, id),
      parseWithZod(marketplaceServiceUpdateSchema, body),
    );
  }

  @ApiDescript("Cập nhật khả năng phục vụ")
  @RequirePermission("service.marketplace.manage")
  @Patch("services/:serviceId/availability")
  availability(
    @Req() req: RequestWithRequiredUser,
    @Param("serviceId") id: string,
    @Body() body: unknown,
  ) {
    return this.service.updateAvailability(
      req.user.userId,
      parseWithZod(servicePortalIdSchema, id),
      parseWithZod(marketplaceAvailabilitySchema, body),
    );
  }

  @ApiDescript("Tải mẫu CSV dịch vụ")
  @RequirePermission("service.marketplace.view")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="service_items_template.csv"')
  @Get("services/import/template")
  template(@Res() response: Response) {
    response.type("text/csv; charset=utf-8").send(this.imports.template());
  }

  @ApiDescript("Xuất danh sách dịch vụ CSV")
  @RequirePermission("service.marketplace.view")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="service_items.csv"')
  async export(@Req() req: RequestWithRequiredUser, @Res() response: Response) {
    response.type("text/csv; charset=utf-8").send(await this.imports.export(req.user.userId));
  }

  @ApiDescript("Xem trước nhập dịch vụ CSV")
  @RequirePermission("service.marketplace.manage")
  @Post("services/import/preview")
  previewImport(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    const input = body as { csv?: unknown; fileName?: unknown };
    if (typeof input.csv !== "string" || !input.csv.trim())
      throw new BadRequestException("CSV content is required");
    return this.imports.preview(
      req.user.userId,
      input.csv,
      typeof input.fileName === "string" ? input.fileName : "service-items.csv",
    );
  }

  @ApiDescript("Xác nhận nhập dịch vụ CSV")
  @RequirePermission("service.marketplace.manage")
  @Post("services/import/commit")
  commitImport(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    const input = body as { csv?: unknown; fileName?: unknown; previewToken?: unknown };
    if (typeof input.csv !== "string" || typeof input.previewToken !== "string")
      throw new BadRequestException("CSV content and previewToken are required");
    return this.imports.commit(
      req.user.userId,
      input.csv,
      input.previewToken,
      typeof input.fileName === "string" ? input.fileName : "service-items.csv",
    );
  }

  @ApiDescript("Xem đơn Service Tenant")
  @RequirePermission("service.marketplace.view")
  @Get("orders")
  orderList(@Req() req: RequestWithRequiredUser) {
    return this.orders.listServiceOrders(req.user.userId);
  }

  @ApiDescript("Xem chi tiết đơn Service Tenant")
  @RequirePermission("service.marketplace.view")
  @Get("orders/:orderId")
  order(@Req() req: RequestWithRequiredUser, @Param("orderId") id: string) {
    return this.orders.serviceOrder(req.user.userId, parseWithZod(marketplaceOrderIdSchema, id));
  }

  @ApiDescript("Chuyển trạng thái đơn Marketplace")
  @RequirePermission("service.marketplace.manage")
  @Post("orders/:orderId/transitions")
  transition(
    @Req() req: RequestWithRequiredUser,
    @Param("orderId") id: string,
    @Body() body: unknown,
  ) {
    return this.orders.transitionServiceOrder(
      req.user.userId,
      parseWithZod(marketplaceOrderIdSchema, id),
      parseWithZod(marketplaceTransitionSchema, body),
    );
  }

  @ApiDescript("Xác minh Service Voucher / Mã dịch vụ")
  @RequirePermission("service.marketplace.view")
  @Post("vouchers/verify")
  verifyVoucher(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    const input = body as { code?: unknown };
    if (typeof input.code !== "string" || !input.code.trim()) {
      throw new BadRequestException("Voucher code/number is required");
    }
    return this.orders.verifyVoucher(req.user.userId, input.code.trim());
  }

  @ApiDescript("Xác nhận sử dụng Service Voucher (Redeem)")
  @RequirePermission("service.marketplace.manage")
  @Post("vouchers/redeem")
  redeemVoucher(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    const input = body as { code?: unknown };
    if (typeof input.code !== "string" || !input.code.trim()) {
      throw new BadRequestException("Voucher code/number is required");
    }
    return this.orders.redeemVoucher(req.user.userId, input.code.trim());
  }

  @ApiDescript("Xem tổng quan tài chính đối tác dịch vụ")
  @RequirePermission("service.marketplace.view")
  @Get("financial-summary")
  financialSummary(@Req() req: RequestWithRequiredUser) {
    return this.orders.getPartnerFinancialSummary(req.user.userId);
  }

  @ApiDescript("Xem danh sách quyết toán của đối tác dịch vụ")
  @RequirePermission("service.marketplace.view")
  @Get("settlements")
  settlements(@Req() req: RequestWithRequiredUser, @Query() query: unknown) {
    const parsed = parseWithZod(partnerSettlementQuerySchema, query ?? {});
    return this.orders.listPartnerSettlements(req.user.userId, parsed.status);
  }

  @ApiDescript("Tạo ticket kết nối realtime cho Service Tenant")
  @RequirePermission("service.marketplace.view")
  @Post("request-realtime-ticket")
  issueTicket(@Req() req: RequestWithRequiredUser) {
    return this.tickets.issueServiceTenantTicket(req.user.userId);
  }
}
