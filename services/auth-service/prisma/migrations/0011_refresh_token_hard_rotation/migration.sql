-- Refresh tokens are now hard-deleted or rotated in place instead of soft-revoked.
DROP INDEX IF EXISTS "RefreshToken_userId_status_idx";

ALTER TABLE "RefreshToken"
DROP COLUMN IF EXISTS "status",
DROP COLUMN IF EXISTS "revokedAt";

DROP TYPE IF EXISTS "TokenStatus";

CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
