import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { StripeWebhookController } from "./api/stripe-webhook.controller";
import { LocalMatePaymentsService } from "./application/localmate-payments.service";
import { StripeWebhookService } from "./application/stripe-webhook.service";
import { StripeReconciliationService } from "./application/stripe-reconciliation.service";
import { StripeClient } from "./infrastructure/stripe-client";
import { StripeSignatureVerifier } from "./infrastructure/stripe-signature.verifier";

@Module({
  imports: [PrismaModule],
  controllers: [StripeWebhookController],
  providers: [
    LocalMatePaymentsService,
    StripeWebhookService,
    StripeReconciliationService,
    StripeClient,
    StripeSignatureVerifier,
  ],
  exports: [
    LocalMatePaymentsService,
    StripeWebhookService,
    StripeReconciliationService,
    StripeClient,
    StripeSignatureVerifier,
  ],
})
export class LocalMatePaymentsModule {}
