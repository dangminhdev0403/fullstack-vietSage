-- CreateEnum
CREATE TYPE "UserRoleStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "UserRole"
ADD COLUMN "status" "UserRoleStatus",
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "revokedById" TEXT;

-- Backfill existing rows as active memberships
UPDATE "UserRole"
SET "status" = 'ACTIVE'
WHERE "status" IS NULL;

-- Enforce non-null status and default for new rows
ALTER TABLE "UserRole"
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- Add read-optimized indexes for active membership checks
CREATE INDEX "UserRole_userId_status_idx" ON "UserRole"("userId", "status");
CREATE INDEX "UserRole_roleId_status_idx" ON "UserRole"("roleId", "status");
