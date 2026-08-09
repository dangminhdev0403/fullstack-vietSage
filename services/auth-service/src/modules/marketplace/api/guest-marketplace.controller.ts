import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { GuestSessionGuard, type RequestWithGuestSession } from "../../guest-operations/guest-operations-public";
import { GuestMarketplaceService } from "../application/guest-marketplace.service";
import { guestMarketplaceIdSchema, guestMarketplaceQuerySchema } from "../domain/guest-marketplace.schema";
import { MarketplaceOrderService } from "../application/marketplace-order.service";
import { createMarketplaceOrderSchema, marketplaceOrderIdSchema } from "../domain/marketplace-order.schema";

@UseGuards(GuestSessionGuard)
@Controller("guest/marketplace")
export class GuestMarketplaceController {
  constructor(private readonly service: GuestMarketplaceService, private readonly orders: MarketplaceOrderService) {}

  @Get("categories") categories(@Req() req: RequestWithGuestSession) { return this.service.categories(req.guestSession.hotelId); }
  @Get("services") services(@Req() req: RequestWithGuestSession, @Query() query: unknown) { return this.service.services(req.guestSession.hotelId, parseWithZod(guestMarketplaceQuerySchema, query ?? {})); }
  @Get("services/:serviceId") detail(@Req() req: RequestWithGuestSession, @Param("serviceId") id: string) { return this.service.detail(req.guestSession.hotelId, parseWithZod(guestMarketplaceIdSchema, id)); }
  @Post("orders") createOrder(@Req() req: RequestWithGuestSession, @Body() body: unknown) { return this.orders.createGuestOrder({ hotelId: req.guestSession.hotelId, stayId: req.guestSession.stayId }, parseWithZod(createMarketplaceOrderSchema, body)); }
  @Get("orders") ordersList(@Req() req: RequestWithGuestSession) { return this.orders.listGuestOrders(req.guestSession.stayId); }
  @Get("orders/:orderId") order(@Req() req: RequestWithGuestSession, @Param("orderId") id: string) { return this.orders.guestOrder(req.guestSession.stayId, parseWithZod(marketplaceOrderIdSchema, id)); }
}
