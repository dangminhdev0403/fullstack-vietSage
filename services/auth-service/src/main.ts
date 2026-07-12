import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { Server } from "http";
import { AddressInfo } from "net";
import * as os from "node:os";
import { configureApp } from "./app.bootstrap";
import { AppModule } from "./app.module";
import { loadAppConfig } from "./common/config/env.config";
import { AppLogger } from "./common/logging/app-logger.service";

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }

  return "localhost";
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = app.get(AppLogger);
  app.useWebSocketAdapter(new IoAdapter(app));
  configureApp(app);
  const config = loadAppConfig();
  app.enableShutdownHooks();
  await app.listen(config.port);

  const server = app.getHttpServer() as Server;
  const address = server.address() as AddressInfo | string;
  const host = typeof address === "string" ? address : address.address;
  const actualHost = host === "::" || host === "0.0.0.0" ? "localhost" : host;
  const ip = getLocalIp();

  logger.info("Application startup completed", {
    module: "bootstrap",
    service: "NestApplication",
    operation: "listen",
    event: "APPLICATION_STARTUP",
    port: config.port,
    localUrl: `http://${actualHost}:${config.port}`,
    lanUrl: `http://${ip}:${config.port}`,
    loadedModules: [
      "HealthModule",
      "PrismaModule",
      "IdentityModule",
      "TenantOwnersModule",
      "PropertyModule",
      "CodesModule",
      "BillingModule",
      "GuestOperationsModule",
      "EmergencyModule",
    ],
    connectedServices: ["postgres", "socket.io"],
  });

  process.once("SIGINT", () => {
    logger.info("Graceful shutdown requested", {
      module: "bootstrap",
      service: "NestApplication",
      operation: "shutdown",
      event: "APPLICATION_SHUTDOWN_REQUESTED",
      signal: "SIGINT",
    });
  });
  process.once("SIGTERM", () => {
    logger.info("Graceful shutdown requested", {
      module: "bootstrap",
      service: "NestApplication",
      operation: "shutdown",
      event: "APPLICATION_SHUTDOWN_REQUESTED",
      signal: "SIGTERM",
    });
  });
}

bootstrap().catch((error) => {
  console.error("BOOTSTRAP_FAILED", error);
  process.exitCode = 1;
});
