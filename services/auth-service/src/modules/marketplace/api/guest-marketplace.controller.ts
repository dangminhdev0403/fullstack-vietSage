import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { GuestSessionGuard, type RequestWithGuestSession } from "../../guest-operations/guest-operations-public";
import { GuestMarketplaceService } from "../application/guest-marketplace.service";
import { guestMarketplaceIdSchema, guestMarketplaceQuerySchema } from "../domain/guest-marketplace.schema";

@UseGuards(GuestSessionGuard)
@Controller("guest/marketplace")
export class GuestMarketplaceController {
  constructor(private readonly service: GuestMarketplaceService) {}

  @Get("categories") categories(@Req() req: RequestWithGuestSession) { return this.service.categories(req.guestSession.hotelId); }
  @Get("services") services(@Req() req: RequestWithGuestSession, @Query() query: unknown) { return this.service.services(req.guestSession.hotelId, parseWithZod(guestMarketplaceQuerySchema, query ?? {})); }
  @Get("services/:serviceId") detail(@Req() req: RequestWithGuestSession, @Param("serviceId") id: string) { return this.service.detail(req.guestSession.hotelId, parseWithZod(guestMarketplaceIdSchema, id)); }
}
