import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
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
  EXPENSE_PAYMENT_STATUSES,
  expenseIdParamSchema,
  listHotelExpensesQuerySchema,
  payHotelExpenseSchema,
  updateHotelExpenseSchema,
  voidHotelExpenseSchema,
} from "../domain/schemas/hotel-expense.schema";
import { hotelIdParamSchema } from "../domain/schemas/shared.schema";

type ExpenseRequest = Request & { user: AuthenticatedUser };

const mutationResponseSchema = successEnvelopeSchema(
  {
    type: "object",
    properties: {
      id: { type: "string" },
      version: { type: "number" },
    },
    required: ["id", "version"],
  },
  200,
  "Đã lưu khoản chi phí",
);

const listResponseSchema = successEnvelopeSchema(
  {
    type: "object",
    properties: {
      hotelId: { type: "string" },
      hotelName: { type: "string" },
      currency: { type: "string" },
      timeZone: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      summary: {
        type: "object",
        properties: {
          totalExpense: { type: "number" },
          paidExpense: { type: "number" },
          unpaidExpense: { type: "number" },
          saasFeeInPeriod: { type: "number" },
          totalWithSaas: { type: "number" },
          entryCount: { type: "number" },
          unpaidCount: { type: "number" },
        },
      },
      byCategory: { type: "array", items: { type: "object" } },
      items: { type: "array", items: { type: "object" } },
      rooms: { type: "array", items: { type: "object" } },
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
  @ApiQuery({ name: "from", type: String, required: false })
  @ApiQuery({ name: "to", type: String, required: false })
  @ApiQuery({ name: "category", enum: EXPENSE_CATEGORIES, required: false })
  @ApiQuery({ name: "paymentStatus", enum: EXPENSE_PAYMENT_STATUSES, required: false })
  @ApiQuery({ name: "includeVoided", type: Boolean, required: false })
  @ApiOkResponse({ schema: listResponseSchema })
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
  @ApiBody({ schema: { type: "object" } })
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
  @ApiBody({ schema: { type: "object" } })
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
  @ApiBody({ schema: { type: "object" } })
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
  @ApiBody({ schema: { type: "object" } })
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
