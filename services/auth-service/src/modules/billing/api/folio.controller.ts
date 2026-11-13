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

  @SuccessMessage("Lấy danh sách hóa đơn lưu trú thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem danh sách hóa đơn lưu trú")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "status", required: false, enum: FolioStatus })
  @ApiOkResponse({ description: "Danh sách hóa đơn lưu trú" })
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

  @SuccessMessage("Lấy hóa đơn lưu trú đang mở của lượt lưu trú thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem hóa đơn lưu trú đang mở")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "stayId", type: String })
  @ApiOkResponse({ description: "Hóa đơn lưu trú đang mở" })
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

  @SuccessMessage("Lấy tổng quan hóa đơn lưu trú thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem tổng quan hóa đơn lưu trú")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiOkResponse({ description: "Tổng quan hóa đơn lưu trú" })
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
  @RequirePermission("hotel.billing.checkout")
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
        isEarlyDeparture: { type: "boolean" },
        expectedBalanceAmount: { type: "number", minimum: 0, description: "Số dư còn phải thu được xác nhận; sai lệch sẽ hủy toàn bộ phát hành hóa đơn." },
        adjustments: {
          type: "array",
          items: {
            type: "object",
            required: ["clientRequestId", "itemType", "name", "amount"],
            properties: {
              clientRequestId: { type: "string" },
              itemType: { type: "string", enum: ["MANUAL_CHARGE", "DISCOUNT"] },
              name: { type: "string", maxLength: 160 },
              description: { type: "string", maxLength: 1000 },
              amount: { type: "number" },
              quantity: { type: "integer", default: 1 },
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

  @SuccessMessage("Lấy danh sách mục hóa đơn lưu trú thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem danh sách mục hóa đơn lưu trú")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiOkResponse({ description: "Danh sách mục hóa đơn lưu trú" })
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

  @SuccessMessage("Lấy chi tiết hóa đơn lưu trú thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem chi tiết hóa đơn lưu trú")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiOkResponse({ description: "Chi tiết hóa đơn lưu trú" })
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

  @SuccessMessage("Thêm mục phụ thu / giảm giá vào hóa đơn lưu trú thành công")
  @RequirePermission("hotel.billing.manage")
  @ApiDescript("Thêm khoản phụ thu hoặc giảm giá vào hóa đơn lưu trú")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiOkResponse({ description: "Mục hóa đơn lưu trú đã tạo" })
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

  @SuccessMessage("Hủy mục hóa đơn lưu trú thành công")
  @RequirePermission("hotel.billing.manage")
  @ApiDescript("Hủy một khoản mục trong hóa đơn lưu trú")
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
