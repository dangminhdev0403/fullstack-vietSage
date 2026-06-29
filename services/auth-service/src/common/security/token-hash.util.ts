import { createHash, randomBytes } from "node:crypto";

export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashOpaqueToken(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex");
}

export function addHours(value: Date, hours: number): Date {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}
