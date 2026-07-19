import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  createServiceItemBodySchema as createServiceItemBodyOpenApiSchema,
  hotelServiceItemDataSchema,
  listHotelServiceItemsDataSchema,
  successEnvelopeSchema,
  updateServiceItemBodySchema as updateServiceItemBodyOpenApiSchema,
} from "../../../common/openapi/contract-schemas";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { HotelServicesService } from "../application/hotel-services.service";
import { GoogleSheetsServiceCatalogSyncService } from "../infrastructure/imports/google-sheets-service-catalog-sync.service";
import {
  createServiceCategoryBodySchema,
  createServiceItemBodySchema,
  listServiceCategoriesQuerySchema,
  listServiceItemsQuerySchema,
  updateServiceCategoryBodySchema,
  updateServiceItemBodySchema,
} from "../domain/schemas/service-catalog.schema";
import {
  hotelIdParamSchema,
  serviceCategoryIdParamSchema,
  serviceItemIdParamSchema,
} from "../domain/schemas/shared.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("hotel-services")
@Controller("hotels")
export class HotelServicesController {
  constructor(
    private readonly hotelServicesService: HotelServicesService,
    private readonly googleSheetsSyncService: GoogleSheetsServiceCatalogSyncService,
  ) {}

  @SuccessMessage("Đồng bộ Google Sheets thành công")
  @ApiDescript("Quản lý catalog dịch vụ")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({ description: "Đã đồng bộ Google Sheets" })
  @Post(":hotelId/service-catalog/sync")
  async syncServiceCatalogFromGoogleSheets(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.googleSheetsSyncService.syncHotel(
      hotelId,
      request.user.userId,
      request.user.roleId,
    );
  }

  @SuccessMessage("Lấy danh mục dịch vụ thành công")
  @ApiDescript("Xem danh mục và dịch vụ")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({ description: "Đã lấy danh mục dịch vụ" })
  @Get(":hotelId/service-categories")
  async listServiceCategories(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const parsedQuery = parseWithZod(listServiceCategoriesQuerySchema, query);
    return this.hotelServicesService.listServiceCategories(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedQuery,
    );
  }

  @SuccessMessage("Tạo danh mục dịch vụ thành công")
  @ApiDescript("Tạo danh mục dịch vụ")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiCreatedResponse({ description: "Đã tạo danh mục dịch vụ" })
  @Post(":hotelId/service-categories")
  async createServiceCategory(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createServiceCategoryBodySchema, body);
    return this.hotelServicesService.createServiceCategory(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Cập nhật danh mục dịch vụ thành công")
  @ApiDescript("Cập nhật danh mục dịch vụ")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "categoryId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Đã cập nhật danh mục dịch vụ" })
  @Patch(":hotelId/service-categories/:categoryId")
  async updateServiceCategory(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("categoryId") categoryIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const categoryId = parseWithZod(serviceCategoryIdParamSchema, categoryIdParam);
    const dto = parseWithZod(updateServiceCategoryBodySchema, body);
    return this.hotelServicesService.updateServiceCategory(
      request.user.userId,
      request.user.roleId,
      hotelId,
      categoryId,
      dto,
    );
  }

  @SuccessMessage("Lấy danh sách dịch vụ thành công")
  @ApiDescript("Xem danh mục và dịch vụ")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({ description: "Đã lấy danh sách dịch vụ" })
  @Get(":hotelId/service-items")
  @ApiOkResponse({
    schema: successEnvelopeSchema(
      listHotelServiceItemsDataSchema,
      200,
      "Lay danh sach dich vu thanh cong",
    ),
  })
  async listServiceItems(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const parsedQuery = parseWithZod(listServiceItemsQuerySchema, query);
    return this.hotelServicesService.listServiceItems(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedQuery,
    );
  }

  @SuccessMessage("Tạo dịch vụ thành công")
  @ApiDescript("Tạo dịch vụ")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiCreatedResponse({ description: "Đã tạo dịch vụ" })
  @Post(":hotelId/service-items")
  @ApiBody({ schema: createServiceItemBodyOpenApiSchema })
  @ApiCreatedResponse({
    schema: successEnvelopeSchema(hotelServiceItemDataSchema, 201, "Tao dich vu thanh cong"),
  })
  async createServiceItem(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createServiceItemBodySchema, body);
    return this.hotelServicesService.createServiceItem(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Cập nhật dịch vụ thành công")
  @ApiDescript("Cập nhật dịch vụ")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "itemId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Đã cập nhật dịch vụ" })
  @Patch(":hotelId/service-items/:itemId")
  @ApiBody({ schema: updateServiceItemBodyOpenApiSchema })
  @ApiOkResponse({
    schema: successEnvelopeSchema(hotelServiceItemDataSchema, 200, "Cap nhat dich vu thanh cong"),
  })
  async updateServiceItem(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("itemId") itemIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const itemId = parseWithZod(serviceItemIdParamSchema, itemIdParam);
    const dto = parseWithZod(updateServiceItemBodySchema, body);
    return this.hotelServicesService.updateServiceItem(
      request.user.userId,
      request.user.roleId,
      hotelId,
      itemId,
      dto,
    );
  }
}
