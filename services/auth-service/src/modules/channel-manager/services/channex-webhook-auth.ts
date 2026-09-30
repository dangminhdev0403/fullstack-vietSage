import { createHash, timingSafeEqual } from "crypto";
import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";

export function assertChannexWebhookSecret(providedSecret?: string): void {
  const expectedSecret = process.env.CHANNEX_WEBHOOK_SECRET;
  if (!expectedSecret || expectedSecret.length < 32) {
    throw new ServiceUnavailableException("Channex webhook is not configured");
  }

  const expectedHash = createHash("sha256").update(expectedSecret).digest();
  const providedHash = createHash("sha256")
    .update(providedSecret ?? "")
    .digest();
  if (!timingSafeEqual(expectedHash, providedHash)) {
    throw new ForbiddenException("Invalid Channex webhook secret");
  }
}
