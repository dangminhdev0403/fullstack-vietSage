import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PropertyModule } from "../property/property.module";
import { BillingRepository } from "./infrastructure/repositories/billing.repository";
import { BillingService } from "./application/billing.service";
import { FolioController } from "./api/folio.controller";
import { InvoiceController } from "./api/invoice.controller";
import { PaymentController } from "./api/payment.controller";

@Module({
  imports: [PrismaModule, PropertyModule],
  controllers: [FolioController, InvoiceController, PaymentController],
  providers: [BillingService, BillingRepository],
  exports: [BillingService],
})
export class BillingModule {}
