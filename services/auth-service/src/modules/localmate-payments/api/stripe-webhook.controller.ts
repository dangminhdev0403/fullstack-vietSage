import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { StripeWebhookService } from "../application/stripe-webhook.service";
import type { WebhookProcessingResult } from "../domain/localmate-payment.dto";

@Controller()
export class StripeWebhookController {
  constructor(private readonly webhookService: StripeWebhookService) {}

  @Post(["webhooks/stripe", "payments/webhook/stripe"])
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers("stripe-signature") signatureHeader: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<WebhookProcessingResult> {
    const rawBody = req.rawBody;

    if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      throw new BadRequestException(
        "Exact raw body buffer is required for Stripe webhook signature verification",
      );
    }

    return this.webhookService.handleWebhook(rawBody, signatureHeader);
  }
}
