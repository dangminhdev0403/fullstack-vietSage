import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PropertyModule } from "../property/property.module";
import { BillingRepository } from "./billing.repository";
import { BillingService } from "./billing.service";
import { FolioController } from "./folio.controller";
import { InvoiceController } from "./invoice.controller";
import { PaymentController } from "./payment.controller";

@Module({
  imports: [PrismaModule, PropertyModule],
  controllers: [FolioController, InvoiceController, PaymentController],
  providers: [BillingService, BillingRepository],
  exports: [BillingService, BillingRepository],
})
export class BillingModule {}
