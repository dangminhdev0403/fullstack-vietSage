import { createHash, createHmac, timingSafeEqual } from "crypto";
import { BadRequestException } from "@nestjs/common";
import type { Request } from "express";

export function getDirectBookingSecret(): string {
  return (
    process.env.VIETSAGE_HMAC_SECRET ||
    process.env.VIETSAGE_PARTNER_API_KEY ||
    "vietsage_dev_partner_secret"
  );
}

export function computeDirectBookingCanonicalPayload(
  method: string,
  path: string,
  timestamp: number,
  requestId: string,
  body: unknown,
): string {
  const bodyString =
    body === null || body === undefined
      ? ""
      : typeof body === "string"
        ? body
        : JSON.stringify(body);

  const bodyHash = createHash("sha256").update(bodyString, "utf8").digest("hex");
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${requestId}\n${bodyHash}`;
}

export function signDirectBookingPayload(canonical: string, secret: string): string {
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

export interface DirectBookingHmacVerifyOptions {
  toleranceSeconds?: number;
  currentTimestamp?: number;
}

export function assertDirectBookingHmac(
  req: Request,
  options?: DirectBookingHmacVerifyOptions,
): boolean {
  const secret = getDirectBookingSecret();
  if (!secret || secret.trim().length === 0) {
    throw new BadRequestException("VietSage HMAC secret is not configured");
  }

  const rawSig = req.headers["x-signature"];
  const rawSigV1 = req.headers["x-signature-v1"];
  const rawTimestamp = req.headers["x-timestamp"];
  const rawRequestId = req.headers["x-request-id"];

  const signatureHeader = typeof rawSig === "string" ? rawSig : "";
  const signatureV1Header = typeof rawSigV1 === "string" ? rawSigV1 : "";
  const requestId = typeof rawRequestId === "string" ? rawRequestId : "";

  let timestamp: number | undefined =
    typeof rawTimestamp === "string" ? parseInt(rawTimestamp, 10) : undefined;

  const candidateSignatures: string[] = [];

  if (signatureV1Header.trim().length > 0) {
    candidateSignatures.push(signatureV1Header.trim());
  }

  if (signatureHeader.includes("v1=")) {
    const parts = signatureHeader.split(",");
    for (const part of parts) {
      const [key, ...valParts] = part.trim().split("=");
      const val = valParts.join("=");
      if (key === "t") {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed)) {
          timestamp = parsed;
        }
      } else if (key === "v1" && val.length > 0) {
        candidateSignatures.push(val);
      }
    }
  } else if (signatureHeader.trim().length > 0) {
    candidateSignatures.push(signatureHeader.trim());
  }

  if (candidateSignatures.length === 0) {
    throw new BadRequestException("Missing VietSage signature header");
  }

  if (timestamp === undefined || isNaN(timestamp)) {
    throw new BadRequestException(
      "Missing or invalid timestamp for VietSage signature verification",
    );
  }

  const toleranceSeconds = options?.toleranceSeconds ?? 300;
  const currentTimestamp = options?.currentTimestamp ?? Math.floor(Date.now() / 1000);
  const drift = Math.abs(currentTimestamp - timestamp);

  if (drift > toleranceSeconds) {
    throw new BadRequestException("VietSage request timestamp drift exceeds tolerance window");
  }

  // Derive candidate paths to support both /channel-manager/... and /api/v1/channel-manager/...
  const pathsToCheck = new Set<string>();
  const originalUrl = req.originalUrl || req.url || "";
  if (originalUrl) {
    pathsToCheck.add(originalUrl);
    pathsToCheck.add(originalUrl.replace(/^\/api\/v1/, ""));
  }

  const reqPath = req.path || "";
  if (reqPath) {
    pathsToCheck.add(reqPath);
    pathsToCheck.add(reqPath.replace(/^\/api\/v1/, ""));
  }

  // Body representation for HMAC
  const body = req.body;

  for (const p of pathsToCheck) {
    const canonical = computeDirectBookingCanonicalPayload(
      req.method,
      p,
      timestamp,
      requestId,
      body,
    );
    const expectedHex = signDirectBookingPayload(canonical, secret);
    const expectedBuffer = Buffer.from(expectedHex, "hex");

    for (const candidate of candidateSignatures) {
      try {
        const candidateBuffer = Buffer.from(candidate, "hex");
        if (
          candidateBuffer.length === expectedBuffer.length &&
          timingSafeEqual(candidateBuffer, expectedBuffer)
        ) {
          return true;
        }
      } catch {
        // Skip invalid hex string candidate
      }
    }
  }

  throw new BadRequestException("VietSage HMAC signature verification failed");
}
