import { createHash } from "node:crypto";

export function createRefreshIdempotencyKey(refreshToken: string): string {
  return createHash("sha256").update(`vietsage:refresh:${refreshToken}`).digest("hex");
}
