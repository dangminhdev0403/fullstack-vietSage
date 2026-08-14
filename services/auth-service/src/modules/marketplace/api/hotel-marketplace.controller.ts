import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { HotelAccessService } from "../../property/property-public";
import { MarketplaceOrderService } from "../application/marketplace-order.service";
import { MarketplaceAdminService } from "../application/marketplace-admin.service";
import { hotelServiceLinkBodySchema } from "../domain/marketplace-admin.schema";
import {
  batchSettleSchema,
  marketplaceOrderIdSchema,
  marketplaceRevenueQuerySchema,
  partnerSettlementQuerySchema,
  settlementIdSchema,
} from "../domain/marketplace-order.schema";

@Controller("hotels/:hotelId/marketplace")
export class HotelMarketplaceController {
  constructor(
    private readonly orders: MarketplaceOrderService,
    private readonly access: HotelAccessService,
    private readonly marketplace: MarketplaceAdminService,
  ) {}

  private async hotel(req: RequestWithRequiredUser, hotelId: string) {
    const id = parseWithZod(marketplaceOrderIdSchema, hotelId);
    await this.access.assertHotelAccess(req.user.userId, req.user.roleId, id);
    return id;
  }

  @ApiDescript("Xem đối tác dịch vụ gần khách sạn")
  @RequirePermission("hotel.local-partners.view")
  @Get("providers")
  async providers(@Req() req: RequestWithRequiredUser, @Param("hotelId") id: string) {
    return this.marketplace.listNearbyServiceTenants(await this.hotel(req, id));
  }

  @ApiDescript("Liên kết đối tác dịch vụ với khách sạn")
  @RequirePermission("hotel.local-partners.manage")
  @Put("providers/:serviceTenantId")
  async linkProvider(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Param("serviceTenantId") serviceTenantId: string,
    @Body() body: unknown,
  ) {
    return this.marketplace.setNearbyHotelLink(
      req.user.userId,
      await this.hotel(req, id),
      parseWithZod(marketplaceOrderIdSchema, serviceTenantId),
      parseWithZod(hotelServiceLinkBodySchema, body),
    );
  }

  @ApiDescript("Ngắt liên kết đối tác dịch vụ khỏi khách sạn")
  @RequirePermission("hotel.local-partners.manage")
  @Delete("providers/:serviceTenantId")
  async unlinkProvider(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Param("serviceTenantId") serviceTenantId: string,
  ) {
    return this.marketplace.disableHotelLink(
      req.user.userId,
      await this.hotel(req, id),
      parseWithZod(marketplaceOrderIdSchema, serviceTenantId),
    );
  }

  @ApiDescript("Xem đơn Marketplace của khách sạn")
  @RequirePermission("hotel.requests.view")
  @Get("orders")
  async list(@Req() req: RequestWithRequiredUser, @Param("hotelId") id: string) {
    return this.orders.listHotelOrders(await this.hotel(req, id));
  }

  @ApiDescript("Xem chi tiết đơn Marketplace của khách sạn")
  @RequirePermission("hotel.marketplace.view")
  @Get("orders/:orderId")
  async order(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Param("orderId") orderId: string,
  ) {
    return this.orders.hotelOrder(
      await this.hotel(req, id),
      parseWithZod(marketplaceOrderIdSchema, orderId),
    );
  }

  @ApiDescript("Tiếp nhận đơn Marketplace (dành cho lễ tân khách sạn)")
  @RequirePermission("hotel.requests.view")
  @Post("orders/:orderId/acknowledge")
  async acknowledge(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Param("orderId") orderId: string,
  ) {
    const hotelId = await this.hotel(req, id);
    const validOrderId = parseWithZod(marketplaceOrderIdSchema, orderId);
    return this.orders.acknowledgeHotelOrder(req.user.userId, hotelId, validOrderId);
  }

  @ApiDescript("Cấp phiếu dịch vụ (Service Voucher) cho khách lưu trú")
  @RequirePermission("hotel.requests.view")
  @Post("orders/:orderId/issue-voucher")
  async issueVoucher(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Param("orderId") orderId: string,
  ) {
    const hotelId = await this.hotel(req, id);
    const validOrderId = parseWithZod(marketplaceOrderIdSchema, orderId);
    return this.orders.issueServiceVoucher(req.user.userId, hotelId, validOrderId);
  }

  @ApiDescript("Hủy đơn dịch vụ ngoài")
  @RequirePermission("hotel.requests.view")
  @Post("orders/:orderId/cancel")
  async cancel(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Param("orderId") orderId: string,
  ) {
    const hotelId = await this.hotel(req, id);
    const validOrderId = parseWithZod(marketplaceOrderIdSchema, orderId);
    return this.orders.cancelHotelOrder(req.user.userId, hotelId, validOrderId);
  }

  @ApiDescript("Hoàn thành đơn dịch vụ ngoài (dành cho lễ tân khách sạn)")
  @RequirePermission("hotel.requests.view")
  @Post("orders/:orderId/complete")
  async complete(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Param("orderId") orderId: string,
  ) {
    const hotelId = await this.hotel(req, id);
    const validOrderId = parseWithZod(marketplaceOrderIdSchema, orderId);
    return this.orders.completeHotelOrder(req.user.userId, hotelId, validOrderId);
  }

  @ApiDescript("Xem doanh thu Marketplace của khách sạn")
  @RequirePermission("hotel.marketplace.revenue.view")
  @Get("revenue")
  async revenue(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Query() query: unknown,
  ) {
    const hotelId = await this.hotel(req, id);
    const parsed = parseWithZod(marketplaceRevenueQuerySchema, query ?? {});
    return this.orders.hotelRevenue(hotelId, parsed.from, parsed.to, parsed.serviceTenantId);
  }

  @ApiDescript("Xem danh sách quyết toán công nợ đối tác dịch vụ ngoài")
  @RequirePermission("hotel.marketplace.view")
  @Get("settlements")
  async settlements(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Query() query: unknown,
  ) {
    const hotelId = await this.hotel(req, id);
    const parsed = parseWithZod(partnerSettlementQuerySchema, query ?? {});
    return this.orders.listHotelPartnerSettlements(hotelId, parsed);
  }

  @ApiDescript("Xác nhận quyết toán đơn dịch vụ ngoài cho đối tác")
  @RequirePermission("hotel.local-partners.manage")
  @Post("settlements/:settlementId/settle")
  async settle(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Param("settlementId") settlementId: string,
  ) {
    const hotelId = await this.hotel(req, id);
    const validSettlementId = parseWithZod(settlementIdSchema, settlementId);
    return this.orders.settlePartnerOrder(req.user.userId, hotelId, validSettlementId);
  }

  @ApiDescript("Xác nhận quyết toán hàng loạt đơn dịch vụ ngoài cho đối tác")
  @RequirePermission("hotel.local-partners.manage")
  @Post("settlements/settle-batch")
  async settleBatch(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") id: string,
    @Body() body: unknown,
  ) {
    const hotelId = await this.hotel(req, id);
    const parsed = parseWithZod(batchSettleSchema, body);
    return this.orders.settlePartnerOrdersBatch(req.user.userId, hotelId, parsed.settlementIds);
  }
}
