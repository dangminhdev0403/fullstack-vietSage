CREATE TYPE "HotelStaffAssignmentStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "HotelStaffAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "status" "HotelStaffAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HotelStaffAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HotelStaffAssignment_userId_hotelId_key"
ON "HotelStaffAssignment"("userId", "hotelId");

CREATE INDEX "HotelStaffAssignment_userId_status_idx"
ON "HotelStaffAssignment"("userId", "status");

CREATE INDEX "HotelStaffAssignment_hotelId_status_idx"
ON "HotelStaffAssignment"("hotelId", "status");

ALTER TABLE "HotelStaffAssignment"
ADD CONSTRAINT "HotelStaffAssignment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HotelStaffAssignment"
ADD CONSTRAINT "HotelStaffAssignment_hotelId_fkey"
FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HotelStaffAssignment"
ADD CONSTRAINT "HotelStaffAssignment_assignedById_fkey"
FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HotelStaffAssignment"
ADD CONSTRAINT "HotelStaffAssignment_revokedById_fkey"
FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (manual, local/preview only):
-- DROP TABLE "HotelStaffAssignment";
-- DROP TYPE "HotelStaffAssignmentStatus";
