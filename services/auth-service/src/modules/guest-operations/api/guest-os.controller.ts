import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  createGuestRequestBodySchema as createGuestRequestBodyOpenApiSchema,
  guestRequestDataSchema,
  guestServiceCatalogDataSchema,
  listGuestCategoryServicesDataSchema,
  listGuestRequestsDataSchema,
  successEnvelopeSchema,
} from "../../../common/openapi/contract-schemas";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import { GuestOsService } from "../application/guest-os.service";
import { GuestMessagesService } from "../application/guest-messages.service";
import {
  GuestSessionGuard,
  type RequestWithGuestSession,
} from "../infrastructure/guards/guest-session.guard";
import {
  createGuestRequestBodySchema,
  guestRequestIdParamSchema,
  listGuestCategoryServicesQuerySchema,
  listGuestRequestsQuerySchema,
  guestMessageBodySchema,
  listGuestMessagesQuerySchema,
  scanQrBodyOpenApiSchema,
  scanQrBodySchema,
  serviceCategoryIdParamSchema,
} from "../domain/schemas/guest-os.schema";

@ApiTags("guest-os")
@Controller("guest")
export class GuestOsController {
  constructor(
    private readonly guestOsService: GuestOsService,
    private readonly guestMessagesService: GuestMessagesService,
  ) {}

  @SuccessMessage("Tạo phiên khách thành công")
  @ApiBody({ schema: scanQrBodyOpenApiSchema })
  @ApiCreatedResponse({ description: "Đã chấp nhận quét QR của khách" })
  @Post("qr/scan")
  async scanQr(@Req() request: Request, @Body() body: unknown) {
    const dto = parseWithZod(scanQrBodySchema, body);
    return this.guestOsService.scanQr(dto, request);
  }

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Lấy phiên khách thành công")
  @ApiOkResponse({ description: "Đã lấy phiên khách" })
  @Get("session/me")
  async getCurrentSession(@Req() request: RequestWithGuestSession) {
    return this.guestOsService.getCurrentSession(request.guestSession);
  }

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Lấy danh sách dịch vụ cho khách thành công")
  @ApiOkResponse({ description: "Đã lấy danh sách dịch vụ cho khách" })
  @Get("services")
  @ApiOkResponse({
    schema: successEnvelopeSchema(
      guestServiceCatalogDataSchema,
      200,
      "Lay danh sach dich vu cho khach thanh cong",
    ),
  })
  async listServices(@Req() request: RequestWithGuestSession) {
    return this.guestOsService.listServices(request.guestSession, request);
  }

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Lấy danh sách dịch vụ trong danh mục cho khách thành công")
  @ApiOkResponse({ description: "Đã lấy danh sách dịch vụ trong danh mục cho khách" })
  @Get("service-categories/:categoryId/services")
  @ApiOkResponse({
    schema: successEnvelopeSchema(
      listGuestCategoryServicesDataSchema,
      200,
      "Lấy danh sách dịch vụ trong danh mục cho khách thành công",
    ),
  })
  async listCategoryServices(
    @Req() request: RequestWithGuestSession,
    @Param("categoryId") categoryId: string,
    @Query() query: unknown,
  ) {
    const parsedCategoryId = parseWithZod(serviceCategoryIdParamSchema, categoryId);
    const parsedQuery = parseWithZod(listGuestCategoryServicesQuerySchema, query);
    return this.guestOsService.listCategoryServices(
      request.guestSession,
      parsedCategoryId,
      parsedQuery,
      request,
    );
  }

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Tạo yêu cầu của khách thành công")
  @ApiBody({ schema: { type: "object" } })
  @ApiCreatedResponse({ description: "Đã tạo yêu cầu của khách" })
  @Post("requests")
  @ApiBody({ schema: createGuestRequestBodyOpenApiSchema })
  @ApiCreatedResponse({
    schema: successEnvelopeSchema(guestRequestDataSchema, 201, "Tao yeu cau cua khach thanh cong"),
  })
  async createRequest(@Req() request: RequestWithGuestSession, @Body() body: unknown) {
    const dto = parseWithZod(createGuestRequestBodySchema, body);
    return this.guestOsService.createRequest(request.guestSession, dto, request);
  }

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Lấy danh sách yêu cầu của khách thành công")
  @ApiOkResponse({ description: "Đã lấy danh sách yêu cầu của khách" })
  @Get("requests")
  @ApiOkResponse({
    schema: successEnvelopeSchema(
      listGuestRequestsDataSchema,
      200,
      "Lay danh sach yeu cau cua khach thanh cong",
    ),
  })
  async listRequests(@Req() request: RequestWithGuestSession, @Query() query: unknown) {
    const parsedQuery = parseWithZod(listGuestRequestsQuerySchema, query);
    return this.guestOsService.listRequests(request.guestSession, parsedQuery, request);
  }

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Cancel guest request successfully")
  @ApiOkResponse({ description: "Guest request cancelled" })
  @Patch("requests/:requestId/cancel")
  @ApiOkResponse({
    schema: successEnvelopeSchema(guestRequestDataSchema, 200, "Cancel guest request successfully"),
  })
  async cancelRequest(
    @Req() request: RequestWithGuestSession,
    @Param("requestId") requestId: string,
  ) {
    const parsedRequestId = parseWithZod(guestRequestIdParamSchema, requestId);
    return this.guestOsService.cancelRequest(request.guestSession, parsedRequestId, request);
  }

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Lấy hội thoại lễ tân thành công")
  @Get("messages")
  async listMessages(@Req() request: RequestWithGuestSession, @Query() query: unknown) {
    const parsed = parseWithZod(listGuestMessagesQuerySchema, query);
    return this.guestMessagesService.listForGuest(
      request.guestSession,
      parsed.page,
      parsed.limit ?? 20,
      parsed.before,
    );
  }

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Đã gửi tin nhắn cho lễ tân")
  @Post("messages")
  async sendMessage(@Req() request: RequestWithGuestSession, @Body() body: unknown) {
    const parsed = parseWithZod(guestMessageBodySchema, body);
    const session = await this.guestOsService.getCurrentSession(request.guestSession);
    return this.guestMessagesService.sendFromGuest(
      request.guestSession,
      parsed.body,
      new Date(session.session.stay.plannedCheckOutAt),
    );
  }

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Đã đánh dấu tin nhắn là đã đọc")
  @Post("messages/read")
  async markMessagesRead(@Req() request: RequestWithGuestSession) {
    return this.guestMessagesService.markReadForGuest(request.guestSession);
  }

  @UseGuards(GuestSessionGuard)
  @SuccessMessage("Đóng phiên khách thành công")
  @ApiOkResponse({ description: "Đã đóng phiên khách" })
  @Post("session/close")
  async closeSession(@Req() request: RequestWithGuestSession) {
    return this.guestOsService.closeSession(request.guestSession);
  }
}
