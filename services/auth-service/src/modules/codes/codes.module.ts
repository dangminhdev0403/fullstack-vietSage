import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { CodesRepository } from "./codes.repository";
import { CodesService } from "./codes.service";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [CodesService, CodesRepository],
  exports: [CodesService],
})
export class CodesModule {}
