CREATE TYPE "AuthSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'COMPROMISED');
CREATE TYPE "AuthSessionRevokeReason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'USER_DISABLED', 'ROLE_CHANGED', 'REFRESH_TOKEN_REPLAYED', 'SESSION_REPLACED', 'SECURITY_EVENT', 'EXPIRED');

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "AuthSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentRefreshHash" VARCHAR(255) NOT NULL,
    "refreshFamilyId" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokeReason" "AuthSessionRevokeReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthRefreshTokenHistory" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthRefreshTokenHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthRefreshIdempotency" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "encryptedResult" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthRefreshIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthSession_currentRefreshHash_key" ON "AuthSession"("currentRefreshHash");
CREATE INDEX "AuthSession_userId_status_idx" ON "AuthSession"("userId", "status");
CREATE INDEX "AuthSession_refreshFamilyId_status_idx" ON "AuthSession"("refreshFamilyId", "status");
CREATE INDEX "AuthSession_status_idleExpiresAt_idx" ON "AuthSession"("status", "idleExpiresAt");
CREATE INDEX "AuthSession_status_absoluteExpiresAt_idx" ON "AuthSession"("status", "absoluteExpiresAt");
CREATE UNIQUE INDEX "AuthRefreshTokenHistory_tokenHash_key" ON "AuthRefreshTokenHistory"("tokenHash");
CREATE INDEX "AuthRefreshTokenHistory_sessionId_createdAt_idx" ON "AuthRefreshTokenHistory"("sessionId", "createdAt");
CREATE INDEX "AuthRefreshTokenHistory_expiresAt_idx" ON "AuthRefreshTokenHistory"("expiresAt");
CREATE INDEX "AuthRefreshIdempotency_expiresAt_idx" ON "AuthRefreshIdempotency"("expiresAt");
CREATE UNIQUE INDEX "AuthRefreshIdempotency_sessionId_idempotencyKey_key" ON "AuthRefreshIdempotency"("sessionId", "idempotencyKey");

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthRefreshTokenHistory" ADD CONSTRAINT "AuthRefreshTokenHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthRefreshIdempotency" ADD CONSTRAINT "AuthRefreshIdempotency_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
