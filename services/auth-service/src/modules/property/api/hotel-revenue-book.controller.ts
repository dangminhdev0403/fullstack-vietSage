import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { successEnvelopeSchema } from "../../../common/openapi/contract-schemas";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { HotelRevenueBookService } from "../application/hotel-revenue-book.service";
import { collectRevenueEntrySchema, createRevenueEntrySchema, revenueBookQuerySchema, revenueEntryIdSchema, updateRevenueEntrySchema, voidRevenueEntrySchema } from "../domain/schemas/hotel-revenue-book.schema";
import { hotelIdParamSchema } from "../domain/schemas/shared.schema";

interface RevenueRequest extends Request { user: AuthenticatedUser }
const moneyProperties = Object.fromEntries(["roomRevenue", "minibarRevenue", "laundryRevenue", "otherRevenue", "revenueTotal", "openingBalance", "closingBalance", "balanceAdjustment"].map((key) => [key, { type: "number" }]));
const collectionProperties = { receivedAt: { type: "string", format: "date-time" }, amount: { type: "number", exclusiveMinimum: 0 }, method: { type: "string", enum: ["CASH", "BANK_TRANSFER", "CARD", "OTHER"] }, reference: { type: "string", nullable: true, maxLength: 120 } };
const entryProperties = { date: { type: "string", format: "date" }, description: { type: "string", maxLength: 300 }, category: { type: "string", enum: ["ROOM", "MINIBAR", "LAUNDRY", "OTHER"] }, amount: { type: "number", exclusiveMinimum: 0 }, roomId: { type: "string", nullable: true }, documentNumber: { type: "string", nullable: true, maxLength: 80 }, notes: { type: "string", nullable: true, maxLength: 1000 } };
const mutationResponse = successEnvelopeSchema({ type: "object", required: ["id", "version"], properties: { id: { type: "string" }, version: { type: "integer" } } }, 200, "Đã cập nhật sổ doanh thu");
const bookResponse = successEnvelopeSchema({
  type: "object", required: ["hotelId", "hotelName", "timeZone", "currency", "from", "to", "entries", "summary", "rooms", "canManage"],
  properties: {
    hotelId: { type: "string" }, hotelName: { type: "string" }, timeZone: { type: "string" }, currency: { type: "string", enum: ["VND"] }, from: { type: "string", format: "date" }, to: { type: "string", format: "date" }, canManage: { type: "boolean" },
    rooms: { type: "array", items: { type: "object", required: ["id", "number"], properties: { id: { type: "string" }, number: { type: "string" } } } },
    summary: { type: "object", properties: { ...moneyProperties, collectedTotal: { type: "number" }, cashTotal: { type: "number" }, bankTransferTotal: { type: "number" }, otherCollectedTotal: { type: "number" } } },
    entries: { type: "array", items: { type: "object", properties: {
      ...moneyProperties, ...entryProperties, id: { type: "string" }, source: { type: "string", enum: ["FOLIO", "MANUAL", "DEPOSIT", "RECEIVABLE"] }, roomNumber: { type: "string", nullable: true },
      category: { ...entryProperties.category, nullable: true }, amount: { type: "number", nullable: true }, declarationStatus: { type: "string", nullable: true }, version: { type: "integer", nullable: true }, voidedAt: { type: "string", format: "date-time", nullable: true },
      revenueLines: { type: "array", items: { type: "object", properties: { date: { type: "string", format: "date" }, ...Object.fromEntries(Object.entries(moneyProperties).filter(([key]) => !["openingBalance", "closingBalance", "balanceAdjustment"].includes(key))) } } },
      collections: { type: "array", items: { type: "object", properties: { id: { type: "string" }, ...collectionProperties, method: { type: "string" } } } },
    } } },
  },
}, 200, "Đã tải sổ doanh thu");

@ApiTags("hotel-reports")
@ApiParam({ name: "hotelId", type: String })
@Controller("hotels/:hotelId/reports/revenue-book")
export class HotelRevenueBookController {
  constructor(private readonly service: HotelRevenueBookService) {}

