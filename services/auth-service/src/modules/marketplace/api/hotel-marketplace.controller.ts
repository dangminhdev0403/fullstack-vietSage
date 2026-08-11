import { Body, Controller, Delete, Get, Param, Put, Query, Req } from "@nestjs/common";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { HotelAccessService } from "../../property/property-public";
import { MarketplaceOrderService } from "../application/marketplace-order.service";
import { MarketplaceAdminService } from "../application/marketplace-admin.service";
import { hotelServiceLinkBodySchema } from "../domain/marketplace-admin.schema";
import {
  marketplaceOrderIdSchema,
  marketplaceRevenueQuerySchema,
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
  @RequirePermission("hotel.local-partners.view")
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
}
