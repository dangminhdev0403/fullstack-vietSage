CREATE TABLE "BiometricWorkstationPairing" (
  "id" TEXT NOT NULL,
  "codeHash" CHAR(64) NOT NULL,
  "hotelId" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BiometricWorkstationPairing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BiometricWorkstation" (
  "id" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "hotelId" TEXT NOT NULL,
  "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "BiometricWorkstation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BiometricWorkstationPairing_codeHash_key" ON "BiometricWorkstationPairing"("codeHash");
CREATE INDEX "BiometricWorkstationPairing_hotelId_expiresAt_idx" ON "BiometricWorkstationPairing"("hotelId", "expiresAt");
CREATE UNIQUE INDEX "BiometricWorkstation_tokenHash_key" ON "BiometricWorkstation"("tokenHash");
CREATE INDEX "BiometricWorkstation_hotelId_revokedAt_expiresAt_lastSeenAt_idx" ON "BiometricWorkstation"("hotelId", "revokedAt", "expiresAt", "lastSeenAt");

ALTER TABLE "BiometricWorkstationPairing"
  ADD CONSTRAINT "BiometricWorkstationPairing_hotelId_fkey"
  FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BiometricWorkstation"
  ADD CONSTRAINT "BiometricWorkstation_hotelId_fkey"
  FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