  @Get()
  @RequirePermission("hotel.billing.view")
  @SuccessMessage("Đã tải sổ doanh thu")
  @ApiQuery({ name: "from", type: String, required: false, description: "Ngày bắt đầu YYYY-MM-DD; bỏ cả hai ngày để xem tháng hiện tại theo giờ khách sạn" })
  @ApiQuery({ name: "to", type: String, required: false, description: "Ngày kết thúc YYYY-MM-DD, bao gồm ngày này; tối đa 366 ngày" })
  @ApiOkResponse({ schema: bookResponse })
  getBook(@Req() request: RevenueRequest, @Param("hotelId") hotelId: string, @Query() query: unknown) {
    return this.service.getBook(request.user.userId, request.user.roleId, parseWithZod(hotelIdParamSchema, hotelId), parseWithZod(revenueBookQuerySchema, query));
  }

  @Post("entries")
  @RequirePermission("hotel.billing.manage")
  @SuccessMessage("Đã thêm khoản phát sinh")
  @ApiBody({ schema: { type: "object", required: ["date", "description", "category", "amount", "idempotencyKey"], properties: { ...entryProperties, idempotencyKey: { type: "string", maxLength: 120 }, collection: { type: "object", required: ["receivedAt", "amount", "method"], properties: collectionProperties } } } })
  @ApiCreatedResponse({ schema: mutationResponse })
  create(@Req() request: RevenueRequest, @Param("hotelId") hotelId: string, @Body() body: unknown) {
    return this.service.create(request.user.userId, request.user.roleId, parseWithZod(hotelIdParamSchema, hotelId), parseWithZod(createRevenueEntrySchema, body));
  }

  @Patch("entries/:entryId")
  @RequirePermission("hotel.billing.manage")
  @SuccessMessage("Đã cập nhật khoản phát sinh")
  @ApiParam({ name: "entryId", type: String })
  @ApiBody({ schema: { type: "object", required: ["date", "description", "category", "amount", "version"], properties: { ...entryProperties, version: { type: "integer", minimum: 0 } } } })
  @ApiOkResponse({ schema: mutationResponse })
  update(@Req() request: RevenueRequest, @Param("hotelId") hotelId: string, @Param("entryId") entryId: string, @Body() body: unknown) {
    return this.service.update(request.user.userId, request.user.roleId, parseWithZod(hotelIdParamSchema, hotelId), parseWithZod(revenueEntryIdSchema, entryId), parseWithZod(updateRevenueEntrySchema, body));
  }

  @Post("entries/:entryId/collections")
  @RequirePermission("hotel.billing.manage")
  @SuccessMessage("Đã ghi nhận tiền thu")
  @ApiParam({ name: "entryId", type: String })
  @ApiBody({ schema: { type: "object", required: ["receivedAt", "amount", "method", "idempotencyKey"], properties: { ...collectionProperties, idempotencyKey: { type: "string", maxLength: 120 } } } })
  @ApiCreatedResponse({ schema: mutationResponse })
  collect(@Req() request: RevenueRequest, @Param("hotelId") hotelId: string, @Param("entryId") entryId: string, @Body() body: unknown) {
    return this.service.collect(request.user.userId, request.user.roleId, parseWithZod(hotelIdParamSchema, hotelId), parseWithZod(revenueEntryIdSchema, entryId), parseWithZod(collectRevenueEntrySchema, body));
  }

  @Post("entries/:entryId/void")
  @RequirePermission("hotel.billing.manage")
  @SuccessMessage("Đã hủy khoản phát sinh")
  @ApiParam({ name: "entryId", type: String })
  @ApiBody({ schema: { type: "object", required: ["reason", "version"], properties: { reason: { type: "string", maxLength: 500 }, version: { type: "integer", minimum: 0 } } } })
  @ApiCreatedResponse({ schema: mutationResponse })
  void(@Req() request: RevenueRequest, @Param("hotelId") hotelId: string, @Param("entryId") entryId: string, @Body() body: unknown) {
    return this.service.void(request.user.userId, request.user.roleId, parseWithZod(hotelIdParamSchema, hotelId), parseWithZod(revenueEntryIdSchema, entryId), parseWithZod(voidRevenueEntrySchema, body));
  }
}
