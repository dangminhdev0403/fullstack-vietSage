import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import { LocalPartnersService } from "../application/local-partners.service";
import {
  createLocalPartnerBodySchema,
  createLocalPartnerOfferBodySchema,
  hotelIdParamSchema,
  offerIdParamSchema,
  partnerIdParamSchema,
  updateBookingRequestStatusBodySchema,
  updateLocalPartnerBodySchema,
  updateLocalPartnerOfferBodySchema,
  bookingRequestIdParamSchema,
} from "../domain/schemas/local-partners.schema";

@ApiTags("local-partners")
@Controller("hotels")
export class LocalPartnersController {
  constructor(private readonly localPartnersService: LocalPartnersService) {}

  @SuccessMessage("Lấy danh mục đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.view")
  @ApiDescript("Lấy danh sách các danh mục đối tác lân cận")
  @Get(":hotelId/local-partners/categories")
  async getCategories(@Param("hotelId") hotelIdParam: string) {
    parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.localPartnersService.getCategories();
  }

  @SuccessMessage("Lấy danh sách đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.view")
  @ApiDescript("Lấy danh sách đối tác lân cận của khách sạn")
  @Get(":hotelId/local-partners/partners")
  async getPartners(
    @Param("hotelId") hotelIdParam: string,
    @Query("categoryId") categoryId?: string,
    @Query("q") q?: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.localPartnersService.getPartnersForHotel(hotelId, { categoryId, q });
  }

  @SuccessMessage("Lấy chi tiết đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.view")
  @ApiDescript("Xem chi tiết đối tác lân cận")
  @Get(":hotelId/local-partners/partners/:partnerId")
  async getPartner(
    @Param("hotelId") hotelIdParam: string,
    @Param("partnerId") partnerIdParam: string,
  ) {
    parseWithZod(hotelIdParamSchema, hotelIdParam);
    const partnerId = parseWithZod(partnerIdParamSchema, partnerIdParam);
    return this.localPartnersService.getPartnerById(partnerId);
  }

  @SuccessMessage("Tạo mới đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.manage")
  @ApiDescript("Thêm mới đối tác lân cận cho khách sạn")
  @Post(":hotelId/local-partners/partners")
  async createPartner(@Param("hotelId") hotelIdParam: string, @Body() body: unknown) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const payload = parseWithZod(createLocalPartnerBodySchema, body);
    return this.localPartnersService.createPartner(hotelId, payload);
  }

  @SuccessMessage("Cập nhật đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.manage")
  @ApiDescript("Cập nhật thông tin đối tác lân cận")
  @Put(":hotelId/local-partners/partners/:partnerId")
  async updatePartner(
    @Param("hotelId") hotelIdParam: string,
    @Param("partnerId") partnerIdParam: string,
    @Body() body: unknown,
  ) {
    parseWithZod(hotelIdParamSchema, hotelIdParam);
    const partnerId = parseWithZod(partnerIdParamSchema, partnerIdParam);
    const payload = parseWithZod(updateLocalPartnerBodySchema, body);
    return this.localPartnersService.updatePartner(partnerId, payload);
  }

  @SuccessMessage("Cập nhật trạng thái đối tác thành công")
  @RequirePermission("hotel.local-partners.manage")
  @ApiDescript("Bật/tắt đối tác lân cận")
  @Patch(":hotelId/local-partners/partners/:partnerId/status")
  async setPartnerStatus(
    @Param("hotelId") hotelIdParam: string,
    @Param("partnerId") partnerIdParam: string,
    @Body() body: unknown,
  ) {
    parseWithZod(hotelIdParamSchema, hotelIdParam);
    const partnerId = parseWithZod(partnerIdParamSchema, partnerIdParam);
    const { status } = parseWithZod(updateLocalPartnerBodySchema, body);
    if (!status) throw new Error("Cần cung cấp status");
    return this.localPartnersService.setPartnerStatus(partnerId, status);
  }

  @SuccessMessage("Xóa đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.manage")
  @ApiDescript("Xóa đối tác lân cận khỏi hệ thống")
  @Delete(":hotelId/local-partners/partners/:partnerId")
  async deletePartner(
    @Param("hotelId") hotelIdParam: string,
    @Param("partnerId") partnerIdParam: string,
  ) {
    parseWithZod(hotelIdParamSchema, hotelIdParam);
    const partnerId = parseWithZod(partnerIdParamSchema, partnerIdParam);
    return this.localPartnersService.deletePartner(partnerId);
  }

  @SuccessMessage("Thêm ưu đãi thành công")
  @RequirePermission("hotel.local-partners.manage")
  @ApiDescript("Thêm chương trình ưu đãi cho đối tác")
  @Post(":hotelId/local-partners/partners/:partnerId/offers")
  async createOffer(
    @Param("hotelId") hotelIdParam: string,
    @Param("partnerId") partnerIdParam: string,
    @Body() body: unknown,
  ) {
    parseWithZod(hotelIdParamSchema, hotelIdParam);
    const partnerId = parseWithZod(partnerIdParamSchema, partnerIdParam);
    const payload = parseWithZod(createLocalPartnerOfferBodySchema, body);
    return this.localPartnersService.createOffer(partnerId, payload);
  }

  @SuccessMessage("Cập nhật ưu đãi thành công")
  @RequirePermission("hotel.local-partners.manage")
  @ApiDescript("Cập nhật thông tin ưu đãi đối tác")
  @Put(":hotelId/local-partners/offers/:offerId")
  async updateOffer(
    @Param("hotelId") hotelIdParam: string,
    @Param("offerId") offerIdParam: string,
    @Body() body: unknown,
  ) {
    parseWithZod(hotelIdParamSchema, hotelIdParam);
    const offerId = parseWithZod(offerIdParamSchema, offerIdParam);
    const payload = parseWithZod(updateLocalPartnerOfferBodySchema, body);
    return this.localPartnersService.updateOffer(offerId, payload);
  }

  @SuccessMessage("Lấy danh sách yêu cầu đặt dịch vụ thành công")
  @RequirePermission("hotel.local-partners.view")
  @ApiDescript("Lấy danh sách yêu cầu hỗ trợ đặt đối tác lân cận của khách")
  @Get(":hotelId/local-partners/booking-requests")
  async getBookingRequests(@Param("hotelId") hotelIdParam: string) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.localPartnersService.getBookingRequests(hotelId);
  }

  @SuccessMessage("Cập nhật trạng thái yêu cầu thành công")
  @RequirePermission("hotel.local-partners.manage")
  @ApiDescript("Cập nhật trạng thái xử lý yêu cầu đặt dịch vụ ngoài")
  @Patch(":hotelId/local-partners/booking-requests/:bookingRequestId/status")
  async updateBookingRequestStatus(
    @Param("hotelId") hotelIdParam: string,
    @Param("bookingRequestId") requestIdParam: string,
    @Body() body: unknown,
  ) {
    parseWithZod(hotelIdParamSchema, hotelIdParam);
    const id = parseWithZod(bookingRequestIdParamSchema, requestIdParam);
    const { status } = parseWithZod(updateBookingRequestStatusBodySchema, body);
    return this.localPartnersService.updateBookingRequestStatus(id, status);
  }

  @SuccessMessage("Lấy thống kê đối tác lân cận thành công")
  @RequirePermission("hotel.local-partners.view")
  @ApiDescript("Lấy thống kê lượt tương tác và số lượng đối tác lân cận")
  @Get(":hotelId/local-partners/analytics")
  async getAnalytics(@Param("hotelId") hotelIdParam: string) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.localPartnersService.getAnalytics(hotelId);
  }
}
