import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { MarketplaceAdminService } from "../application/marketplace-admin.service";
import {
  hotelLinksQuerySchema,
  hotelServiceLinkBodySchema,
  marketplaceCategoryBodySchema,
  marketplaceCategoryUpdateSchema,
  marketplaceIdSchema,
  serviceTenantBodySchema,
} from "../domain/marketplace-admin.schema";

@Controller("admin/marketplace")
export class MarketplaceAdminController {
  constructor(private readonly service: MarketplaceAdminService) {}

  @RequirePermission("platform.marketplace.view")
  @SuccessMessage("Lấy danh mục Marketplace thành công")
  @ApiDescript("Xem danh mục Marketplace")
  @Get("categories")
  categories() { return this.service.listCategories(); }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Tạo danh mục Marketplace thành công")
  @ApiDescript("Tạo danh mục Marketplace")
  @Post("categories")
  createCategory(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    return this.service.createCategory(req.user.userId, parseWithZod(marketplaceCategoryBodySchema, body));
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Cập nhật danh mục Marketplace thành công")
  @ApiDescript("Cập nhật danh mục Marketplace")
  @Patch("categories/:categoryId")
  updateCategory(@Req() req: RequestWithRequiredUser, @Param("categoryId") id: string, @Body() body: unknown) {
    return this.service.updateCategory(req.user.userId, parseWithZod(marketplaceIdSchema, id), parseWithZod(marketplaceCategoryUpdateSchema, body));
  }

  @RequirePermission("platform.marketplace.view")
  @SuccessMessage("Lấy Service Tenant thành công")
  @ApiDescript("Xem Service Tenant Marketplace")
  @Get("service-tenants")
  serviceTenants() { return this.service.listServiceTenants(); }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Tạo Service Tenant thành công")
  @ApiDescript("Tạo Service Tenant Marketplace")
  @Post("service-tenants")
  createServiceTenant(@Req() req: RequestWithRequiredUser, @Body() body: unknown) {
    return this.service.createServiceTenant(req.user.userId, parseWithZod(serviceTenantBodySchema, body));
  }

  @RequirePermission("platform.marketplace.view")
  @SuccessMessage("Lấy liên kết Hotel-Service thành công")
  @ApiDescript("Xem liên kết Hotel Service")
  @Get("hotel-links")
  hotelLinks(@Query() query: unknown) {
    return this.service.listHotelLinks(parseWithZod(hotelLinksQuerySchema, query).hotelId);
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Cập nhật liên kết Hotel-Service thành công")
  @ApiDescript("Cập nhật liên kết Hotel Service")
  @Put("hotel-links/:hotelId/:serviceTenantId")
  setLink(@Req() req: RequestWithRequiredUser, @Param("hotelId") hotelId: string, @Param("serviceTenantId") serviceTenantId: string, @Body() body: unknown) {
    return this.service.setHotelLink(req.user.userId, parseWithZod(marketplaceIdSchema, hotelId), parseWithZod(marketplaceIdSchema, serviceTenantId), parseWithZod(hotelServiceLinkBodySchema, body));
  }

  @RequirePermission("platform.marketplace.manage")
  @SuccessMessage("Tắt liên kết Hotel-Service thành công")
  @ApiDescript("Tắt liên kết Hotel Service")
  @Delete("hotel-links/:hotelId/:serviceTenantId")
  disableLink(@Req() req: RequestWithRequiredUser, @Param("hotelId") hotelId: string, @Param("serviceTenantId") serviceTenantId: string) {
    return this.service.disableHotelLink(req.user.userId, parseWithZod(marketplaceIdSchema, hotelId), parseWithZod(marketplaceIdSchema, serviceTenantId));
  }
}
