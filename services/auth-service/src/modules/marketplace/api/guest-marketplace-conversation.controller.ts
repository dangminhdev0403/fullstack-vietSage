import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import {
  GuestSessionGuard,
  type RequestWithGuestSession,
} from "../../guest-operations/guest-operations-public";
import { MarketplaceConversationService } from "../application/marketplace-conversation.service";
import {
  listMarketplaceConversationMessagesQuerySchema,
  sendMarketplaceConversationMessageSchema,
} from "../domain/marketplace-conversation.schema";
import { marketplaceOrderIdSchema } from "../domain/marketplace-order.schema";

@UseGuards(GuestSessionGuard)
@Controller("guest/marketplace/orders/:orderId/conversation")
export class GuestMarketplaceConversationController {
  constructor(private readonly service: MarketplaceConversationService) {}

  @Get()
  getConversation(
    @Req() req: RequestWithGuestSession,
    @Param("orderId") orderIdParam: string,
    @Query() query: unknown,
  ) {
    const orderId = parseWithZod(marketplaceOrderIdSchema, orderIdParam);
    const parsedQuery = parseWithZod(
      listMarketplaceConversationMessagesQuerySchema,
      query ?? {},
    );

    return this.service.getConversation(
      {
        hotelId: req.guestSession.hotelId,
        stayId: req.guestSession.stayId,
      },
      orderId,
      parsedQuery,
    );
  }

  @Post("messages")
  sendMessage(
    @Req() req: RequestWithGuestSession,
    @Param("orderId") orderIdParam: string,
    @Body() body: unknown,
  ) {
    const orderId = parseWithZod(marketplaceOrderIdSchema, orderIdParam);
    const input = parseWithZod(sendMarketplaceConversationMessageSchema, body);

    return this.service.sendGuestMessage(
      {
        hotelId: req.guestSession.hotelId,
        stayId: req.guestSession.stayId,
        sessionId: req.guestSession.sessionId,
      },
      orderId,
      input,
    );
  }
}
