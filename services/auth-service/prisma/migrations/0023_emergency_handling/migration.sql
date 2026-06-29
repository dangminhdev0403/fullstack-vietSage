CREATE TYPE "EmergencyLocationSource" AS ENUM ('GPS', 'QR', 'INVITE', 'HOST_SELECTED', 'GUEST_SELECTED', 'MANUAL_ADDRESS', 'TENANT_DEFAULT', 'IP_DERIVED', 'UNKNOWN');
CREATE TYPE "EmergencyLocationConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');
CREATE TYPE "EmergencyCallLifecycleStatus" AS ENUM ('ATTEMPTED', 'ROUTED', 'RINGING', 'CONNECTED', 'FAILED', 'ABANDONED', 'COMPLETED');
CREATE TYPE "EmergencyIncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "EmergencyIncidentStatus" AS ENUM ('OPEN', 'ESCALATING', 'ACKNOWLEDGED', 'MONITORING', 'RESOLVED', 'REOPENED');
CREATE TYPE "EmergencyNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'ACKNOWLEDGED');
CREATE TYPE "EmergencyNotificationType" AS ENUM ('INITIAL', 'SEVERITY_ESCALATION', 'ROOM_UPDATE', 'FAILURE', 'RESOLUTION', 'REOPENED');

CREATE TABLE "EmergencyLocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "hotelId" TEXT,
  "name" VARCHAR(160) NOT NULL,
  "dispatchableAddress" VARCHAR(500) NOT NULL,
  "building" VARCHAR(120),
  "floor" VARCHAR(40),
  "room" VARCHAR(80),
  "zone" VARCHAR(120),
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "providerValidationStatus" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  "providerLocationReference" VARCHAR(160),
  "effectiveStartAt" TIMESTAMP(3),
  "effectiveEndAt" TIMESTAMP(3),
  "usableForEmergencyRouting" BOOLEAN NOT NULL DEFAULT true,
  "assignableToGuests" BOOLEAN NOT NULL DEFAULT true,
  "lastValidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmergencyLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestLocationContext" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "emergencyLocationId" TEXT,
  "rawAddress" VARCHAR(500),
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "source" "EmergencyLocationSource" NOT NULL DEFAULT 'UNKNOWN',
  "confidence" "EmergencyLocationConfidence" NOT NULL DEFAULT 'UNKNOWN',
  "confirmedAt" TIMESTAMP(3),
  "explicitlyConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "stale" BOOLEAN NOT NULL DEFAULT false,
  "emergencyCallingAllowed" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestLocationContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyIncident" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "hotelId" TEXT,
  "primaryLocationId" TEXT,
  "building" VARCHAR(120),
  "floor" VARCHAR(40),
  "zone" VARCHAR(120),
  "status" "EmergencyIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "severity" "EmergencyIncidentSeverity" NOT NULL DEFAULT 'LOW',
  "callCount" INTEGER NOT NULL DEFAULT 0,
  "uniqueCallerCount" INTEGER NOT NULL DEFAULT 0,
  "uniqueRoomCount" INTEGER NOT NULL DEFAULT 0,
  "uniqueFloorCount" INTEGER NOT NULL DEFAULT 0,
  "connectedCallCount" INTEGER NOT NULL DEFAULT 0,
  "failedCallCount" INTEGER NOT NULL DEFAULT 0,
  "abandonedCallCount" INTEGER NOT NULL DEFAULT 0,
  "locationUncertain" BOOLEAN NOT NULL DEFAULT false,
  "providerDegraded" BOOLEAN NOT NULL DEFAULT false,
  "spamAbuseSuspicion" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolutionReason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmergencyIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyCallEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "hotelId" TEXT,
  "roomId" TEXT,
  "sessionId" TEXT,
  "incidentId" TEXT,
  "emergencyLocationId" TEXT,
  "sourceType" VARCHAR(40) NOT NULL,
  "callerReference" VARCHAR(160),
  "dialedNumber" VARCHAR(40) NOT NULL,
  "resolvedDispatchableLocation" VARCHAR(500),
  "locationSource" "EmergencyLocationSource" NOT NULL DEFAULT 'UNKNOWN',
  "locationConfidence" "EmergencyLocationConfidence" NOT NULL DEFAULT 'UNKNOWN',
  "callbackNumber" VARCHAR(40),
  "provider" VARCHAR(80),
  "providerCallId" VARCHAR(160),
  "lifecycleStatus" "EmergencyCallLifecycleStatus" NOT NULL DEFAULT 'ATTEMPTED',
  "spamRiskScore" INTEGER NOT NULL DEFAULT 0,
  "spamRiskLevel" VARCHAR(40) NOT NULL DEFAULT 'LOW',
  "locationUncertain" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "routedAt" TIMESTAMP(3),
  "connectedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "abandonedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmergencyCallEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyIncidentTimeline" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "eventType" VARCHAR(80) NOT NULL,
  "note" VARCHAR(1000),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyIncidentTimeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyNotification" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "callEventId" TEXT,
  "recipientGroup" VARCHAR(120) NOT NULL,
  "deliveryChannel" VARCHAR(80) NOT NULL,
  "status" "EmergencyNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "type" "EmergencyNotificationType" NOT NULL DEFAULT 'INITIAL',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmergencyNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmergencyLocation_tenantId_usableForEmergencyRouting_idx" ON "EmergencyLocation"("tenantId", "usableForEmergencyRouting");
