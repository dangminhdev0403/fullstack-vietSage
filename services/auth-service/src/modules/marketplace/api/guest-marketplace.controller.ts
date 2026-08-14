import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { I18nService } from "../../../common/i18n/i18n.service";
import {
  GuestSessionGuard,
  type RequestWithGuestSession,
} from "../../guest-operations/guest-operations-public";
import { GuestMarketplaceService } from "../application/guest-marketplace.service";
import {
  addCartItemSchema,
  cartItemIdSchema,
  checkoutCartSchema,
  guestMarketplaceIdSchema,
  guestMarketplaceQuerySchema,
  updateCartItemSchema,
} from "../domain/guest-marketplace.schema";
import { MarketplaceOrderService } from "../application/marketplace-order.service";
import {
  createMarketplaceOrderSchema,
  marketplaceOrderIdSchema,
} from "../domain/marketplace-order.schema";

@UseGuards(GuestSessionGuard)
@Controller("guest/marketplace")
export class GuestMarketplaceController {
  private readonly i18n = new I18nService();

  constructor(
    private readonly service: GuestMarketplaceService,
    private readonly orders: MarketplaceOrderService,
  ) {}

  @Get("categories")
  categories(@Req() req: RequestWithGuestSession) {
    const locale = this.i18n.resolveLocale(req);
    return this.service.categories(req.guestSession.hotelId, locale);
  }

  @Get("services")
  services(@Req() req: RequestWithGuestSession, @Query() query: unknown) {
    const locale = this.i18n.resolveLocale(req);
    return this.service.services(
      req.guestSession.hotelId,
      parseWithZod(guestMarketplaceQuerySchema, query ?? {}),
      locale,
    );
  }

  @Get("services/:serviceId")
  detail(@Req() req: RequestWithGuestSession, @Param("serviceId") id: string) {
    const locale = this.i18n.resolveLocale(req);
    return this.service.detail(
      req.guestSession.hotelId,
      parseWithZod(guestMarketplaceIdSchema, id),
      locale,
    );
  }

  @Get("cart")
  getCart(@Req() req: RequestWithGuestSession) {
    const locale = this.i18n.resolveLocale(req);
    return this.service.getCart(
      {
        hotelId: req.guestSession.hotelId,
        stayId: req.guestSession.stayId,
        sessionId: req.guestSession.sessionId,
      },
      locale,
    );
  }

  @Post("cart/items")
  addCartItem(@Req() req: RequestWithGuestSession, @Body() body: unknown) {
    const locale = this.i18n.resolveLocale(req);
    return this.service.addCartItem(
      {
        hotelId: req.guestSession.hotelId,
        stayId: req.guestSession.stayId,
        sessionId: req.guestSession.sessionId,
      },
      parseWithZod(addCartItemSchema, body),
      locale,
    );
  }

  @Patch("cart/items/:itemId")
  updateCartItem(
    @Req() req: RequestWithGuestSession,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    const locale = this.i18n.resolveLocale(req);
    return this.service.updateCartItem(
      {
        hotelId: req.guestSession.hotelId,
        stayId: req.guestSession.stayId,
        sessionId: req.guestSession.sessionId,
      },
      parseWithZod(cartItemIdSchema, itemId),
      parseWithZod(updateCartItemSchema, body),
      locale,
    );
  }

  @Delete("cart/items/:itemId")
  removeCartItem(@Req() req: RequestWithGuestSession, @Param("itemId") itemId: string) {
    const locale = this.i18n.resolveLocale(req);
    return this.service.removeCartItem(
      {
        hotelId: req.guestSession.hotelId,
        stayId: req.guestSession.stayId,
        sessionId: req.guestSession.sessionId,
      },
      parseWithZod(cartItemIdSchema, itemId),
      locale,
    );
  }

  @Delete("cart")
  clearCart(@Req() req: RequestWithGuestSession) {
    return this.service.clearCart({
      hotelId: req.guestSession.hotelId,
      stayId: req.guestSession.stayId,
      sessionId: req.guestSession.sessionId,
    });
  }

  @Post("cart/checkout")
  checkoutCart(@Req() req: RequestWithGuestSession, @Body() body: unknown) {
    return this.orders.checkoutGuestCart(
      {
        hotelId: req.guestSession.hotelId,
        stayId: req.guestSession.stayId,
        sessionId: req.guestSession.sessionId,
      },
      parseWithZod(checkoutCartSchema, body),
    );
  }

  @Post("checkout")
  checkoutDirect(@Req() req: RequestWithGuestSession, @Body() body: unknown) {
    return this.orders.checkoutGuestCart(
      {
        hotelId: req.guestSession.hotelId,
        stayId: req.guestSession.stayId,
        sessionId: req.guestSession.sessionId,
      },
      parseWithZod(checkoutCartSchema, body),
    );
  }

  @Post("orders")
  createOrder(@Req() req: RequestWithGuestSession, @Body() body: unknown) {
    return this.orders.createGuestOrder(
      {
        hotelId: req.guestSession.hotelId,
        stayId: req.guestSession.stayId,
        sessionId: req.guestSession.sessionId,
      },
      parseWithZod(createMarketplaceOrderSchema, body),
    );
  }

  @Get("orders")
  ordersList(@Req() req: RequestWithGuestSession) {
    return this.orders.listGuestOrders(req.guestSession.stayId, this.i18n.resolveLocale(req));
  }

  @Get("orders/:orderId")
  order(@Req() req: RequestWithGuestSession, @Param("orderId") id: string) {
    return this.orders.guestOrder(
      req.guestSession.stayId,
      parseWithZod(marketplaceOrderIdSchema, id),
    );
  }
}
