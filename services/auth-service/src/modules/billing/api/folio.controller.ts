import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { FolioStatus } from "@prisma/client";
import type { Request } from "express";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { BillingService } from "../application/billing.service";
import {
  addFolioItemBodySchema,
  billingIdParamSchema,
  issueInvoiceBodySchema,
  listFolioItemsQuerySchema,
  listFoliosQuerySchema,
  voidFolioItemBodySchema,
} from "../domain/schemas/billing.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("billing-folios")
@Controller("hotels")
export class FolioController {
  constructor(private readonly billingService: BillingService) {}

  @SuccessMessage("Lấy danh sách folio thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem danh sách folio")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "status", required: false, enum: FolioStatus })
  @ApiOkResponse({ description: "Danh sách folio" })
  @Get(":hotelId/folios")
  async listFolios(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const parsedQuery = parseWithZod(listFoliosQuerySchema, query);

    return this.billingService.listFolios(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedQuery,
    );
  }

  @SuccessMessage("Lấy folio đang mở của lượt lưu trú thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem folio đang mở")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "stayId", type: String })
  @ApiOkResponse({ description: "Folio đang mở" })
  @Get(":hotelId/stays/:stayId/active-folio")
  async getActiveFolioByStay(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("stayId") stayIdParam: string,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const stayId = parseWithZod(billingIdParamSchema, stayIdParam);

    return this.billingService.getActiveFolioByStay(
      request.user.userId,
      request.user.roleId,
      hotelId,
      stayId,
    );
  }

  @SuccessMessage("Lấy tổng quan folio thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem tổng quan folio")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiOkResponse({ description: "Tổng quan folio" })
  @Get(":hotelId/folios/:folioId/summary")
  async getFolioSummary(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("folioId") folioIdParam: string,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const folioId = parseWithZod(billingIdParamSchema, folioIdParam);

    return this.billingService.getFolioSummary(
      request.user.userId,
      request.user.roleId,
      hotelId,
      folioId,
    );
  }

  @SuccessMessage("Phát hành invoice checkout thành công")
  @RequirePermission("hotel.billing.manage")
  @ApiDescript("Phát hành hóa đơn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiOkResponse({ description: "Invoice đã phát hành" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        reconciliations: {
          type: "array",
          items: {
            type: "object",
            required: ["requestId", "action"],
            properties: {
              requestId: { type: "string" },
              action: { type: "string", enum: ["provided", "cancelled"] },
              cancelReason: { type: "string", maxLength: 500 },
            },
          },
        },
      },
    },
  })
  @Post(":hotelId/folios/:folioId/checkout/issue-invoice")
  async issueInvoice(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("folioId") folioIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const folioId = parseWithZod(billingIdParamSchema, folioIdParam);
    const options = parseWithZod(issueInvoiceBodySchema, body ?? {});

    return this.billingService.issueInvoice(
      request.user.userId,
      request.user.roleId,
      hotelId,
      folioId,
      options,
    );
  }

  @SuccessMessage("Lấy danh sách dòng folio thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem danh sách dòng folio")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiOkResponse({ description: "Danh sách FolioItem" })
  @Get(":hotelId/folios/:folioId/items")
  async listFolioItems(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("folioId") folioIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const folioId = parseWithZod(billingIdParamSchema, folioIdParam);
    const parsedQuery = parseWithZod(listFolioItemsQuerySchema, query);

    return this.billingService.listFolioItems(
      request.user.userId,
      request.user.roleId,
      hotelId,
      folioId,
      parsedQuery,
    );
  }

  @SuccessMessage("Lấy chi tiết folio thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem chi tiết folio")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiOkResponse({ description: "Chi tiết folio" })
  @Get(":hotelId/folios/:folioId")
  async getFolioDetail(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("folioId") folioIdParam: string,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const folioId = parseWithZod(billingIdParamSchema, folioIdParam);

    return this.billingService.getFolioDetail(
      request.user.userId,
      request.user.roleId,
      hotelId,
      folioId,
    );
  }

  @SuccessMessage("Thêm mục phụ thu / giảm giá vào folio thành công")
  @RequirePermission("hotel.billing.manage")
  @ApiDescript("Thêm khoản phụ thu hoặc giảm giá vào folio")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiOkResponse({ description: "Mục FolioItem đã tạo" })
  @Post(":hotelId/folios/:folioId/items")
  async addFolioItem(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("folioId") folioIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const folioId = parseWithZod(billingIdParamSchema, folioIdParam);
    const input = parseWithZod(addFolioItemBodySchema, body ?? {});

    return this.billingService.addFolioItem(
      request.user.userId,
      request.user.roleId,
      hotelId,
      folioId,
      input,
    );
  }

  @SuccessMessage("Hủy mục folio thành công")
  @RequirePermission("hotel.billing.manage")
  @ApiDescript("Hủy một khoản mục trong folio")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiParam({ name: "itemId", type: String })
  @ApiOkResponse({ description: "Kết quả hủy mục" })
  @Post(":hotelId/folios/:folioId/items/:itemId/void")
  async voidFolioItem(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("folioId") folioIdParam: string,
    @Param("itemId") itemIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const folioId = parseWithZod(billingIdParamSchema, folioIdParam);
    const itemId = parseWithZod(billingIdParamSchema, itemIdParam);
    const { reason } = parseWithZod(voidFolioItemBodySchema, body ?? {});

    return this.billingService.voidFolioItem(
      request.user.userId,
      request.user.roleId,
      hotelId,
      folioId,
      itemId,
      reason,
    );
  }
}
