import { Global, Module } from "@nestjs/common";
import { WinstonModule } from "nest-winston";
import { winstonInstance } from "./winston.config";
import { AppLogger } from "./app-logger.service";

@Global()
@Module({
  imports: [
    WinstonModule.forRoot({
      instance: winstonInstance,
    }),
  ],
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggingModule {}
