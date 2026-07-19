import { Controller, Get, Param, Req } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { BillingService } from "../application/billing.service";
import { billingIdParamSchema } from "../domain/schemas/billing.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("billing-invoices")
@Controller("hotels")
export class InvoiceController {
  constructor(private readonly billingService: BillingService) {}

  @SuccessMessage("Lấy chi tiết invoice thành công")
  @ApiDescript("Xem chi tiết hóa đơn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "invoiceId", type: String })
  @ApiOkResponse({ description: "Chi tiết invoice" })
  @Get(":hotelId/invoices/:invoiceId")
  async getInvoiceDetail(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("invoiceId") invoiceIdParam: string,
  ) {
    const hotelId = parseWithZod(billingIdParamSchema, hotelIdParam);
    const invoiceId = parseWithZod(billingIdParamSchema, invoiceIdParam);

    return this.billingService.getInvoiceDetail(
      request.user.userId,
      request.user.roleId,
      hotelId,
      invoiceId,
    );
  }
}
