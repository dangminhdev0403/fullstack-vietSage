-- Prepared only. Apply separately before running the updated application,
-- including when KBTT_STAY_LIFECYCLE_ENABLED is false (initial submissions use submittedCsltId).
-- Legacy declarations keep NULL provenance; never infer it from today's connection.
ALTER TABLE "KbttGuestDeclaration" ADD COLUMN "submittedCsltId" VARCHAR(32);
CREATE INDEX "KbttGuestDeclaration_submittedCsltId_declarationKind_status_idx"
    ON "KbttGuestDeclaration"("submittedCsltId", "declarationKind", "status");

CREATE TYPE "KbttStayOperationKind" AS ENUM ('EXTEND', 'CHECKOUT', 'RECOVER');
CREATE TYPE "KbttStayOperationStatus" AS ENUM ('PENDING', 'SENDING', 'SUCCEEDED', 'REJECTED', 'UNKNOWN', 'BLOCKED', 'SUPERSEDED');

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

CREATE UNIQUE INDEX "KbttStayOperation_deduplicationKey_key" ON "KbttStayOperation"("deduplicationKey");
CREATE INDEX "KbttStayOperation_status_updatedAt_idx" ON "KbttStayOperation"("status", "updatedAt");
CREATE INDEX "KbttStayOperation_hotelId_stayId_occupantId_idx" ON "KbttStayOperation"("hotelId", "stayId", "occupantId");
CREATE INDEX "KbttStayOperation_csltId_identityKey_status_idx" ON "KbttStayOperation"("csltId", "identityKey", "status");
CREATE INDEX "KbttStayOperation_sourceEventId_idx" ON "KbttStayOperation"("sourceEventId");

ALTER TABLE "KbttStayOperation" ADD CONSTRAINT "KbttStayOperation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KbttStayOperation" ADD CONSTRAINT "KbttStayOperation_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "GuestStay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KbttStayOperation" ADD CONSTRAINT "KbttStayOperation_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "GuestStayOccupant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KbttStayOperation" ADD CONSTRAINT "KbttStayOperation_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "KbttGuestDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "KbttDeliveryLease" (
    "csltId" VARCHAR(32) NOT NULL,
    "ownerToken" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KbttDeliveryLease_pkey" PRIMARY KEY ("csltId")
);

CREATE TABLE "KbttStayEventReceipt" (
    "eventId" TEXT NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KbttStayEventReceipt_pkey" PRIMARY KEY ("eventId"),
    CONSTRAINT "KbttStayEventReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "DomainEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
