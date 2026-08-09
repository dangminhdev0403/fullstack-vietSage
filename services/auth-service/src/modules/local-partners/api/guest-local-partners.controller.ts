import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import { GuestLocalPartnersService } from "../application/guest-local-partners.service";
import {
  createBookingRequestBodySchema,
  listGuestPartnersQuerySchema,
  partnerIdParamSchema,
  recordInteractionBodySchema,
} from "../domain/schemas/local-partners.schema";

@ApiTags("guest-local-partners")
@Controller("guest/local-partners")
export class GuestLocalPartnersController {
  constructor(private readonly guestLocalPartnersService: GuestLocalPartnersService) {}

  @SuccessMessage("Lấy danh mục đối tác lân cận cho khách thành công")
  @ApiDescript("Guest OS - Danh sách danh mục đối tác lân cận")
  @Get("categories")
  async getCategories() {
    return this.guestLocalPartnersService.getCategories();
  }

  @SuccessMessage("Khám phá đối tác lân cận thành công")
  @ApiDescript("Guest OS - Danh sách đối tác lân cận khách sạn")
  @Get("hotels/:hotelId/partners")
  async getPartners(
    @Param("hotelId") hotelId: string,
    @Query() query: unknown,
  ) {
    const parsedQuery = parseWithZod(listGuestPartnersQuerySchema, query ?? {});
    return this.guestLocalPartnersService.getGuestPartners(hotelId, parsedQuery);
  }

  @SuccessMessage("Lấy chi tiết đối tác lân cận thành công")
  @ApiDescript("Guest OS - Xem chi tiết thông tin đối tác lân cận")
  @Get("hotels/:hotelId/partners/:partnerId")
  async getPartnerDetail(
    @Param("hotelId") hotelId: string,
    @Param("partnerId") partnerIdParam: string,
    @Query("stayId") stayId?: string,
  ) {
    const partnerId = parseWithZod(partnerIdParamSchema, partnerIdParam);
    return this.guestLocalPartnersService.getGuestPartnerDetail(hotelId, partnerId, stayId);
  }

  @SuccessMessage("Nhận ưu đãi thành công")
  @ApiDescript("Guest OS - Xem/Nhận mã ưu đãi dành riêng cho khách VietSage")
  @Post("hotels/:hotelId/partners/:partnerId/offers/:offerId/claim")
  async claimOffer(
    @Param("hotelId") hotelId: string,
    @Param("partnerId") partnerId: string,
    @Param("offerId") offerId: string,
    @Query("stayId") stayId?: string,
  ) {
    return this.guestLocalPartnersService.claimOffer(hotelId, partnerId, offerId, stayId);
  }

  @SuccessMessage("Gửi yêu cầu đặt dịch vụ ngoài thành công")
  @ApiDescript("Guest OS - Tạo yêu cầu nhờ Lễ tân hỗ trợ đặt đối tác ngoài")
  @Post("hotels/:hotelId/booking-requests")
  async createBookingRequest(
    @Param("hotelId") hotelId: string,
    @Body() body: unknown,
    @Query("stayId") stayId?: string,
  ) {
    const payload = parseWithZod(createBookingRequestBodySchema, body);
    return this.guestLocalPartnersService.createBookingRequest(hotelId, payload, stayId);
  }

  @SuccessMessage("Ghi nhận tương tác thành công")
  @ApiDescript("Guest OS - Ghi nhận log click bản đồ / gọi điện / Zalo")
  @Post("hotels/:hotelId/interactions")
  async recordInteraction(
    @Param("hotelId") hotelId: string,
    @Body() body: unknown,
    @Query("stayId") stayId?: string,
  ) {
    const { partnerId, actionType } = parseWithZod(recordInteractionBodySchema, body);
    return this.guestLocalPartnersService.recordInteraction(hotelId, partnerId, actionType, stayId);
  }
}
