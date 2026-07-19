import { Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { FolioStatus } from "@prisma/client";
import type { Request } from "express";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { BillingService } from "../application/billing.service";
import {
  billingIdParamSchema,
  listFolioItemsQuerySchema,
  listFoliosQuerySchema,
} from "../domain/schemas/billing.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("billing-folios")
@Controller("hotels")
export class FolioController {
  constructor(private readonly billingService: BillingService) {}

  @SuccessMessage("Lấy danh sách folio thành công")
  @ApiDescript("Xem danh sách folio")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "status", required: false, enum: [FolioStatus.OPEN, FolioStatus.CLOSED] })
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
  @ApiDescript("Phát hành hóa đơn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "folioId", type: String })
  @ApiOkResponse({ description: "Invoice đã phát hành" })
  @Post(":hotelId/folios/:folioId/checkout/issue-invoice")
  async issueInvoice(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("folioId") folioIdParam: string,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const folioId = parseWithZod(billingIdParamSchema, folioIdParam);

    return this.billingService.issueInvoice(
      request.user.userId,
      request.user.roleId,
      hotelId,
      folioId,
    );
  }

  @SuccessMessage("Lấy danh sách dòng folio thành công")
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
}
