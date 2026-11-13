import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiQuery, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { successEnvelopeSchema } from "../../../common/openapi/contract-schemas";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { HotelExpenseService } from "../application/hotel-expense.service";
import {
  createHotelExpenseSchema,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_PAYMENT_STATUSES,
  expenseIdParamSchema,
  listHotelExpensesQuerySchema,
  payHotelExpenseSchema,
  updateHotelExpenseSchema,
  voidHotelExpenseSchema,
} from "../domain/schemas/hotel-expense.schema";
import { hotelIdParamSchema } from "../domain/schemas/shared.schema";

type ExpenseRequest = Request & { user: AuthenticatedUser };

const moneySchema = { type: "number", minimum: 0.01, maximum: 9_999_999_999.99, multipleOf: 0.01 };
const expenseProperties = {
  expenseDate: { type: "string", format: "date" },
  category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
  title: { type: "string", minLength: 1, maxLength: 240 },
  vendorName: { type: "string", nullable: true, maxLength: 160 },
  roomId: { type: "string", nullable: true, maxLength: 80 },
  amount: { ...moneySchema, description: "Số tiền VND; cũng chấp nhận chuỗi số và áp dụng cùng giới hạn." },
  paidAmount: { ...moneySchema, minimum: 0, nullable: true, description: "Bỏ trống hoặc null để không chỉ định. PARTIAL yêu cầu lớn hơn 0 và nhỏ hơn amount; các trạng thái khác không được vượt amount." },
  paymentStatus: { type: "string", enum: [...EXPENSE_PAYMENT_STATUSES], default: "PAID" },
  paymentMethod: { type: "string", enum: [...EXPENSE_PAYMENT_METHODS], nullable: true },
  paidAt: { type: "string", format: "date-time", nullable: true, description: "Thời điểm có múi giờ; chuỗi rỗng được coi là null." },
  documentNumber: { type: "string", nullable: true, maxLength: 80 },
  notes: { type: "string", nullable: true, maxLength: 1000 },
};
const requiredExpenseFields = ["expenseDate", "category", "title", "amount"];
const versionSchema = { type: "integer", minimum: 0 };

const mutationResponseSchema = successEnvelopeSchema(
  {
    type: "object",
    properties: {
      id: { type: "string" },
      version: versionSchema,
    },
    required: ["id", "version"],
  },
  200,
  "Đã lưu khoản chi phí",
);

