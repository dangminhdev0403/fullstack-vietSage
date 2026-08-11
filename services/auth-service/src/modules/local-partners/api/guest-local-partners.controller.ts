import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import {
  GuestSessionGuard,
  type RequestWithGuestSession,
} from "../../guest-operations/guest-operations-public";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import { GuestLocalPartnersService } from "../application/guest-local-partners.service";
import {
  listGuestPartnersQuerySchema,
  partnerIdParamSchema,
} from "../domain/schemas/local-partners.schema";

@ApiTags("guest-local-partners")
@UseGuards(GuestSessionGuard)
@Controller("guest/local-partners")
export class GuestLocalPartnersController {
  constructor(private readonly service: GuestLocalPartnersService) {}

  @SuccessMessage("Lấy danh mục đối tác lân cận thành công")
  @ApiDescript("Guest OS - Danh mục đối tác lân cận")
  @Get("categories")
  getCategories() {
    return this.service.getCategories();
  }

  @SuccessMessage("Khám phá đối tác lân cận thành công")
  @ApiDescript("Guest OS - Đối tác lân cận của khách sạn đang lưu trú")
  @Get()
  getPartners(@Req() request: RequestWithGuestSession, @Query() query: unknown) {
    return this.service.getGuestPartners(
      request.guestSession.hotelId,
      parseWithZod(listGuestPartnersQuerySchema, query ?? {}),
    );
  }

  @SuccessMessage("Lấy chi tiết đối tác lân cận thành công")
  @ApiDescript("Guest OS - Chi tiết đối tác lân cận")
  @Get(":partnerId")
  getPartner(@Req() request: RequestWithGuestSession, @Param("partnerId") partnerIdParam: string) {
    return this.service.getGuestPartnerDetail(
      request.guestSession.hotelId,
      parseWithZod(partnerIdParamSchema, partnerIdParam),
    );
  }
}
