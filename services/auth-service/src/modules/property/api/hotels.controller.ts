import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import {
  createHotelBodySchema as createHotelBodyOpenApiSchema,
  hotelDataSchema,
  hotelFeatureItemSchema,
  hotelFeaturesDataSchema,
  listHotelsDataSchema,
  successEnvelopeSchema,
  updateHotelBodySchema as updateHotelBodyOpenApiSchema,
  updateHotelFeatureBodySchema as updateHotelFeatureBodyOpenApiSchema,
} from "../../../common/openapi/contract-schemas";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { HotelFeatureEntitlementsService } from "../application/hotel-feature-entitlements.service";
import { HotelsService } from "../application/hotels.service";
import {
  createHotelBodySchema,
  hotelFeatureParamsSchema,
  listHotelsQuerySchema,
  operationalResetBodySchema,
  updateHotelBodySchema,
  updateHotelFeatureStatusBodySchema,
} from "../domain/schemas/hotel.schema";
import { hotelIdParamSchema } from "../domain/schemas/shared.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("hotels")
@Controller("hotels")
export class HotelsController {
  constructor(
    private readonly hotelsService: HotelsService,
    private readonly hotelFeatureEntitlementsService: HotelFeatureEntitlementsService,
  ) {}

  @RequirePermission("platform.hotels.manage")
  @SuccessMessage("Tạo khách sạn thành công")
  @ApiDescript("Tạo khách sạn")
  @ApiBody({ schema: createHotelBodyOpenApiSchema })
  @ApiCreatedResponse({
    description: "Đã tạo khách sạn",
    schema: successEnvelopeSchema(hotelDataSchema, 201, "Tạo khách sạn thành công"),
  })
  @Post()
  async createHotel(@Req() request: RequestWithUser, @Body() body: unknown) {
    const dto = parseWithZod(createHotelBodySchema, body);
    return this.hotelsService.createHotel(request.user.userId, request.user.roleId, dto);
  }

  @RequirePermission(["platform.hotels.view", "hotel.profile.view"])
  @SuccessMessage("Lấy danh sách khách sạn thành công")
  @ApiDescript("Xem danh sách khách sạn")
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiHeader({
    name: "x-tenant-id",
    required: false,
    description: "Tenant scope chính; tenantId query chỉ là fallback tương thích tạm thời.",
  })
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
    @Headers("x-tenant-id") tenantIdHeader: string | undefined,
    @Query() query: unknown,
  ) {
    const parsedQuery = parseWithZod(listHotelsQuerySchema, query);
    return this.hotelsService.listHotels(request.user.userId, request.user.roleId, {
      ...parsedQuery,
      tenantId: tenantIdHeader?.trim() || parsedQuery.tenantId,
    });
  }

  @RequirePermission(["platform.hotels.view", "hotel.profile.view"])
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
    return this.hotelsService.getHotel(request.user.userId, request.user.roleId, hotelId);
  }

  @RequirePermission(["platform.hotels.manage", "hotel.profile.manage"])
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
    return this.hotelsService.updateHotel(request.user.userId, request.user.roleId, hotelId, dto);
  }

  @RequirePermission(["hotel.profile.manage", "platform.hotels.manage"])
  @SuccessMessage("Thiết lập lại dữ liệu vận hành thành công")
  @ApiDescript(
    "Thiết lập lại dữ liệu vận hành khách sạn (xóa hóa đơn, lượt truy cập, doanh thu về 0, phòng về trống; tối đa 2 lần)",
  )
  @ApiParam({ name: "hotelId", type: String })
  @Post(":hotelId/operational-reset")
  async resetOperationalData(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body?: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    parseWithZod(operationalResetBodySchema, body ?? {});
    return this.hotelsService.resetOperationalData(
      request.user.userId,
      request.user.roleId,
      hotelId,
    );
  }

  @RequirePermission("platform.hotel-features.manage")
  @SuccessMessage("Lấy danh sách tính năng khách sạn thành công")
  @ApiDescript("Xem danh sách tính năng mở khoá của khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({
    description: "Đã lấy danh sách tính năng",
    schema: successEnvelopeSchema(
      hotelFeaturesDataSchema,
      200,
      "Lấy danh sách tính năng khách sạn thành công",
    ),
  })
  @Get(":hotelId/features")
  async getHotelFeatures(@Param("hotelId") hotelIdParam: string) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.hotelFeatureEntitlementsService.getHotelFeatures(hotelId);
  }

  @RequirePermission("platform.hotel-features.manage")
  @SuccessMessage("Cập nhật trạng thái tính năng thành công")
  @ApiDescript("Cập nhật trạng thái tính năng mở khoá của khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "featureKey", type: String })
  @ApiBody({ schema: updateHotelFeatureBodyOpenApiSchema })
  @ApiOkResponse({
    description: "Đã cập nhật trạng thái tính năng",
    schema: successEnvelopeSchema(
      hotelFeatureItemSchema,
      200,
      "Cập nhật trạng thái tính năng thành công",
    ),
  })
  @Put(":hotelId/features/:featureKey")
  async setHotelFeatureStatus(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("featureKey") featureKeyParam: string,
    @Body() body: unknown,
  ) {
    const { hotelId, featureKey } = parseWithZod(hotelFeatureParamsSchema, {
      hotelId: hotelIdParam,
      featureKey: featureKeyParam,
    });
    const { status } = parseWithZod(updateHotelFeatureStatusBodySchema, body);
    return this.hotelFeatureEntitlementsService.setHotelFeatureStatus(
      hotelId,
      featureKey,
      status,
      request.user.userId,
    );
  }
}
