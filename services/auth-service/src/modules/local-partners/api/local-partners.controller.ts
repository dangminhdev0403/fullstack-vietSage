import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { HotelAccessService } from "../../property/property-public";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { LocalPartnersService } from "../application/local-partners.service";
import {
  createLocalPartnerBodySchema,
  hotelIdParamSchema,
  listGuestPartnersQuerySchema,
  localPartnerStatusSchema,
  partnerIdParamSchema,
  updateLocalPartnerBodySchema,
} from "../domain/schemas/local-partners.schema";

@ApiTags("local-partners")
@Controller("hotels/:hotelId/local-partners")
export class LocalPartnersController {
  constructor(
    private readonly service: LocalPartnersService,
    private readonly hotelAccess: HotelAccessService,
  ) {}

  private async scope(request: RequestWithRequiredUser, hotelIdParam: string) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.hotelAccess.assertHotelAccess(request.user.userId, request.user.roleId, hotelId);
    return hotelId;
  }

  @SuccessMessage("Lấy danh mục đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.view")
  @ApiDescript("Lấy danh mục đối tác lân cận")
  @Get("categories")
  async categories(@Req() request: RequestWithRequiredUser, @Param("hotelId") hotelId: string) {
    await this.scope(request, hotelId);
    return this.service.getCategories();
  }

  @SuccessMessage("Lấy danh sách đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.view")
  @ApiDescript("Lấy đối tác lân cận của khách sạn")
  @Get()
  async list(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = await this.scope(request, hotelIdParam);
    const filters = parseWithZod(listGuestPartnersQuerySchema, query ?? {});
    return this.service.getPartnersForHotel(hotelId, {
      categoryId: filters.categoryId,
      isFeatured: filters.isFeatured === "true" ? true : undefined,
    });
  }

  @SuccessMessage("Tạo đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.manage")
  @ApiDescript("Tạo đối tác lân cận")
  @Post()
  async create(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    return this.service.createPartner(
      await this.scope(request, hotelIdParam),
      parseWithZod(createLocalPartnerBodySchema, body),
    );
  }

  @SuccessMessage("Cập nhật đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.manage")
  @ApiDescript("Cập nhật đối tác lân cận")
  @Patch(":partnerId")
  async update(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("partnerId") partnerIdParam: string,
    @Body() body: unknown,
  ) {
    return this.service.updatePartner(
      await this.scope(request, hotelIdParam),
      parseWithZod(partnerIdParamSchema, partnerIdParam),
      parseWithZod(updateLocalPartnerBodySchema, body),
    );
  }

  @SuccessMessage("Cập nhật trạng thái đối tác thành công")
  @RequirePermission("hotel.local-partners.manage")
  @ApiDescript("Bật hoặc tắt đối tác lân cận")
  @Patch(":partnerId/status")
  async status(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("partnerId") partnerIdParam: string,
    @Body() body: unknown,
  ) {
    const status = parseWithZod(localPartnerStatusSchema, (body as { status?: unknown })?.status);
    return this.service.setPartnerStatus(
      await this.scope(request, hotelIdParam),
      parseWithZod(partnerIdParamSchema, partnerIdParam),
      status,
    );
  }
}