const listResponseSchema = successEnvelopeSchema(
  {
    type: "object",
    required: ["hotelId", "hotelName", "currency", "timeZone", "from", "to", "summary", "byCategory", "items", "rooms"],
    properties: {
      hotelId: { type: "string" },
      hotelName: { type: "string" },
      currency: { type: "string", enum: ["VND"] },
      timeZone: { type: "string" },
      from: { type: "string", format: "date" },
      to: { type: "string", format: "date" },
      summary: {
        type: "object",
        required: ["totalExpense", "paidExpense", "unpaidExpense", "saasFeeInPeriod", "totalWithSaas", "entryCount", "unpaidCount"],
        properties: {
          totalExpense: { type: "number" },
          paidExpense: { type: "number" },
          unpaidExpense: { type: "number" },
          saasFeeInPeriod: { type: "number" },
          totalWithSaas: { type: "number" },
          entryCount: { type: "integer", minimum: 0 },
          unpaidCount: { type: "integer", minimum: 0 },
        },
      },
      byCategory: { type: "array", items: {
        type: "object",
        required: ["category", "categoryLabel", "amount", "paidAmount", "unpaidAmount", "count", "sharePercent"],
        properties: {
          category: expenseProperties.category,
          categoryLabel: { type: "string" },
          amount: { type: "number" },
          paidAmount: { type: "number" },
          unpaidAmount: { type: "number" },
          count: { type: "integer", minimum: 0 },
          sharePercent: { type: "number", minimum: 0, maximum: 100 },
        },
      } },
      items: { type: "array", items: {
        type: "object",
        required: ["id", ...Object.keys(expenseProperties), "categoryLabel", "roomNumber", "unpaidAmount", "version", "voidedAt", "voidReason", "createdAt"],
        properties: {
          ...expenseProperties,
          id: { type: "string" },
          categoryLabel: { type: "string" },
          roomNumber: { type: "string", nullable: true },
          amount: { type: "number" },
          paidAmount: { type: "number" },
          unpaidAmount: { type: "number" },
          paymentStatus: { type: "string", enum: [...EXPENSE_PAYMENT_STATUSES] },
          version: versionSchema,
          voidedAt: { type: "string", format: "date-time", nullable: true },
          voidReason: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      } },
      rooms: { type: "array", items: {
        type: "object",
        required: ["id", "roomNumber"],
        properties: { id: { type: "string" }, roomNumber: { type: "string" } },
      } },
    },
  },
  200,
  "Đã tải sổ chi phí vận hành",
);

@ApiTags("hotel-billing")
@Controller("hotels/:hotelId/expenses")
export class HotelExpenseController {
  constructor(private readonly hotelExpenseService: HotelExpenseService) {}

  @Get()
  @RequirePermission("hotel.billing.view")
  @SuccessMessage("Đã tải sổ chi phí vận hành")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "from", schema: { type: "string", format: "date" }, required: false })
  @ApiQuery({ name: "to", schema: { type: "string", format: "date" }, required: false })
  @ApiQuery({ name: "category", enum: EXPENSE_CATEGORIES, required: false })
  @ApiQuery({ name: "paymentStatus", enum: EXPENSE_PAYMENT_STATUSES, required: false })
  @ApiQuery({ name: "includeVoided", schema: { type: "boolean", default: false }, required: false })
  @ApiOkResponse({ schema: listResponseSchema })
  @ApiServiceUnavailableResponse({ description: "Sổ chi phí tạm thời không khả dụng" })
  listExpenses(
    @Req() request: ExpenseRequest,
    @Param("hotelId") hotelId: string,
    @Query() query: unknown,
  ) {
    return this.hotelExpenseService.listExpenses(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      parseWithZod(listHotelExpensesQuerySchema, query),
    );
  }

  @Post()
  @RequirePermission("hotel.billing.manage")
  @SuccessMessage("Đã ghi nhận khoản chi phí")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({ schema: {
    type: "object", additionalProperties: false,
    required: [...requiredExpenseFields, "idempotencyKey"],
    properties: { ...expenseProperties, idempotencyKey: { type: "string", minLength: 1, maxLength: 120 } },
  } })
  @ApiCreatedResponse({ schema: mutationResponseSchema })
  createExpense(
    @Req() request: ExpenseRequest,
    @Param("hotelId") hotelId: string,
    @Body() body: unknown,
  ) {
    return this.hotelExpenseService.create(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      parseWithZod(createHotelExpenseSchema, body),
    );
  }

  @Patch(":expenseId")
  @RequirePermission("hotel.billing.manage")
  @SuccessMessage("Đã cập nhật khoản chi phí")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "expenseId", type: String })
  @ApiBody({ schema: {
    type: "object", additionalProperties: false,
    required: [...requiredExpenseFields, "version"],
    properties: { ...expenseProperties, version: versionSchema },
  } })
  @ApiOkResponse({ schema: mutationResponseSchema })
  updateExpense(
    @Req() request: ExpenseRequest,
    @Param("hotelId") hotelId: string,
    @Param("expenseId") expenseId: string,
    @Body() body: unknown,
  ) {
    return this.hotelExpenseService.update(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      parseWithZod(expenseIdParamSchema, expenseId),
      parseWithZod(updateHotelExpenseSchema, body),
    );
  }

  @Post(":expenseId/pay")
  @RequirePermission("hotel.billing.manage")
  @SuccessMessage("Đã cập nhật thanh toán khoản chi")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "expenseId", type: String })
  @ApiBody({ schema: {
    type: "object", additionalProperties: false, required: ["version"],
    description: "Phải nhập payAmount hoặc chọn markFull=true để tất toán toàn bộ.",
    anyOf: [{ required: ["payAmount"] }, { properties: { markFull: { enum: [true] } }, required: ["markFull"] }],
    properties: {
      version: versionSchema,
      markFull: { type: "boolean", default: false },
      payAmount: expenseProperties.amount,
      paymentMethod: { type: "string", enum: [...EXPENSE_PAYMENT_METHODS], default: "BANK_TRANSFER" },
      paidAt: expenseProperties.paidAt,
      notes: expenseProperties.notes,
    },
  } })
  @ApiOkResponse({ schema: mutationResponseSchema })
  payExpense(
    @Req() request: ExpenseRequest,
    @Param("hotelId") hotelId: string,
    @Param("expenseId") expenseId: string,
    @Body() body: unknown,
  ) {
    return this.hotelExpenseService.markPaid(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      parseWithZod(expenseIdParamSchema, expenseId),
      parseWithZod(payHotelExpenseSchema, body),
    );
  }

  @Post(":expenseId/void")
  @RequirePermission("hotel.billing.manage")
  @SuccessMessage("Đã hủy khoản chi phí")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "expenseId", type: String })
  @ApiBody({ schema: {
    type: "object", additionalProperties: false, required: ["version", "reason"],
    properties: { version: versionSchema, reason: { type: "string", minLength: 2, maxLength: 500 } },
  } })
  @ApiOkResponse({ schema: mutationResponseSchema })
  voidExpense(
    @Req() request: ExpenseRequest,
    @Param("hotelId") hotelId: string,
    @Param("expenseId") expenseId: string,
    @Body() body: unknown,
  ) {
    return this.hotelExpenseService.voidExpense(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      parseWithZod(expenseIdParamSchema, expenseId),
      parseWithZod(voidHotelExpenseSchema, body),
    );
  }
}
