import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import {
  createHotelBodySchema as createHotelBodyOpenApiSchema,
  hotelDataSchema,
  listHotelsDataSchema,
  successEnvelopeSchema,
  updateHotelBodySchema as updateHotelBodyOpenApiSchema,
} from "../../common/openapi/contract-schemas";
import { parseWithZod } from "../../common/validation/parse-with-zod";
import { ApiDescript } from "../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { HotelsService } from "./hotels.service";
import {
  createHotelBodySchema,
  hotelIdParamSchema,
  listHotelsQuerySchema,
  updateHotelBodySchema,
} from "./schemas/hotels.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("hotels")
@Controller("hotels")
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @SuccessMessage("Tạo khách sạn thành công")
  @ApiDescript("Tạo khách sạn")
  @ApiBody({ schema: createHotelBodyOpenApiSchema })
  @ApiCreatedResponse({
    description: "Đã tạo khách sạn",
    schema: successEnvelopeSchema(hotelDataSchema, 201, "Tạo khách sạn thành công"),
  })
  @Post()
  async createHotel(
    @Req() request: RequestWithUser,
    @Body() body: unknown,
    @Headers("x-tenant-id") tenantIdHeader?: string,
  ) {
    const dto = parseWithZod(createHotelBodySchema, body);
    return this.hotelsService.createHotel(request.user.userId, dto, tenantIdHeader);
  }

  @SuccessMessage("Lấy danh sách khách sạn thành công")
  @ApiDescript("Xem danh sách khách sạn")
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiOkResponse({
    description: "Đã lấy danh sách khách sạn",
    schema: successEnvelopeSchema(listHotelsDataSchema, 200, "Lấy danh sách khách sạn thành công"),
  })
  @Get()
  async listHotels(
    @Req() request: RequestWithUser,
    @Query() query: unknown,
    @Headers("x-tenant-id") tenantIdHeader?: string,
  ) {
    const parsedQuery = parseWithZod(listHotelsQuerySchema, query);
    return this.hotelsService.listHotels(request.user.userId, parsedQuery, tenantIdHeader);
  }

  @SuccessMessage("Lấy thông tin khách sạn thành công")
  @ApiDescript("Xem chi tiết khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({
    description: "Đã lấy thông tin khách sạn",
    schema: successEnvelopeSchema(hotelDataSchema, 200, "Lấy thông tin khách sạn thành công"),
  })
  @Get(":hotelId")
  async getHotel(@Req() request: RequestWithUser, @Param("hotelId") hotelIdParam: string) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.hotelsService.getHotel(request.user.userId, hotelId);
  }

  @SuccessMessage("Cập nhật khách sạn thành công")
  @ApiDescript("Cập nhật khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({ schema: updateHotelBodyOpenApiSchema })
  @ApiOkResponse({
    description: "Đã cập nhật khách sạn",
    schema: successEnvelopeSchema(hotelDataSchema, 200, "Cập nhật khách sạn thành công"),
  })
  @Patch(":hotelId")
  async updateHotel(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(updateHotelBodySchema, body);
    return this.hotelsService.updateHotel(request.user.userId, hotelId, dto);
  }
}
