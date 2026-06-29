import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ImportErrorReportService } from "./import-error-report.service";
import { ImportTemplateService } from "./import-template.service";
import { ImportRegistry } from "./import.registry";
import { ImportService } from "./import.service";

@Module({
  imports: [PrismaModule],
  providers: [ImportRegistry, ImportService, ImportTemplateService, ImportErrorReportService],
  exports: [ImportRegistry, ImportService, ImportTemplateService, ImportErrorReportService],
})
export class ImportModule {}
