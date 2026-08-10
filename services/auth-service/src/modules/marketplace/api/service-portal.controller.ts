import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { ServicePortalService } from "../application/service-portal.service";
import { marketplaceAvailabilitySchema, marketplaceServiceBodySchema, marketplaceServiceUpdateSchema, servicePortalIdSchema, serviceProfileBodySchema } from "../domain/service-portal.schema";
import { MarketplaceOrderService } from "../application/marketplace-order.service";
import { marketplaceOrderIdSchema, marketplaceTransitionSchema } from "../domain/marketplace-order.schema";

@Controller("service-portal")
export class ServicePortalController {
  constructor(private readonly service: ServicePortalService, private readonly orders: MarketplaceOrderService) {}

  @ApiDescript("Xem hồ sơ Service Tenant")
  @RequirePermission("service.marketplace.view") @Get("profile")
  profile(@Req() req: RequestWithRequiredUser) { return this.service.profile(req.user.userId); }

  @ApiDescript("Cập nhật hồ sơ Service Tenant")
  @RequirePermission("service.marketplace.manage") @Patch("profile")
  updateProfile(@Req() req: RequestWithRequiredUser, @Body() body: unknown) { return this.service.updateProfile(req.user.userId, parseWithZod(serviceProfileBodySchema, body)); }

  @ApiDescript("Xem danh mục Service Marketplace")
  @RequirePermission("service.marketplace.view") @Get("categories")
  categories() { return this.service.categories(); }

  @ApiDescript("Xem dịch vụ Service Tenant")
  @RequirePermission("service.marketplace.view") @Get("services")
  services(@Req() req: RequestWithRequiredUser) { return this.service.services(req.user.userId); }

  @ApiDescript("Tạo dịch vụ Service Tenant")
  @RequirePermission("service.marketplace.manage") @Post("services")
  create(@Req() req: RequestWithRequiredUser, @Body() body: unknown) { return this.service.createService(req.user.userId, parseWithZod(marketplaceServiceBodySchema, body)); }

  @ApiDescript("Cập nhật dịch vụ Service Tenant")
  @RequirePermission("service.marketplace.manage") @Patch("services/:serviceId")
  update(@Req() req: RequestWithRequiredUser, @Param("serviceId") id: string, @Body() body: unknown) { return this.service.updateService(req.user.userId, parseWithZod(servicePortalIdSchema, id), parseWithZod(marketplaceServiceUpdateSchema, body)); }

  @ApiDescript("Cập nhật khả năng phục vụ")
  @RequirePermission("service.marketplace.manage") @Patch("services/:serviceId/availability")
  availability(@Req() req: RequestWithRequiredUser, @Param("serviceId") id: string, @Body() body: unknown) { return this.service.updateAvailability(req.user.userId, parseWithZod(servicePortalIdSchema, id), parseWithZod(marketplaceAvailabilitySchema, body)); }

  @ApiDescript("Xem đơn Service Tenant")
  @RequirePermission("service.marketplace.view") @Get("orders")
  orderList(@Req() req: RequestWithRequiredUser) { return this.orders.listServiceOrders(req.user.userId); }

  @ApiDescript("Xem chi tiết đơn Service Tenant")
  @RequirePermission("service.marketplace.view") @Get("orders/:orderId")
  order(@Req() req: RequestWithRequiredUser, @Param("orderId") id: string) { return this.orders.serviceOrder(req.user.userId, parseWithZod(marketplaceOrderIdSchema, id)); }

  @ApiDescript("Chuyển trạng thái đơn Marketplace")
  @RequirePermission("service.marketplace.manage") @Post("orders/:orderId/transitions")
  transition(@Req() req: RequestWithRequiredUser, @Param("orderId") id: string, @Body() body: unknown) { return this.orders.transitionServiceOrder(req.user.userId, parseWithZod(marketplaceOrderIdSchema, id), parseWithZod(marketplaceTransitionSchema, body)); }
}