CREATE INDEX "EmergencyLocation_hotelId_assignableToGuests_idx" ON "EmergencyLocation"("hotelId", "assignableToGuests");
CREATE INDEX "GuestLocationContext_sessionId_updatedAt_idx" ON "GuestLocationContext"("sessionId", "updatedAt");
CREATE INDEX "GuestLocationContext_tenantId_hotelId_idx" ON "GuestLocationContext"("tenantId", "hotelId");
CREATE INDEX "EmergencyIncident_tenantId_status_lastActivityAt_idx" ON "EmergencyIncident"("tenantId", "status", "lastActivityAt");
CREATE INDEX "EmergencyIncident_hotelId_status_lastActivityAt_idx" ON "EmergencyIncident"("hotelId", "status", "lastActivityAt");
CREATE INDEX "EmergencyCallEvent_tenantId_attemptedAt_idx" ON "EmergencyCallEvent"("tenantId", "attemptedAt");
CREATE INDEX "EmergencyCallEvent_hotelId_attemptedAt_idx" ON "EmergencyCallEvent"("hotelId", "attemptedAt");
CREATE INDEX "EmergencyCallEvent_incidentId_attemptedAt_idx" ON "EmergencyCallEvent"("incidentId", "attemptedAt");
CREATE INDEX "EmergencyCallEvent_providerCallId_idx" ON "EmergencyCallEvent"("providerCallId");
CREATE INDEX "EmergencyIncidentTimeline_incidentId_createdAt_idx" ON "EmergencyIncidentTimeline"("incidentId", "createdAt");
CREATE INDEX "EmergencyNotification_incidentId_status_idx" ON "EmergencyNotification"("incidentId", "status");
CREATE INDEX "EmergencyNotification_callEventId_idx" ON "EmergencyNotification"("callEventId");

ALTER TABLE "EmergencyLocation" ADD CONSTRAINT "EmergencyLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyLocation" ADD CONSTRAINT "EmergencyLocation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestLocationContext" ADD CONSTRAINT "GuestLocationContext_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestLocationContext" ADD CONSTRAINT "GuestLocationContext_emergencyLocationId_fkey" FOREIGN KEY ("emergencyLocationId") REFERENCES "EmergencyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyIncident" ADD CONSTRAINT "EmergencyIncident_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyIncident" ADD CONSTRAINT "EmergencyIncident_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyIncident" ADD CONSTRAINT "EmergencyIncident_primaryLocationId_fkey" FOREIGN KEY ("primaryLocationId") REFERENCES "EmergencyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyCallEvent" ADD CONSTRAINT "EmergencyCallEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyCallEvent" ADD CONSTRAINT "EmergencyCallEvent_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyCallEvent" ADD CONSTRAINT "EmergencyCallEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyCallEvent" ADD CONSTRAINT "EmergencyCallEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyCallEvent" ADD CONSTRAINT "EmergencyCallEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "EmergencyIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyCallEvent" ADD CONSTRAINT "EmergencyCallEvent_emergencyLocationId_fkey" FOREIGN KEY ("emergencyLocationId") REFERENCES "EmergencyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmergencyIncidentTimeline" ADD CONSTRAINT "EmergencyIncidentTimeline_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "EmergencyIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyNotification" ADD CONSTRAINT "EmergencyNotification_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "EmergencyIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyNotification" ADD CONSTRAINT "EmergencyNotification_callEventId_fkey" FOREIGN KEY ("callEventId") REFERENCES "EmergencyCallEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
