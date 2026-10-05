import { BadRequestException, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { STRIPE_WEBHOOK_TOLERANCE_SECONDS } from "../domain/localmate-payment.constants";

export interface VerifySignatureOptions {
  rawBody: Buffer | string;
  signatureHeader?: string | null;
  secret: string;
  toleranceSeconds?: number;
  currentTimestamp?: number;
}

export interface VerifySignatureResult {
  verified: boolean;
  timestamp: number;
}

@Injectable()
export class StripeSignatureVerifier {
  verify(options: VerifySignatureOptions): VerifySignatureResult {
    const {
      rawBody,
      signatureHeader,
      secret,
      toleranceSeconds = STRIPE_WEBHOOK_TOLERANCE_SECONDS,
      currentTimestamp = Math.floor(Date.now() / 1000),
    } = options;

    if (!secret || secret.trim().length === 0) {
      throw new BadRequestException("Stripe webhook secret is not configured");
    }

    if (!signatureHeader || signatureHeader.trim().length === 0) {
      throw new BadRequestException("Missing Stripe-Signature header");
    }

    const rawBodyBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(typeof rawBody === "string" ? rawBody : "", "utf8");

    if (rawBodyBuffer.length === 0) {
      throw new BadRequestException("Empty request body for webhook signature verification");
    }

    const parts = signatureHeader.split(",");
    let timestamp: number | null = null;
    const v1Signatures: string[] = [];

    for (const part of parts) {
      const [key, ...valueParts] = part.trim().split("=");
      const val = valueParts.join("=");
      if (key === "t") {
        const parsed = Number.parseInt(val, 10);
        if (!Number.isNaN(parsed)) {
          timestamp = parsed;
        }
      } else if (key === "v1" && val.length > 0) {
        v1Signatures.push(val);
      }
    }

    if (timestamp === null) {
      throw new BadRequestException(
        "Malformed Stripe-Signature header: missing or invalid timestamp",
      );
    }

    if (v1Signatures.length === 0) {
      throw new BadRequestException("Malformed Stripe-Signature header: no v1 signature found");
    }

    const drift = Math.abs(currentTimestamp - timestamp);
    if (drift > toleranceSeconds) {
      throw new BadRequestException(
        "Stripe webhook signature timestamp drift exceeds tolerance window",
      );
    }

    const signedPayload = `${timestamp}.${rawBodyBuffer.toString("utf8")}`;
    const expectedHex = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
    const expectedBuffer = Buffer.from(expectedHex, "hex");

    for (const signature of v1Signatures) {
      try {
        const candidateBuffer = Buffer.from(signature, "hex");
        if (
          candidateBuffer.length === expectedBuffer.length &&
          timingSafeEqual(candidateBuffer, expectedBuffer)
        ) {
          return { verified: true, timestamp };
        }
      } catch {
        // Invalid hex or format; continue checking other signatures
      }
    }

    throw new BadRequestException("Stripe signature verification failed: invalid signature");
  }
}
