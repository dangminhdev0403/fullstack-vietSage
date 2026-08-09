import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { HotelAccessService } from "../../property/property-public";
import { MarketplaceOrderService } from "../application/marketplace-order.service";
import { marketplaceOrderIdSchema, marketplaceRevenueQuerySchema } from "../domain/marketplace-order.schema";

@Controller("hotels/:hotelId/marketplace")
export class HotelMarketplaceController {
  constructor(private readonly orders: MarketplaceOrderService, private readonly access: HotelAccessService) {}

  private async hotel(req: RequestWithRequiredUser, hotelId: string) {
    const id = parseWithZod(marketplaceOrderIdSchema, hotelId);
    await this.access.assertHotelAccess(req.user.userId, req.user.roleId, id);
    return id;
  }

  @RequirePermission("hotel.marketplace.view") @Get("orders")
  async list(@Req() req: RequestWithRequiredUser, @Param("hotelId") id: string) { return this.orders.listHotelOrders(await this.hotel(req, id)); }

  @RequirePermission("hotel.marketplace.view") @Get("orders/:orderId")
  async order(@Req() req: RequestWithRequiredUser, @Param("hotelId") id: string, @Param("orderId") orderId: string) { return this.orders.hotelOrder(await this.hotel(req, id), parseWithZod(marketplaceOrderIdSchema, orderId)); }

  @RequirePermission("hotel.marketplace.revenue.view") @Get("revenue")
  async revenue(@Req() req: RequestWithRequiredUser, @Param("hotelId") id: string, @Query() query: unknown) {
    const hotelId = await this.hotel(req, id);
    const parsed = parseWithZod(marketplaceRevenueQuerySchema, query ?? {});
    return this.orders.hotelRevenue(hotelId, parsed.from, parsed.to, parsed.serviceTenantId);
  }
}
