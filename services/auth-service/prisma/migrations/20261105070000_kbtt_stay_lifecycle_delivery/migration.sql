-- Prepared only. Apply separately before running the updated application,
-- including when KBTT_STAY_LIFECYCLE_ENABLED is false (initial submissions use submittedCsltId).
-- Legacy declarations keep NULL provenance; never infer it from today's connection.
-- CreateEnum
CREATE TYPE "KbttStayOperationKind" AS ENUM ('EXTEND', 'CHECKOUT', 'RECOVER');

-- CreateEnum
CREATE TYPE "KbttStayOperationStatus" AS ENUM ('PENDING', 'SENDING', 'SUCCEEDED', 'REJECTED', 'UNKNOWN', 'BLOCKED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "KbttGuestDeclaration" ADD COLUMN     "submittedCsltId" VARCHAR(32);

-- CreateTable
CREATE TABLE "KbttStayOperation" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "occupantId" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "csltId" VARCHAR(32) NOT NULL,
    "identityKey" VARCHAR(64) NOT NULL,
    "deduplicationKey" VARCHAR(240) NOT NULL,
    "declarationKind" "CitizenshipKind" NOT NULL,
    "kind" "KbttStayOperationKind" NOT NULL,
    "status" "KbttStayOperationStatus" NOT NULL DEFAULT 'PENDING',
    "desiredDepartureAt" TIMESTAMP(3),
    "wasOverdue" BOOLEAN NOT NULL DEFAULT false,
    "payloadJson" JSONB,
    "payloadFingerprint" VARCHAR(64),
    "providerCode" VARCHAR(64),
    "providerMessage" VARCHAR(500),
    "claimToken" VARCHAR(64),
    "attemptedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbttStayOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KbttDeliveryLease" (
    "csltId" VARCHAR(32) NOT NULL,
    "ownerToken" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbttDeliveryLease_pkey" PRIMARY KEY ("csltId")
);

-- CreateTable
CREATE TABLE "KbttStayEventReceipt" (
    "eventId" TEXT NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KbttStayEventReceipt_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "KbttStayOperation_deduplicationKey_key" ON "KbttStayOperation"("deduplicationKey");

-- CreateIndex
CREATE INDEX "KbttStayOperation_status_updatedAt_idx" ON "KbttStayOperation"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "KbttStayOperation_hotelId_stayId_occupantId_idx" ON "KbttStayOperation"("hotelId", "stayId", "occupantId");

-- CreateIndex
CREATE INDEX "KbttStayOperation_csltId_identityKey_status_idx" ON "KbttStayOperation"("csltId", "identityKey", "status");

-- CreateIndex
CREATE INDEX "KbttStayOperation_sourceEventId_idx" ON "KbttStayOperation"("sourceEventId");

-- CreateIndex
CREATE INDEX "KbttGuestDeclaration_submittedCsltId_declarationKind_status_idx" ON "KbttGuestDeclaration"("submittedCsltId", "declarationKind", "status");

-- AddForeignKey
ALTER TABLE "KbttStayOperation" ADD CONSTRAINT "KbttStayOperation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbttStayOperation" ADD CONSTRAINT "KbttStayOperation_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbttStayOperation" ADD CONSTRAINT "KbttStayOperation_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "GuestStayOccupant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbttStayOperation" ADD CONSTRAINT "KbttStayOperation_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "KbttGuestDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbttStayEventReceipt" ADD CONSTRAINT "KbttStayEventReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DomainEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
