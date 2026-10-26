import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { PaymentProvider } from "@prisma/client";
import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { BillingService } from "../application/billing.service";
import {
  billingIdParamSchema,
  collectReceivableBodySchema,
  confirmManualPaymentBodySchema,
  createBookingPaymentBodySchema,
  createPaymentSessionBodySchema,
  paymentProviderParamSchema,
  paymentWebhookBodySchema,
  transferToReceivableBodySchema,
} from "../domain/schemas/billing.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("billing-payments")
@Controller()
export class PaymentController {
  constructor(private readonly billingService: BillingService) {}

  @SuccessMessage("Tạo phiên thanh toán thành công")
  @RequirePermission("hotel.billing.manage")
  @ApiDescript("Tạo phiên thanh toán")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "invoiceId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Payment pending/session" })
  @Post("hotels/:hotelId/invoices/:invoiceId/payments/session")
  async createPaymentSession(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("invoiceId") invoiceIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const invoiceId = parseWithZod(billingIdParamSchema, invoiceIdParam);
    const dto = parseWithZod(createPaymentSessionBodySchema, body ?? {});

    return this.billingService.createPaymentSession(
      request.user.userId,
      request.user.roleId,
      hotelId,
      invoiceId,
      dto,
    );
  }

  @SuccessMessage("Xác nhận đã thu tiền thành công")
  @RequirePermission("hotel.billing.checkout")
  @ApiDescript("Xác nhận thanh toán tại quầy và hoàn tất checkout")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "invoiceId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Payment, invoice, folio và stay đã hoàn tất" })
  @Post("hotels/:hotelId/invoices/:invoiceId/payments/manual-confirm")
  async confirmManualPayment(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("invoiceId") invoiceIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const invoiceId = parseWithZod(billingIdParamSchema, invoiceIdParam);
    const dto = parseWithZod(confirmManualPaymentBodySchema, body ?? {});

    return this.billingService.confirmManualPayment(
      request.user.userId,
      request.user.roleId,
      hotelId,
      invoiceId,
      dto,
    );
  }

  @SuccessMessage("Lấy trạng thái thanh toán thành công")
  @RequirePermission("hotel.billing.view")
  @ApiDescript("Xem trạng thái thanh toán")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "paymentId", type: String })
  @ApiOkResponse({ description: "Payment status" })
  @Get("hotels/:hotelId/payments/:paymentId/status")
  async getPaymentStatus(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("paymentId") paymentIdParam: string,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const paymentId = parseWithZod(billingIdParamSchema, paymentIdParam);

    return this.billingService.getPaymentStatus(
      request.user.userId,
      request.user.roleId,
      hotelId,
      paymentId,
    );
  }

  @SuccessMessage("Ghi nhận tiền cọc thành công")
  @RequirePermission("hotel.billing.manage")
  @ApiDescript("Ghi nhận tiền cọc hoặc thanh toán trước check-in")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Bản ghi thanh toán cọc BookingPayment" })
  @Post("hotels/:hotelId/billing/booking-payments")
  async recordBookingPayment(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createBookingPaymentBodySchema, body ?? {});

    return this.billingService.recordBookingPayment(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Chuyển công nợ và trả phòng thành công")
  @RequirePermission("hotel.billing.checkout")
  @ApiDescript("Chuyển số dư sang công nợ và đóng lượt lưu trú")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "stayId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Bản ghi công nợ HotelReceivable" })
  @Post("hotels/:hotelId/billing/stays/:stayId/transfer-to-receivable")
  async transferToReceivable(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("stayId") stayIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const stayId = parseWithZod(billingIdParamSchema, stayIdParam);
    const dto = parseWithZod(transferToReceivableBodySchema, body ?? {});

    return this.billingService.transferStayToReceivable(
      request.user.userId,
      request.user.roleId,
      hotelId,
      stayId,
      dto,
    );
  }

  @SuccessMessage("Thu hồi công nợ thành công")
  @RequirePermission("hotel.billing.manage")
  @ApiDescript("Ghi nhận thu tiền công nợ")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "receivableId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Cập nhật công nợ và bản ghi ReceivableCollection" })
  @Post("hotels/:hotelId/billing/receivables/:receivableId/collect")
  async collectReceivable(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("receivableId") receivableIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const receivableId = parseWithZod(billingIdParamSchema, receivableIdParam);
    const dto = parseWithZod(collectReceivableBodySchema, body ?? {});

    return this.billingService.collectReceivable(
      request.user.userId,
      request.user.roleId,
      hotelId,
      receivableId,
      dto,
    );
  }

  @SuccessMessage("Xử lý webhook thanh toán thành công")
  @ApiDescript("Xử lý webhook thanh toán")
  @ApiParam({ name: "provider", enum: PaymentProvider })
  @ApiHeader({
    name: "X-VietSage-Payment-Webhook-Secret",
    required: true,
    description: "Shared secret configured for the payment provider webhook.",
  })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Webhook đã xử lý" })
  @Post("payments/webhook/:provider")
  async processWebhook(
    @Param("provider") providerParam: string,
    @Headers("x-vietsage-payment-webhook-secret") secret: string | undefined,
    @Body() body: unknown,
  ) {
    this.assertWebhookSecret(secret);
    const provider = parseWithZod(paymentProviderParamSchema, providerParam.toUpperCase());
    const payload = parseWithZod(paymentWebhookBodySchema, body);

    return this.billingService.processPaymentWebhook(provider, {
      ...payload,
      signatureVerified: true,
    });
  }

  private assertWebhookSecret(actual: string | undefined): void {
    const expected = process.env.PAYMENT_WEBHOOK_SECRET?.trim();
    const actualBuffer = actual ? Buffer.from(actual) : null;
    const expectedBuffer = expected ? Buffer.from(expected) : null;
    const valid = Boolean(
      actualBuffer &&
      expectedBuffer &&
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer),
    );

    if (!valid) {
      throw new ForbiddenException("Invalid payment webhook secret");
    }
  }
}
