import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { ServicePortalService } from "../application/service-portal.service";
import { marketplaceAvailabilitySchema, marketplaceServiceBodySchema, marketplaceServiceUpdateSchema, servicePortalIdSchema, serviceProfileBodySchema } from "../domain/service-portal.schema";

@Controller("service-portal")
export class ServicePortalController {
  constructor(private readonly service: ServicePortalService) {}

  @RequirePermission("service.marketplace.view") @Get("profile")
  profile(@Req() req: RequestWithRequiredUser) { return this.service.profile(req.user.userId); }

  @RequirePermission("service.marketplace.manage") @Patch("profile")
  updateProfile(@Req() req: RequestWithRequiredUser, @Body() body: unknown) { return this.service.updateProfile(req.user.userId, parseWithZod(serviceProfileBodySchema, body)); }

  @RequirePermission("service.marketplace.view") @Get("categories")
  categories() { return this.service.categories(); }

  @RequirePermission("service.marketplace.view") @Get("services")
  services(@Req() req: RequestWithRequiredUser) { return this.service.services(req.user.userId); }

  @RequirePermission("service.marketplace.manage") @Post("services")
  create(@Req() req: RequestWithRequiredUser, @Body() body: unknown) { return this.service.createService(req.user.userId, parseWithZod(marketplaceServiceBodySchema, body)); }

  @RequirePermission("service.marketplace.manage") @Patch("services/:serviceId")
  update(@Req() req: RequestWithRequiredUser, @Param("serviceId") id: string, @Body() body: unknown) { return this.service.updateService(req.user.userId, parseWithZod(servicePortalIdSchema, id), parseWithZod(marketplaceServiceUpdateSchema, body)); }

  @RequirePermission("service.marketplace.manage") @Patch("services/:serviceId/availability")
  availability(@Req() req: RequestWithRequiredUser, @Param("serviceId") id: string, @Body() body: unknown) { return this.service.updateAvailability(req.user.userId, parseWithZod(servicePortalIdSchema, id), parseWithZod(marketplaceAvailabilitySchema, body)); }
}
