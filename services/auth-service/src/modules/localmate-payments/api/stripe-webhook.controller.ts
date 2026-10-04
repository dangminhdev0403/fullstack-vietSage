import {
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
    const rawBody =
      req.rawBody ??
      (Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === "string"
              ? req.body
              : JSON.stringify(req.body || {}),
            "utf8",
          ));

    return this.webhookService.handleWebhook(rawBody, signatureHeader);
  }
}
